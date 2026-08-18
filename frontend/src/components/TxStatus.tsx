import { EXPLORER_TX_URL } from '../config';
import type { TrackedTx } from '../lib/contract';
import { errorMessageForCode } from '../lib/errors';

export function TxStatus({ tx }: { tx: TrackedTx | null }) {
  if (!tx || tx.phase === 'idle') {
    return <div className="tx-status is-pending">Pending — awaiting submission.</div>;
  }

  if (tx.phase === 'submitting') {
    return (
      <div className="tx-status is-submitting">
        <span className="spinner" aria-hidden="true" />
        Submitting transaction…
      </div>
    );
  }

  if (tx.phase === 'confirmed') {
    return (
      <div className="tx-status is-confirmed">
        <span className="status-badge">✓</span>
        <span>Confirmed</span>
        {tx.resultValue !== undefined && (
          <span className="muted">result: {tx.resultValue}</span>
        )}
        {tx.hash && (
          <a
            className="explorer-link"
            href={`${EXPLORER_TX_URL}${tx.hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View on Stellar Expert ↗
          </a>
        )}
      </div>
    );
  }

  // phase === 'failed'
  const message =
    tx.errorCode !== undefined
      ? errorMessageForCode(tx.errorCode)
      : tx.errorMessage ?? 'Transaction failed.';
  return (
    <div className="tx-status is-failed">
      <span className="status-badge">✕</span>
      <span>Failed</span>
      <span className="muted">{message}</span>
      {tx.hash && (
        <a
          className="explorer-link"
          href={`${EXPLORER_TX_URL}${tx.hash}`}
          target="_blank"
          rel="noreferrer"
        >
          View on Stellar Expert ↗
        </a>
      )}
    </div>
  );
}
