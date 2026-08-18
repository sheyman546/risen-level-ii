#!/usr/bin/env bash
#
# Deploys the payment_tracker contract to Stellar Testnet and prints/saves the
# resulting contract ID.
#
# Usage:
#   ./deploy.sh                        # auto-generates + friendbot-funds a key
#   STELLAR_SECRET_KEY=S... ./deploy.sh  # use your own funded testnet key
#
set -euo pipefail
cd "$(dirname "$0")"

NETWORK="${NETWORK:-testnet}"
IDENTITY="${IDENTITY:-payment-tracker-deployer}"
WASM="target/wasm32v1-none/release/payment_tracker.wasm"
OUT_FILE=".contract-id"

# Ensure the testnet network is configured (idempotent).
if ! stellar network ls | grep -qw "$NETWORK"; then
  stellar network add "$NETWORK" \
    --rpc-url "https://soroban-testnet.stellar.org" \
    --network-passphrase "Test SDF Network ; September 2015"
fi

# 1. Obtain a funded deployer identity.
if [[ -n "${STELLAR_SECRET_KEY:-}" ]]; then
  echo "→ Importing deployer identity '$IDENTITY' from STELLAR_SECRET_KEY"
  printf '%s\n' "$STELLAR_SECRET_KEY" | stellar keys add "$IDENTITY" --secret-key >/dev/null
else
  if ! stellar keys ls | grep -qw "$IDENTITY"; then
    echo "→ Generating and funding a fresh testnet identity '$IDENTITY' via friendbot"
    stellar keys generate "$IDENTITY" --fund --network "$NETWORK"
  else
    echo "→ Reusing existing identity '$IDENTITY'"
  fi
fi

ADDRESS="$(stellar keys address "$IDENTITY")"
echo "→ Deployer address: $ADDRESS"

# 2. Build the contract.
echo "→ Building contract…"
stellar contract build

# 3. Deploy.
echo "→ Deploying to $NETWORK…"
CONTRACT_ID="$(stellar contract deploy \
  --wasm "$WASM" \
  --source-account "$IDENTITY" \
  --network "$NETWORK")"

echo "✅ Contract deployed: $CONTRACT_ID"
echo "$CONTRACT_ID" > "$OUT_FILE"
echo "→ Saved contract ID to $OUT_FILE"
