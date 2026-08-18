import { useState, type FormEvent } from 'react';
import { STROOPS_PER_XLM } from '../config';
import { useToasts } from './Toasts';

interface Props {
  address: string | null;
  balance: bigint | null;
  busy: boolean;
  onSubmit: (to: string, amountStroops: bigint, memo: string) => void;
  onDeposit: (amountStroops: bigint) => void;
}

function formatBalance(stroops: bigint | null): string {
  if (stroops === null) return '—';
  return (Number(stroops) / STROOPS_PER_XLM).toLocaleString(undefined, {
    maximumFractionDigits: 7,
  });
}

export function PaymentForm({
  address,
  balance,
  busy,
  onSubmit,
  onDeposit,
}: Props) {
  const { pushToast } = useToasts();
  const [recipient, setRecipient] = useState('');
  const [amountXlm, setAmountXlm] = useState('');
  const [memo, setMemo] = useState('');

  function parseAmount(): bigint | null {
    const value = Number(amountXlm);
    if (!Number.isFinite(value) || value <= 0) return null;
    return BigInt(Math.round(value * STROOPS_PER_XLM));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!address) {
      pushToast('Connect a wallet before sending a payment.', 'error');
      return;
    }
    if (!recipient.trim()) {
      pushToast('Enter a recipient address.', 'error');
      return;
    }
    const amount = parseAmount();
    if (amount === null || amount <= 0n) {
      pushToast('Enter an amount greater than zero.', 'error');
      return;
    }
    onSubmit(recipient.trim(), amount, memo.trim());
  }

  function handleDeposit() {
    if (!address) {
      pushToast('Connect a wallet before topping up.', 'error');
      return;
    }
    const amount = parseAmount();
    if (amount === null || amount <= 0n) {
      pushToast('Enter a top-up amount greater than zero.', 'error');
      return;
    }
    onDeposit(amount);
  }

  return (
    <form className="payment-form" onSubmit={handleSubmit}>
      <div className="balance-row">
        <span className="muted">Tracked balance</span>
        <span className="balance-value">{formatBalance(balance)} XLM</span>
      </div>

      <label className="field">
        <span>Recipient address</span>
        <input
          type="text"
          value={recipient}
          placeholder="G…"
          onChange={(event) => setRecipient(event.target.value)}
          disabled={busy}
        />
      </label>

      <label className="field">
        <span>Amount (XLM)</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.0000001"
          value={amountXlm}
          placeholder="0.0"
          onChange={(event) => setAmountXlm(event.target.value)}
          disabled={busy}
        />
      </label>

      <label className="field">
        <span>Memo</span>
        <input
          type="text"
          value={memo}
          placeholder="What's it for? (optional)"
          onChange={(event) => setMemo(event.target.value)}
          disabled={busy}
        />
      </label>

      <div className="form-actions">
        <button className="btn btn--primary" type="submit" disabled={busy || !address}>
          {busy ? 'Submitting…' : 'Send payment'}
        </button>
        <button
          className="btn btn--secondary"
          type="button"
          onClick={handleDeposit}
          disabled={busy || !address}
        >
          Top up balance
        </button>
      </div>
    </form>
  );
}
