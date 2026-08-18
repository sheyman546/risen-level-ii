# Contract — Multi-Wallet Payment Tracker

Soroban smart contract (Rust + Soroban SDK v27) for the payment tracker dApp.
See the [root README](../README.md) for the full project overview, the deployed
testnet contract ID, and setup instructions.

## Build & test

```bash
cargo test                 # run unit tests (happy path + 4 error cases)
stellar contract build     # → target/wasm32v1-none/release/payment_tracker.wasm
```

## Deploy

```bash
./deploy.sh                # builds, funds/imports a key, deploys to testnet
```

The script prints the resulting contract ID and saves it to `.contract-id`.
Set `STELLAR_SECRET_KEY` to use your own funded testnet key instead of friendbot.
