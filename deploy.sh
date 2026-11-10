#!/usr/bin/env bash
# Builds the pool contract and deploys it to testnet with the `demo` key
# (reusing the pool recorded in app/.env if it was set up for the same token),
# initialises it with the anchor's USDC (Circle's testnet USDC), creates the
# server-side role accounts (sender / payout / yield), writes everything to
# app/.env, and prints the pool contract ID (the only thing written to stdout).
#
# USDC note: Blend's testnet pool lists Blend's own mock USDC, not Circle's.
# The pool holds Circle's USDC (what the anchor pays out) and never lends it on
# testnet; a yield account mirrors each deposit into Blend with Blend's mock
# USDC instead (app/server/yieldLeg.ts).
set -euo pipefail
cd "$(dirname "$0")"

NETWORK=testnet
SOURCE=demo
# The anchor's asset: Circle's testnet USDC, as listed in
# testanchor.stellar.org/.well-known/stellar.toml.
ASSET=USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
# Anchor home domain: change to swap anchors (any SEP-10 + SEP-24 anchor).
ANCHOR_DOMAIN=testanchor.stellar.org
# Blend's mock testnet USDC (blend-utils testnet.contracts.json "USDC"), used
# only by the yield mirror.
BLEND_USDC_ASSET=USDC:GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56
# On-chain amounts are 1/CHAIN_SCALE of what the screens show, so every
# anchor leg fits the test anchor's 1-10 USDC per-transaction limits.
CHAIN_SCALE=1000
# Blend v2 testnet lending pool ("TestnetV2"); USDC is one of its reserves.
BLEND_POOL=CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF
# At most this share of the pool's assets may be lent to Blend, in basis points.
MAX_BPS=5000
ENV_FILE=app/.env

log() { echo "==> $*" >&2; }
get_env() { [[ -f "$ENV_FILE" ]] && sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 || true; }
set_env() {
  local tmp
  tmp=$(mktemp)
  { grep -v "^$1=" "$ENV_FILE" 2>/dev/null || true; echo "$1=$2"; } >"$tmp"
  mv "$tmp" "$ENV_FILE"
}

log "Building"
stellar contract build --package pool >&2

TOKEN_ID=$(stellar contract id asset --asset "$ASSET" --network "$NETWORK")
ADMIN=$(stellar keys public-key "$SOURCE")

# Reuse the pool from app/.env only if it was set up for this same asset and
# still exists on the network (testnet is reset periodically).
POOL_ID=$(get_env VITE_POOL_ID)
if [[ -n "$POOL_ID" && "$(get_env VITE_ASSET)" == "$ASSET" ]] &&
  stellar contract fetch --id "$POOL_ID" --network "$NETWORK" >/dev/null 2>&1; then
  log "Reusing pool $POOL_ID from $ENV_FILE"
else
  log "Deploying pool"
  POOL_ID=$(stellar contract deploy \
    --wasm target/wasm32v1-none/release/pool.wasm \
    --source-account "$SOURCE" --network "$NETWORK")
fi

log "Initializing pool: token $TOKEN_ID, Blend pool $BLEND_POOL, admin $SOURCE, cap $MAX_BPS bps"
# A reused pool is already initialized: the contract returns
# Error::AlreadyInitialized (#1), which is fine. Any other failure is not.
if ! INIT_OUT=$(stellar contract invoke --id "$POOL_ID" \
  --source-account "$SOURCE" --network "$NETWORK" \
  -- init --token "$TOKEN_ID" --blend_pool "$BLEND_POOL" --admin "$ADMIN" \
  --max_bps "$MAX_BPS" 2>&1); then
  if grep -q 'Error(Contract, #1)' <<<"$INIT_OUT"; then
    log "Pool already initialized"
  else
    echo "$INIT_OUT" >&2
    exit 1
  fi
fi

BLEND_USDC_ID=$(stellar contract id asset --asset "$BLEND_USDC_ASSET" --network "$NETWORK")

log "Writing $ENV_FILE"
mkdir -p "$(dirname "$ENV_FILE")"
set_env VITE_POOL_ID "$POOL_ID"
set_env VITE_TOKEN_ID "$TOKEN_ID"
set_env VITE_ASSET "$ASSET"
set_env VITE_BLEND_POOL "$BLEND_POOL"
set_env VITE_BLEND_USDC_ID "$BLEND_USDC_ID"
set_env VITE_BLEND_USDC_ASSET "$BLEND_USDC_ASSET"
set_env VITE_ANCHOR_DOMAIN "$ANCHOR_DOMAIN"
set_env VITE_CHAIN_SCALE "$CHAIN_SCALE"
# Features outside the core three problems stay off unless set to true.
[[ -n "$(get_env VITE_FEATURE_DRIP)" ]] || set_env VITE_FEATURE_DRIP false
[[ -n "$(get_env VITE_FEATURE_PRIVACY)" ]] || set_env VITE_FEATURE_PRIVACY false

log "Creating the server-side accounts (sender / payout / yield)"
# Payouts (pool withdrawals) go to the payout account, which then pays the
# anchor via SEP-24. Prints its address.
PAYOUT=$(cd app && node scripts/setup-accounts.ts)
set_env VITE_PAYOUT_ADDRESS "$PAYOUT"

log "Pool contract ID:"
echo "$POOL_ID"
