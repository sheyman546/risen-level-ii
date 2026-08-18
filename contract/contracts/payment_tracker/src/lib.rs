#![no_std]
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, symbol_short, Address, Env,
    Map, String, Symbol, Vec,
};

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------
const NEXT_ID: Symbol = symbol_short!("next_id");
const PAYMENTS: Symbol = symbol_short!("payments");
const USER_PAYMENTS: Symbol = symbol_short!("user_paym");
const BALANCES: Symbol = symbol_short!("balances");

/// Smallest accepted payment amount, in stroops (1 XLM = 10_000_000 stroops).
const MIN_PAYMENT: i128 = 1;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/// A recorded payment, persisted in contract storage.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Payment {
    pub id: u64,
    pub from: Address,
    pub to: Address,
    pub amount: i128,
    pub memo: String,
    pub timestamp: u64,
}

/// Emitted on every successful payment. This powers the live activity feed.
///
/// Topics: `["payment"]`, data: (id, from, to, amount, memo, timestamp).
#[contractevent(topics = ["payment"])]
pub struct PaymentEvent {
    pub id: u64,
    pub from: Address,
    pub to: Address,
    pub amount: i128,
    pub memo: String,
    pub timestamp: u64,
}

/// Custom contract errors. Each is mapped to a human-readable message in the
/// frontend and is triggerable from the UI and from the unit tests.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// `from` does not hold enough tracked balance to cover `amount`.
    InsufficientBalance = 1,
    /// Recipient is invalid (self-payment / zero address).
    InvalidRecipient = 2,
    /// Amount is zero or negative (below `MIN_PAYMENT`).
    AmountTooSmall = 3,
    /// No payment exists for the requested id.
    PaymentNotFound = 4,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct PaymentTracker;

#[contractimpl]
impl PaymentTracker {
    /// Credits `amount` of tracked balance to `account` (must be signed by it).
    pub fn deposit(env: Env, account: Address, amount: i128) -> Result<i128, Error> {
        account.require_auth();

        if amount < MIN_PAYMENT {
            return Err(Error::AmountTooSmall);
        }

        let mut balances: Map<Address, i128> =
            env.storage().persistent().get(&BALANCES).unwrap_or_else(|| Map::new(&env));
        let current = balances.get(account.clone()).unwrap_or(0);
        let new_balance = current + amount;
        balances.set(account, new_balance);
        env.storage().persistent().set(&BALANCES, &balances);

        Ok(new_balance)
    }

    /// Records a payment from `from` to `to`, moving tracked balance between the
    /// two parties and emitting a `PaymentEvent`. Returns the new payment id.
    pub fn record_payment(
        env: Env,
        from: Address,
        to: Address,
        amount: i128,
        memo: String,
    ) -> Result<u64, Error> {
        from.require_auth();

        if amount < MIN_PAYMENT {
            return Err(Error::AmountTooSmall);
        }
        if to == from {
            return Err(Error::InvalidRecipient);
        }

        // Move tracked balance between sender and recipient.
        let mut balances: Map<Address, i128> =
            env.storage().persistent().get(&BALANCES).unwrap_or_else(|| Map::new(&env));
        let sender_balance = balances.get(from.clone()).unwrap_or(0);
        if sender_balance < amount {
            return Err(Error::InsufficientBalance);
        }
        balances.set(from.clone(), sender_balance - amount);
        let receiver_balance = balances.get(to.clone()).unwrap_or(0);
        balances.set(to.clone(), receiver_balance + amount);
        env.storage().persistent().set(&BALANCES, &balances);

        // Assign a fresh, monotonically increasing id.
        let id: u64 = env.storage().persistent().get(&NEXT_ID).unwrap_or(0);
        env.storage().persistent().set(&NEXT_ID, &(id + 1));

        let timestamp = env.ledger().timestamp();

        let payment = Payment {
            id,
            from: from.clone(),
            to: to.clone(),
            amount,
            memo: memo.clone(),
            timestamp,
        };

        // Persist the payment record.
        let mut payments: Map<u64, Payment> =
            env.storage().persistent().get(&PAYMENTS).unwrap_or_else(|| Map::new(&env));
        payments.set(id, payment);
        env.storage().persistent().set(&PAYMENTS, &payments);

        // Index the payment for both parties so `list_payments` can find it.
        let mut user_payments: Map<Address, Vec<u64>> =
            env.storage().persistent().get(&USER_PAYMENTS).unwrap_or_else(|| Map::new(&env));
        push_payment_id(&env, &mut user_payments, from.clone(), id);
        push_payment_id(&env, &mut user_payments, to.clone(), id);
        env.storage().persistent().set(&USER_PAYMENTS, &user_payments);

        // Emit the structured event for the real-time feed.
        PaymentEvent {
            id,
            from,
            to,
            amount,
            memo,
            timestamp,
        }
        .publish(&env);

        Ok(id)
    }

    /// Returns a single payment by id.
    pub fn get_payment(env: Env, id: u64) -> Result<Payment, Error> {
        let payments: Map<u64, Payment> =
            env.storage().persistent().get(&PAYMENTS).unwrap_or_else(|| Map::new(&env));
        payments.get(id).ok_or(Error::PaymentNotFound)
    }

    /// Returns all payments in which `address` participated (as sender or recipient).
    pub fn list_payments(env: Env, address: Address) -> Vec<Payment> {
        let user_payments: Map<Address, Vec<u64>> =
            env.storage().persistent().get(&USER_PAYMENTS).unwrap_or_else(|| Map::new(&env));
        let ids = user_payments.get(address).unwrap_or_else(|| Vec::new(&env));

        let payments: Map<u64, Payment> =
            env.storage().persistent().get(&PAYMENTS).unwrap_or_else(|| Map::new(&env));

        let mut result = Vec::new(&env);
        for id in ids.iter() {
            if let Some(payment) = payments.get(id) {
                result.push_back(payment);
            }
        }
        result
    }

    /// Returns the tracked balance of `address`.
    pub fn get_balance(env: Env, address: Address) -> i128 {
        let balances: Map<Address, i128> =
            env.storage().persistent().get(&BALANCES).unwrap_or_else(|| Map::new(&env));
        balances.get(address).unwrap_or(0)
    }
}

fn push_payment_id(env: &Env, map: &mut Map<Address, Vec<u64>>, address: Address, id: u64) {
    let mut ids = map.get(address.clone()).unwrap_or_else(|| Vec::new(env));
    ids.push_back(id);
    map.set(address, ids);
}

mod test;
