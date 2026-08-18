/**
 * Maps each `#[contracterror]` variant to a distinct, human-readable message.
 * The numeric codes match the `#[repr(u32)]` discriminants in the contract:
 *
 *   1 -> InsufficientBalance
 *   2 -> InvalidRecipient
 *   3 -> AmountTooSmall
 *   4 -> PaymentNotFound
 */
export const CONTRACT_ERROR_MESSAGES: Record<number, string> = {
  1: 'Insufficient balance — top up your tracked balance before sending this amount.',
  2: 'Invalid recipient — you cannot send a payment to yourself.',
  3: 'Amount too small — the amount must be greater than zero.',
  4: 'Payment not found — no payment exists with that id.',
};

export function errorMessageForCode(code: number): string {
  return (
    CONTRACT_ERROR_MESSAGES[code] ?? `Unknown contract error (#${code}).`
  );
}

/**
 * Extracts the numeric contract error code from a Soroban host error string of
 * the form `HostError: Error(Contract, #N)`. Returns `null` when the error is
 * not a `#[contracterror]` failure.
 */
export function parseContractErrorCode(hostError: string): number | null {
  const match = /Error\(Contract,\s*#(\d+)\)/.exec(hostError);
  return match ? Number(match[1]) : null;
}
