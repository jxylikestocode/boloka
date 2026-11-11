#!/usr/bin/env bash
# Builds the spend circuit and everything made from it:
#   circuits/build/              r1cs, witness wasm, powers of tau, proving key, vk JSON
#   app/public/zk/               spend.wasm + spend.zkey (the apps prove in the browser)
#   circuits/build/vk.json       the verification key as the contract's set_verifier argument
#   contracts/pool/src/fixtures/ key + sample proofs for the contract's tests (app/scripts/zk-fixture.ts)
#
# Needs only the app's node_modules (circom2: circom 2.2.3 in WebAssembly;
# snarkjs). Deterministic except the trusted setup: this is a one-party dev
# setup, fine for testnet; a real deployment needs a multi-party ceremony.
#   circuits/build.sh            # ~2 minutes; skips the powers of tau if present
set -euo pipefail
cd "$(dirname "$0")"
ROOT=$(cd .. && pwd)
BUILD=build
NPX="npx --prefix $ROOT/app"
PTAU_POWER=16     # 2^16 > the circuit's ~25k constraints

mkdir -p $BUILD
echo "==> compiling spend.circom" >&2
# From the repo root with relative paths: circom2's WebAssembly sandbox sees only the working directory.
(cd "$ROOT" && $NPX circom2 circuits/spend.circom --r1cs --wasm --sym -o circuits/$BUILD -l app/node_modules >&2)

if [[ ! -f $BUILD/pot${PTAU_POWER}_final.ptau ]]; then
  echo "==> powers of tau (2^$PTAU_POWER, bn128)" >&2
  $NPX snarkjs powersoftau new bn128 $PTAU_POWER $BUILD/pot_0000.ptau -v >/dev/null
  $NPX snarkjs powersoftau contribute $BUILD/pot_0000.ptau $BUILD/pot_0001.ptau --name="boloka dev" -e="$(head -c 32 /dev/urandom | base64)" >/dev/null
  $NPX snarkjs powersoftau prepare phase2 $BUILD/pot_0001.ptau $BUILD/pot${PTAU_POWER}_final.ptau -v >/dev/null
  rm -f $BUILD/pot_0000.ptau $BUILD/pot_0001.ptau
fi

echo "==> circuit-specific setup (Groth16)" >&2
$NPX snarkjs groth16 setup $BUILD/spend.r1cs $BUILD/pot${PTAU_POWER}_final.ptau $BUILD/spend_0000.zkey >/dev/null
$NPX snarkjs zkey contribute $BUILD/spend_0000.zkey $BUILD/spend.zkey --name="boloka dev" -e="$(head -c 32 /dev/urandom | base64)" >/dev/null
rm -f $BUILD/spend_0000.zkey
$NPX snarkjs zkey export verificationkey $BUILD/spend.zkey $BUILD/verification_key.json >/dev/null

echo "==> app/public/zk" >&2
mkdir -p "$ROOT/app/public/zk"
cp $BUILD/spend_js/spend.wasm "$ROOT/app/public/zk/spend.wasm"
cp $BUILD/spend.zkey "$ROOT/app/public/zk/spend.zkey"

echo "==> verification key for the contract, test fixtures" >&2
node export-verifier.mjs
(cd "$ROOT/app" && node scripts/zk-fixture.ts)

ls -la "$ROOT/app/public/zk" $BUILD/vk.json >&2
echo "done" >&2
