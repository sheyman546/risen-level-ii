#![cfg(test)]

use super::*;
use soroban_sdk::testutils::{Address as _, Events as _};
use soroban_sdk::{Address, Env, Event as _, String};

fn setup<'a>(env: &'a Env) -> (PaymentTrackerClient<'a>, Address, Address, Address) {
    env.mock_all_auths();
    let contract_id = env.register(PaymentTracker, ());
    let client = PaymentTrackerClient::new(env, &contract_id);
    let alice = Address::generate(env);
    let bob = Address::generate(env);
    (client, contract_id, alice, bob)
}

#[test]
fn test_happy_path() {
    let env = Env::default();
    let (client, contract_id, alice, bob) = setup(&env);
    let memo = String::from_str(&env, "lunch");

    // Deposit tracked balance for the sender.
    assert_eq!(client.deposit(&alice, &1000), 1000);
    assert_eq!(client.get_balance(&alice), 1000);

    // Record a payment.
    let id = client.record_payment(&alice, &bob, &250, &memo);
    assert_eq!(id, 0);

    // The structured event was emitted immediately after `record_payment`.
    assert_eq!(
        env.events().all(),
        [PaymentEvent {
            id,
            from: alice.clone(),
            to: bob.clone(),
            amount: 250,
            memo: memo.clone(),
            timestamp: env.ledger().timestamp(),
        }
        .to_xdr(&env, &contract_id)]
    );

    // Balances were moved.
    assert_eq!(client.get_balance(&alice), 750);
    assert_eq!(client.get_balance(&bob), 250);

    // The payment is retrievable.
    let payment = client.get_payment(&id);
    assert_eq!(payment.id, 0);
    assert_eq!(payment.from, alice.clone());
    assert_eq!(payment.to, bob.clone());
    assert_eq!(payment.amount, 250);
    assert_eq!(payment.memo, String::from_str(&env, "lunch"));

    // Both parties see the payment in their history.
    let alice_payments = client.list_payments(&alice);
    assert_eq!(alice_payments.len(), 1);
    assert_eq!(alice_payments.get_unchecked(0).id, 0);
    let bob_payments = client.list_payments(&bob);
    assert_eq!(bob_payments.len(), 1);
}

#[test]
fn test_multiple_payments_and_ids_increment() {
    let env = Env::default();
    let (client, _contract_id, alice, bob) = setup(&env);

    client.deposit(&alice, &500);
    let id1 = client.record_payment(&alice, &bob, &100, &String::from_str(&env, "a"));
    let id2 = client.record_payment(&alice, &bob, &100, &String::from_str(&env, "b"));
    let id3 = client.record_payment(&alice, &bob, &100, &String::from_str(&env, "c"));

    assert_eq!((id1, id2, id3), (0, 1, 2));
    assert_eq!(client.get_balance(&alice), 200);
    assert_eq!(client.get_balance(&bob), 300);
    assert_eq!(client.list_payments(&alice).len(), 3);
}

#[test]
fn test_error_amount_too_small_on_payment() {
    let env = Env::default();
    let (client, _contract_id, alice, bob) = setup(&env);

    client.deposit(&alice, &1000);

    assert_eq!(
        client.try_record_payment(&alice, &bob, &0, &String::from_str(&env, "zero")),
        Err(Ok(Error::AmountTooSmall))
    );
    assert_eq!(
        client.try_record_payment(&alice, &bob, &-5, &String::from_str(&env, "neg")),
        Err(Ok(Error::AmountTooSmall))
    );
}

#[test]
fn test_error_amount_too_small_on_deposit() {
    let env = Env::default();
    let (client, _contract_id, alice, _bob) = setup(&env);

    assert_eq!(
        client.try_deposit(&alice, &0),
        Err(Ok(Error::AmountTooSmall))
    );
    assert_eq!(
        client.try_deposit(&alice, &-1),
        Err(Ok(Error::AmountTooSmall))
    );
}

#[test]
fn test_error_invalid_recipient() {
    let env = Env::default();
    let (client, _contract_id, alice, _bob) = setup(&env);

    client.deposit(&alice, &1000);

    // Self-payment is rejected.
    assert_eq!(
        client.try_record_payment(&alice, &alice, &100, &String::from_str(&env, "self")),
        Err(Ok(Error::InvalidRecipient))
    );
}

#[test]
fn test_error_insufficient_balance() {
    let env = Env::default();
    let (client, _contract_id, alice, bob) = setup(&env);

    client.deposit(&alice, &50);

    // Trying to pay more than the tracked balance fails and moves nothing.
    assert_eq!(
        client.try_record_payment(&alice, &bob, &51, &String::from_str(&env, "too much")),
        Err(Ok(Error::InsufficientBalance))
    );
    assert_eq!(client.get_balance(&alice), 50);
    assert_eq!(client.get_balance(&bob), 0);
}

#[test]
fn test_error_payment_not_found() {
    let env = Env::default();
    let (client, _contract_id, _alice, _bob) = setup(&env);

    assert_eq!(
        client.try_get_payment(&12345),
        Err(Ok(Error::PaymentNotFound))
    );
}

#[test]
fn test_list_payments_empty() {
    let env = Env::default();
    let (client, _contract_id, alice, _bob) = setup(&env);

    let payments = client.list_payments(&alice);
    assert_eq!(payments.len(), 0);
}
