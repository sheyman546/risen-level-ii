import {
  BASE_FEE,
  Address,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  type xdr,
} from '@stellar/stellar-sdk';
import { CONTRACT_ID, NETWORK_PASSPHRASE, RPC_URL } from '../config';
import { errorMessageForCode, parseContractErrorCode } from './errors';
import { signTransaction } from './wallet';

export const server = new rpc.Server(RPC_URL, { allowHttp: true });
const contract = new Contract(CONTRACT_ID);

/** Any funded testnet account, used only as a fee-payer placeholder for
 * read-only simulations (get_balance / list_payments / get_payment). */
const READ_SOURCE = 'GBFROEZUWZEVYOFUYIEJPS3EWYOE7HSUOUQRC4XN7HIYTRR2YWMPS5QB';

export interface Payment {
  id: bigint;
  from: string;
  to: string;
  amount: bigint;
  memo: string;
  timestamp: bigint;
}

export interface FeedEvent extends Payment {
  txHash: string;
  ledger: number;
  inSuccessfulContractCall: boolean;
}

export type TxPhase = 'idle' | 'submitting' | 'confirmed' | 'failed';

export interface TrackedTx {
  phase: TxPhase;
  hash?: string;
  errorCode?: number;
  errorMessage?: string;
  resultValue?: string;
}

const POLL_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 2000;

function toPayment(raw: Record<string, unknown>): Payment {
  return {
    id: raw.id as bigint,
    from: raw.from as string,
    to: raw.to as string,
    amount: raw.amount as bigint,
    memo: raw.memo as string,
    timestamp: raw.timestamp as bigint,
  };
}

function buildReadTx(fn: string, args: xdr.ScVal[]) {
  return server.getAccount(READ_SOURCE).then((account) =>
    new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(contract.call(fn, ...args))
      .setTimeout(30)
      .build(),
  );
}

async function simulateRead(fn: string, args: xdr.ScVal[]): Promise<unknown> {
  const tx = await buildReadTx(fn, args);
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    const code = parseContractErrorCode(sim.error);
    throw new Error(errorMessageForCode(code ?? 0));
  }
  return scValToNative(sim.result!.retval);
}

/** Reads the tracked balance of an address (in stroops). */
export async function getBalance(address: string): Promise<bigint> {
  const value = (await simulateRead('get_balance', [
    new Address(address).toScVal(),
  ])) as bigint;
  return value;
}

/** Lists all payments involving an address. */
export async function listPayments(address: string): Promise<Payment[]> {
  const raw = (await simulateRead('list_payments', [
    new Address(address).toScVal(),
  ])) as Record<string, unknown>[];
  return raw.map(toPayment);
}

/** Builds a payment/invocation transaction for the connected wallet. */
async function buildInvokeTx(sourceAddress: string, fn: string, args: xdr.ScVal[]) {
  const account = await server.getAccount(sourceAddress);
  return new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(fn, ...args))
    .setTimeout(30)
    .build();
}

/** Submits a signed transaction and polls it to a terminal state. */
async function submitAndPoll(
  tx: ReturnType<TransactionBuilder['build']>,
  sourceAddress: string,
  onUpdate: (update: Partial<TrackedTx>) => void,
): Promise<void> {
  // Simulate + assemble. Throws `HostError: Error(Contract, #N)` on a
  // `#[contracterror]` failure, which we decode below.
  const prepared = await server.prepareTransaction(tx);

  const signedXdr = await signTransaction(prepared.toXDR(), sourceAddress);
  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const sent = await server.sendTransaction(signedTx);

  if (sent.status === 'ERROR') {
    onUpdate({
      phase: 'failed',
      errorMessage: 'The network rejected the transaction before it was applied.',
    });
    return;
  }

  onUpdate({ hash: sent.hash });

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const result = await server.getTransaction(sent.hash);
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      onUpdate({
        phase: 'confirmed',
        resultValue: result.returnValue
          ? String(scValToNative(result.returnValue))
          : undefined,
      });
      return;
    }
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
      onUpdate({
        phase: 'failed',
        errorMessage: 'The transaction failed on-chain.',
      });
      return;
    }
  }

  onUpdate({ phase: 'failed', errorMessage: 'Timed out waiting for confirmation.' });
}

function failFromError(
  error: unknown,
  onUpdate: (update: Partial<TrackedTx>) => void,
): void {
  const message = error instanceof Error ? error.message : String(error);
  const code = parseContractErrorCode(message);
  if (code !== null) {
    onUpdate({
      phase: 'failed',
      errorCode: code,
      errorMessage: errorMessageForCode(code),
    });
  } else {
    onUpdate({ phase: 'failed', errorMessage: message });
  }
}

/** Deposits tracked balance to the connected account. */
export async function submitDeposit(
  account: string,
  amountStroops: bigint,
  onUpdate: (update: Partial<TrackedTx>) => void,
): Promise<void> {
  onUpdate({ phase: 'submitting' });
  try {
    const tx = await buildInvokeTx(account, 'deposit', [
      new Address(account).toScVal(),
      nativeToScVal(amountStroops, { type: 'i128' }),
    ]);
    await submitAndPoll(tx, account, onUpdate);
  } catch (error) {
    failFromError(error, onUpdate);
  }
}

/** Records a payment from `from` to `to`, emitting a PaymentEvent. */
export async function submitRecordPayment(
  from: string,
  to: string,
  amountStroops: bigint,
  memo: string,
  onUpdate: (update: Partial<TrackedTx>) => void,
): Promise<void> {
  onUpdate({ phase: 'submitting' });
  try {
    const tx = await buildInvokeTx(from, 'record_payment', [
      new Address(from).toScVal(),
      new Address(to).toScVal(),
      nativeToScVal(amountStroops, { type: 'i128' }),
      nativeToScVal(memo),
    ]);
    await submitAndPoll(tx, from, onUpdate);
  } catch (error) {
    failFromError(error, onUpdate);
  }
}

/** Fetches recent payment events emitted by the contract (for the live feed). */
export async function getPaymentEvents(limit = 30): Promise<FeedEvent[]> {
  const latest = await server.getLatestLedger();
  const startLedger = Math.max(1, latest.sequence - 17280); // roughly the last 24h

  const response = await server.getEvents({
    startLedger,
    filters: [{ type: 'contract', contractIds: [CONTRACT_ID] }],
    limit,
  });

  return response.events
    .filter((event) => {
      const topic = scValToNative(event.topic[0]);
      return topic === 'payment';
    })
    .map((event) => ({
      ...toPayment(scValToNative(event.value) as Record<string, unknown>),
      txHash: event.txHash,
      ledger: event.ledger,
      inSuccessfulContractCall: event.inSuccessfulContractCall,
    }));
}
