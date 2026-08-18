import { useEffect, useState } from 'react';
import { getAvailableWallets, WALLET_OPTIONS } from '../lib/wallet';

interface Props {
  address: string | null;
  connecting: boolean;
  onConnect: (walletId: string) => void;
  onDisconnect: () => void;
}

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletConnect({
  address,
  connecting,
  onConnect,
  onDisconnect,
}: Props) {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<Record<string, boolean>>({});

  useEffect(() => {
    getAvailableWallets()
      .then((wallets) => {
        const map: Record<string, boolean> = {};
        for (const wallet of wallets) map[wallet.id] = wallet.isAvailable;
        setAvailable(map);
      })
      .catch(() => {
        /* availability is advisory only; ignore errors */
      });
  }, []);

  if (address) {
    return (
      <div className="wallet-connected">
        <span className="wallet-dot" aria-hidden="true" />
        <span className="wallet-address" title={address}>
          {shorten(address)}
        </span>
        <button className="btn btn--ghost" onClick={onDisconnect}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="wallet-connect">
      <button
        className="btn btn--primary"
        onClick={() => setOpen((value) => !value)}
        disabled={connecting}
      >
        {connecting ? 'Connecting…' : 'Connect wallet'}
      </button>

      {open && (
        <div className="wallet-menu">
          <p className="wallet-menu-title">Choose a wallet</p>
          {WALLET_OPTIONS.map((wallet) => (
            <button
              key={wallet.id}
              className="wallet-option"
              onClick={() => onConnect(wallet.id)}
              disabled={connecting}
            >
              <span className="wallet-icon" aria-hidden="true">
                {wallet.icon}
              </span>
              <span className="wallet-name">{wallet.name}</span>
              <span
                className={`wallet-status ${
                  available[wallet.id] ? 'is-available' : 'is-missing'
                }`}
              >
                {available[wallet.id] ? 'detected' : 'install'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
