# Boloka

A dollar savings account for families in Botswana who receive money from relatives abroad
(Kate in Canada sends via MoneyGram; her parents, Mom and family, save it in Boloka).
It targets three problems: the **transfer cap** (P 9,500 per transfer — Remitly's cap;
Orange Money's own limit is P 10,000), the **cash trip for school fees** (P 24,000 a term vs
P 3,000 per ATM withdrawal and a P 4,000 card limit), and **the pula losing value** (savings
held in US dollars, earning interest; other routes hide about 5% in the exchange rate).

## Rules

- **Parents' screens never say** USDC, wallet, address, key, blockchain, Stellar, SEP or crypto.
  One exception, by request: the "?" screen (`/help`, `src/screens/Help.tsx`) explains in plain
  words that the dollars are USDC on Stellar in one private pool, lent on Blend for the interest,
  and that Boloka's income is `YIELD_CUT` (money.ts) of that interest.
  They show pula (`P 9,930`), or US dollars (`$ 735.56`) when the parents flip the P / $ switch
  on Home (`src/currency.ts`; balances and history follow it, the payout screen stays in pula
  because the bank and Orange Money receive pula). CAD amounts are written `$ CAD`. Jargon is fine on the MoneyGram
  screen, `/admin` and `/how-it-works` (judges only, not linked from the parents' screens).
- Every pula ↔ chain-unit conversion goes through `app/src/money.ts`; the copy's numbers
  (caps, limits, school fee, hidden cost) are constants there.
- Testnet only. Don't print secrets; `.accounts.json`, `.shared-state.json`, `.yield-state.json`
  and `.runs/` are gitignored and hold testnet keys / deposit secrets.
- The public site runs the pool in `app/.env` (`VITE_POOL_ID`). Changing the pool (a new deploy,
  as the note tree needed: the old contract had no `upgrade`) orphans the demo balances in the
  old one; from now on `./deploy.sh` upgrades the pool in place.

## Layout

```
contracts/pool/      Soroban pool (soroban-sdk =29.0.1): the original tree (deposit / withdraw /
                     verify) and the note tree (deposit_note / spend, Groth16 over BN254, Poseidon),
                     Blend supply/withdraw (admin), set_verifier, upgrade, total_assets.
circuits/            spend.circom (the spend proof), build.sh, the Poseidon-constants generator,
                     export-verifier.mjs; build/ holds the proving key etc. (vk.json is committed)
deploy.sh            builds, deploys/reuses the pool, writes app/.env, creates role accounts
app/                 the real prototype (testnet)
  src/               React screens (Boloka, MoneyGram mock, bank mock, lender, admin, how-it-works);
                     notes.ts / wallet.ts: notes, keys, memos, proving (see the note tree above)
  public/zk/         spend.wasm + spend.zkey: the proving key the phones use (committed, 14 MB)
  server/            Node side, used by the dev server (vite.config.ts) and scripts:
    anchor.ts        AnchorClient: SEP-1/10/24 via @stellar/typescript-wallet-sdk
    interactive.ts   completes the TEST anchor's SEP-24 page with fictional details (puppeteer-core)
    flows.ts         depositFlow / payoutFlow, each step recorded with its tx hash
    yieldLeg.ts      the Blend MIRROR (see below)
    accounts.ts      role accounts: sender, payout, yield
    routes.ts        /api/flow/*, /api/yield, /api/runs/latest
  scripts/demo-e2e.ts  the whole flow from fresh friendbot accounts
demo/                a simulated copy for recording video (no network); same screens
docs/                the original HTML designs
```

## The note tree: private transfers inside the pool (zero-knowledge)

The pool has two trees. The **original** SHA-256 tree (`deposit` / `withdraw`, commitment =
sha256(secret ‖ amount ‖ month)) is unchanged and still serves anything deposited before. The
**note tree** (Poseidon over BN254, `deposit_note` / `spend`) is where everything goes now:

- A **note** is Poseidon(amount, pk, blinding), owned by whoever knows `sk` with
  pk = Poseidon(sk). Its **memo** (amount ‖ blinding ‖ "sender|via", NaCl-boxed to the owner's
  X25519 key derived from `sk`) is stored with it, so the owner's phone finds its notes by trying
  every memo; the chain learns nothing from it. A **Boloka ID** (Settings) is pk ‖ memo key.
- **`spend`** takes a Groth16 proof (`circuits/spend.circom`, 2-in-2-out, ~12k constraints):
  the inputs are in the tree at a recent root (32 kept), the prover owns them, the nullifiers are
  Poseidon(commitment, sk), value is conserved, amounts are 64-bit, and `recipient` (SHA-256 of
  the payout address's XDR, top byte cleared) is bound in. The chain sees two nullifiers and two
  commitments: not which notes, not the owners, and for a transfer not the amount. A payout to the
  bank is the same spend with a public amount. This also closes the original tree's
  authorisation gap: a spend needs the secret.
- On-chain: `contracts/pool/src/poseidon.rs` (host `poseidon_permutation`, circomlib's constants
  in `poseidon_params.rs`, generated by `circuits/gen-poseidon-params.mjs` from poseidon-lite),
  `groth16.rs` (host BN254 pairing; points Ethereum-encoded, G2 = c1 ‖ c0). Incremental Merkle
  insert (20 Poseidon hashes per note). `set_verifier` (admin) installs the circuit's key;
  `upgrade` (admin) replaces the wasm in place.
- Build chain: `circuits/build.sh` (circom2 = circom 2.2.3 in wasm, snarkjs; one-party dev
  trusted setup) → `app/public/zk/spend.{wasm,zkey}` (the phones prove in the browser, ~1.5 s),
  `circuits/build/vk.json` (deploy.sh → `set_verifier`), `contracts/pool/src/fixtures/*` (real
  proofs the contract tests replay; `app/scripts/zk-fixture.ts`). **Rebuild all of these together
  after any circuit change**, then deploy: the key must match the proving key the apps ship.
- Apps: `src/notes.ts` (keys, commitments, memos, Poseidon tree, proving, ScVal encoding),
  `src/wallet.ts` (this phone's keys, Boloka ID, the dev server's `/api/directory`),
  `src/savings.tsx` (memo scan, balance = unspent notes, `spend()` for payouts and transfers),
  `src/screens/SendBoloka.tsx`. A second phone runs at `/as/<profile>/…` with its own keys and
  records (`src/profile.ts`; the launcher shows Neo, Kate's sister). At most two notes are spent
  per send (the circuit's arity): when more are needed, `spend()` first combines the largest two
  at a time with spends that pay nothing out (~10 s each, listed in the pill as "Combining
  savings"), then sends. No per-send limit on the screens.
- Measured 11 Nov 2026 (testnet, local backend): proof 1.4–1.8 s in Chrome; transfer tap → the
  other phone shows arrival 6.3 s; payout tap → receipt 3.2 s.

## Anchor-based architecture

Money enters and leaves through a **Stellar anchor**, reached only through the shared standards
(SEP-1 stellar.toml, SEP-10 sign-in, SEP-24 interactive deposit/withdrawal) using
`@stellar/typescript-wallet-sdk`. The anchor is **config, not code**: `VITE_ANCHOR_DOMAIN` in
`app/.env` (default `testanchor.stellar.org`). MoneyGram, Yellow Card or any SEP-24 anchor is a
change of that value.

- **Sender flow** (MoneyGram screen → Boloka): the browser makes a note for the receiver's
  Boloka ID (commitment + memo; nothing secret leaves the receiver's phone), then
  `POST /api/flow/deposit {commitment, units, memo}`: pool `deposit_note` **from the `sender`
  settlement float** ‖ Blend mirror supply
  → (SEP-10 → SEP-24 deposit of the anchor's USDC **refills the float** ‖ yield read). The
  float is pre-funded like a remittance payout partner, so the parents see the money in ~10 s
  and the anchor settles behind it; an empty float is funded by the anchor first. Each transfer
  always has at least one real anchor deposit.
- **Payout flow** ("Pay to bank / school", "Send to Orange Money"): the parents' browser proves and
  runs the pool `spend` (public amount to the `payout` account; `withdraw` for pre-note-tree
  savings), then
  `POST /api/flow/payout`: Blend mirror withdraw → SEP-10 → SEP-24 withdrawal (pay the anchor's
  account with its memo; the anchor completes the fiat leg). Parents only see pula.
- **The test anchor's KYC page** is completed by `server/interactive.ts` with fictional test
  details, in a hidden Chrome (`CHROME_PATH`, default macOS Chrome). Test anchor only; a
  production anchor's KYC is done by the customer or the sending app.
- **Display scale** `VITE_CHAIN_SCALE` (default 1000): on-chain amounts are 1/1000 of what the
  screens show, so each leg fits the test anchor's 1–10 USDC limits. Payouts below the anchor's
  1 USDC minimum (any Orange Money payout, ≤ P 10,000) get a real pool withdrawal but a
  **simulated** anchor leg, recorded as such.

## Soroban RPC

`src/rpc.ts`: a list of public testnet RPCs with failover (`VITE_RPC_URLS` overrides), used by
the browser and the server. gateway.fm and Ankr first: they answer in ~0.1–0.3 s; the SDF
`soroban-testnet.stellar.org` endpoint took 0.04–8 s per call at random (measured 10 Nov 2026
from Fly and a laptop) and made every flow step 10–25 s. Horizon stays SDF's (it was fast).

## USDC: Circle's vs Blend's (read before touching yield)

- The anchor pays **Circle's testnet USDC** (`USDC:GBBD47…LA5`, SAC `CBIELT…DAMA`). The pool holds that.
- Blend's testnet pool (`CCEBVD…HGF`) lists only **Blend's mock USDC** (`USDC:GATALT…V56`, SAC `CAQCFV…RCJU`).
- So on testnet the pool **never lends its own funds** (its `supply_to_blend` would fail; `/admin`
  shows lending paused). The **yield account mirrors** every pool deposit/payout by supplying /
  withdrawing the same amount of Blend's mock USDC in Blend (`server/yieldLeg.ts`).
- The parents' "Growing" figure is **real**: Blend's supply rate measured from the reserve's
  b_rate (needs ≥10 minutes between samples; until then Home shows "Growing" with no number),
  and `/api/yield` reads the mirror position (b-tokens × b_rate / 1e12).
- On mainnet, with one USDC, the pool's own `supply_to_blend` / `withdraw_from_blend` replace the mirror.
- The contract's `total_assets` view asks Blend about the pool's token, so it fails for the
  Circle pool; the app reads the pool balance + mirror instead. `withdraw` only touches Blend on
  a shortfall, which can't happen when nothing is lent.

## Feature flags

In `app/.env` (and the demo's build env), default **off**: `VITE_FEATURE_DRIP` (monthly
scheduled payouts) and `VITE_FEATURE_PRIVACY` (the privacy explainer). Set `=true` to show
them. Their code, and the contract's nullifier logic, stay.

## Running

```bash
./deploy.sh                       # once: pool, app/.env, role accounts (needs `stellar` CLI + `demo` key)
cd app
npm run demo:e2e                  # whole flow on testnet from fresh friendbot accounts (~3 min);
                                  # prints every step + tx hash, saves app/.runs/latest.json
VERBOSE=1 npm run demo:e2e        # … with anchor statuses; SEND_CAD=1000 SCHOOL_FEE=24000 to vary
npm run dev:boloka    -- --host <tailscale-ip>   # :5173  Boloka (+ /lender /admin /dev /how-it-works)
npm run dev:moneygram -- --host <tailscale-ip>   # :5177  MoneyGram (sender)
npm run dev:bank      -- --host <tailscale-ip>   # :5178  Kalahari Bank (fictional; credits = confirmed payouts)
cd ../demo && npm run dev:boloka / dev:moneygram / dev:bank   # simulated: :5174 / :5175 / :5176
# Single source of truth: with VITE_API_ORIGIN=https://boloka.fly.dev in app/.env (the default),
# every local dev server forwards /api to the public deployment, so local numbers ARE production's.
# Remove that line to run the backend (flows, ledger, yield, shared state) locally instead.
npx vite --port 5181          # ONE URL for everything: / is the launcher (Mom's phone plus the phone
                              # the money involves, following the flow), Boloka at /home, Neo's at
                              # /as/neo/home, /moneygram, /bank, /lender, /how-it-works
cargo test -p pool                # contract tests (replay real proofs from src/fixtures)
circuits/build.sh                 # rebuild the spend circuit, proving key, vk.json and the fixtures
                                  # (~2 min); then ./deploy.sh to install the new key
npm run export:animation          # re-export the /help pool animation (src/PoolAnimation.tsx) to
                                  # docs/pool-animation.{svg,gif,mp4} for slides; from the public
                                  # site, or -- --url http://localhost:5181 for a local build
                                  # (needs Chrome + ffmpeg)
```

`/how-it-works` shows the latest `demo:e2e` run: SEP-10 auth → SEP-24 deposit → pool deposit →
Blend supply → yield read → pool withdraw → SEP-24 withdrawal, each linked to the testnet
explorer (stellarchain.io: stellar.expert's web pages currently fail on testnet transactions its
API does have; `app/src/explorer.ts` is the one place to change), with off-chain / read-only /
simulated steps marked.
