import {
  KitEventType,
  Networks,
  StellarWalletsKit,
  type ISupportedWallet,
} from '@creit.tech/stellar-wallets-kit';
import { AlbedoModule, ALBEDO_ID } from '@creit.tech/stellar-wallets-kit/modules/albedo';
import { FreighterModule, FREIGHTER_ID } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { XBULL_ID, xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull';

export interface WalletOption {
  id: string;
  name: string;
  icon: string;
}

/** The three wallets surfaced by the connect UI (multi-wallet, not single-provider). */
export const WALLET_OPTIONS: WalletOption[] = [
  { id: FREIGHTER_ID, name: 'Freighter', icon: '🦊' },
  { id: XBULL_ID, name: 'xBull', icon: '🐂' },
  { id: ALBEDO_ID, name: 'Albedo', icon: '🔐' },
];

let initialized = false;

export function initWalletKit(): void {
  if (initialized) return;
  StellarWalletsKit.init({
    modules: [new FreighterModule(), new xBullModule(), new AlbedoModule()],
    selectedWalletId: FREIGHTER_ID,
    network: Networks.TESTNET,
  });
  initialized = true;
}

/** Selects a wallet module and requests its public key. */
export async function connectWallet(walletId: string): Promise<string> {
  StellarWalletsKit.setWallet(walletId);
  const { address } = await StellarWalletsKit.fetchAddress();
  return address;
}

/** Returns the currently-connected address, or throws if none is connected. */
export async function getWalletAddress(): Promise<string> {
  const { address } = await StellarWalletsKit.getAddress();
  return address;
}

export async function disconnectWallet(): Promise<void> {
  await StellarWalletsKit.disconnect();
}

/** Checks which of the configured wallets are installed/available. */
export async function getAvailableWallets(): Promise<ISupportedWallet[]> {
  return StellarWalletsKit.refreshSupportedWallets();
}

/** Subscribes to wallet connection state changes; returns an unsubscribe fn. */
export function onWalletStateChanged(
  callback: (address: string | undefined) => void,
): () => void {
  return StellarWalletsKit.on(KitEventType.STATE_UPDATED, (event) =>
    callback(event.payload.address),
  );
}

/** Signs a transaction XDR with the connected wallet (SEP-43). */
export async function signTransaction(
  xdr: string,
  address: string,
): Promise<string> {
  const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
    networkPassphrase: Networks.TESTNET,
    address,
  });
  return signedTxXdr;
}
