import { useCallback, useEffect, useState } from 'react';
import { ActivityFeed } from './components/ActivityFeed';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PaymentForm } from './components/PaymentForm';
import { TxStatus } from './components/TxStatus';
import { useToasts } from './components/Toasts';
import { WalletConnect } from './components/WalletConnect';
import { CONTRACT_ID, EXPLORER_CONTRACT_URL } from './config';
import {
  getBalance,
  submitDeposit,
  submitRecordPayment,
  type TrackedTx,
} from './lib/contract';
import {
  connectWallet,
  disconnectWallet,
  initWalletKit,
} from './lib/wallet';

export default function App() {
  const { pushToast } = useToasts();
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [tx, setTx] = useState<TrackedTx | null>(null);
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);

  useEffect(() => {
    initWalletKit();
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!address) return;
    try {
      setBalance(await getBalance(address));
    } catch {
      /* balance is non-critical; leave as-is */
    }
  }, [address]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  const handleConnect = useCallback(
    async (walletId: string) => {
      setConnecting(true);
      try {
        const connected = await connectWallet(walletId);
        setAddress(connected);
        pushToast(`Connected ${connected.slice(0, 6)}…${connected.slice(-4)}`, 'success');
      } catch (error) {
        pushToast(
          error instanceof Error ? error.message : 'Failed to connect wallet.',
          'error',
        );
      } finally {
        setConnecting(false);
      }
    },
    [pushToast],
  );

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnectWallet();
    } catch {
      /* ignore */
    }
    setAddress(null);
    setBalance(null);
    pushToast('Wallet disconnected.', 'info');
  }, [pushToast]);

  const handleSubmit = useCallback(
    (to: string, amountStroops: bigint, memo: string) => {
      if (!address) return;
      setTx({ phase: 'submitting' });
      void submitRecordPayment(address, to, amountStroops, memo, (update) => {
        setTx((previous) => ({ ...(previous ?? { phase: 'idle' }), ...update }));
        if (update.phase === 'confirmed') {
          pushToast('Payment confirmed on-chain.', 'success');
          void refreshBalance();
          setFeedRefreshKey((key) => key + 1);
        } else if (update.phase === 'failed') {
          pushToast(update.errorMessage ?? 'Payment failed.', 'error');
        }
      });
    },
    [address, pushToast, refreshBalance],
  );

  const handleDeposit = useCallback(
    (amountStroops: bigint) => {
      if (!address) return;
      setTx({ phase: 'submitting' });
      void submitDeposit(address, amountStroops, (update) => {
        setTx((previous) => ({ ...(previous ?? { phase: 'idle' }), ...update }));
        if (update.phase === 'confirmed') {
          pushToast('Balance topped up.', 'success');
          void refreshBalance();
        } else if (update.phase === 'failed') {
          pushToast(update.errorMessage ?? 'Top-up failed.', 'error');
        }
      });
    },
    [address, pushToast, refreshBalance],
  );

  return (
    <ErrorBoundary>
      <div className="app">
        <header className="app-header">
          <div>
            <h1>Multi-Wallet Payment Tracker</h1>
            <p className="muted">
              Send payments to anyone on Stellar testnet and watch them settle in
              real time.
            </p>
            <a
              className="explorer-link"
              href={`${EXPLORER_CONTRACT_URL}${CONTRACT_ID}`}
              target="_blank"
              rel="noreferrer"
            >
              Contract {CONTRACT_ID.slice(0, 10)}… ↗
            </a>
          </div>
          <WalletConnect
            address={address}
            connecting={connecting}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
        </header>

        <main className="app-main">
          <section className="panel">
            <h2>Send a payment</h2>
            <PaymentForm
              address={address}
              balance={balance}
              busy={tx?.phase === 'submitting'}
              onSubmit={handleSubmit}
              onDeposit={handleDeposit}
            />
            <TxStatus tx={tx} />
          </section>

          <ActivityFeed refreshKey={feedRefreshKey} />
        </main>
      </div>
    </ErrorBoundary>
  );
}
