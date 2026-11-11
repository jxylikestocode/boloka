# Boloka

> **Disclaimer.** This project was generated 100% by Claude (Anthropic's AI) during a
> hackathon, with no human-written code. It is a prototype on Stellar **testnet** and is
> **not suitable for production**: the contract is unaudited, the privacy design is a
> placeholder, and funds would not be safe. Do not use it with real money.

A dollar savings account for families in Botswana who receive money from relatives abroad.

**Live demo:** https://boloka.fly.dev (Stellar testnet; every transfer is a real transaction) ·
**Judges' page:** https://boloka.fly.dev/how-it-works

## The problem

Kate in Canada sends her parents $10,000 CAD. Transfer apps cap a transfer at P 9,500, an
ATM gives P 3,000 at a time (a card P 4,000), other routes hide about 5% in the exchange
rate, and the pula keeps losing value. With Boloka the whole amount arrives, sits in US
dollars earning interest, and the P 24,000 school fee goes straight to the school's bank.

## The demo: three apps

| App | Who | What you see |
|---|---|---|
| **MoneyGram** (mock) | Kate, in Canada | Sends $10,000 CAD; Boloka is the only option with no cap |
| **Boloka** | Her parents ("Mom"), in Botswana | The money arrives in seconds, shown in pula or dollars, growing at Blend's real rate; **Send to family** moves some to Neo's Boloka privately, inside the pool; **Withdraw** pays the school fee to the bank or Orange Money |
| **Boloka · Neo** | Kate's sister, with her own Boloka | Mom's transfer arrives in seconds, still in dollars (`/as/neo/home`) |
| **Kalahari Bank** (fictional) | The school's bank | The payout lands |

The homepage shows two phones at a time: Mom's Boloka, and beside it whichever phone the
money involves right now (MoneyGram while Kate sends, Neo when Mom sends to family, the bank
when she withdraws), switching by itself or by hand. While a transfer or payout runs, a
floating **under the hood** card lists every step with its testnet transaction link and how
long it took. **Pool admin** (`/admin`) lists all transactions; **How it works**
(`/how-it-works`) tells the story for judges.

## How it works (short version)

- **Money in:** the MoneyGram screen starts a server flow: the parents are paid into the
  savings pool from a pre-funded **settlement float** (one transaction, ~6 s), the same
  amount is mirrored into **Blend** for yield, and a Stellar **anchor** (SEP-10 / SEP-24,
  `testanchor.stellar.org`) then refills the float with USDC behind the scenes.
- **Savings:** a Soroban **pool contract** holds Circle's testnet USDC. Each deposit is a
  **note**: a Poseidon commitment to (amount, owner key, blinding) in a Merkle tree, plus a memo
  only the owner's phone can decrypt. Nobody can look up a balance or who sends to whom.
- **Private transfers:** sending to another Boloka account is a **zero-knowledge spend**
  (Groth16, `circuits/spend.circom`, proved in the browser in about 1.5 s): the pool checks the
  proof and records two nullifiers and two new notes, learning neither the owners nor the
  amount. The dollars never leave the pool. A payout to the bank is the same spend with a
  public amount, so withdrawals need the secret too.
- **Yield:** the parents' "growing" figure is Blend's real supply rate, measured from the
  Blend position; Boloka keeps a share of the interest (`YIELD_CUT`, 20%) and charges no
  fees.
- **Money out:** the parents' browser withdraws from the pool, then the server takes the
  mirror back from Blend and runs a SEP-24 withdrawal with the anchor (the fiat leg).
- **Display scale 1:1000:** on-chain amounts are 1/1000 of what the screens show, so every
  anchor leg fits the test anchor's 1–10 USDC limits. Everything else is real.

The full architecture, the two-USDCs-on-testnet detail and the rules for the parents'
screens are in [CLAUDE.md](CLAUDE.md).

## Repository layout

```
contracts/pool/   Soroban savings pool (Rust, soroban-sdk 29): notes + zero-knowledge spend (Groth16
                  over BN254, Poseidon via host functions), the original deposit/withdraw, Blend hooks
circuits/         spend.circom, build.sh (circom + snarkjs → proving key, verification key, fixtures)
app/              the real app (React + Vite front end, Node server, testnet)
  src/            screens: Boloka, MoneyGram mock, bank mock, lender portal, admin, how-it-works;
                  notes.ts (keys, memos, proving) and wallet.ts (this phone's Boloka ID)
  public/zk/      the spend circuit's wasm + proving key the phones prove with (14 MB)
  server/         anchor client (SEP-1/10/24), flows, Blend yield mirror, ledger, directory, API
  scripts/        demo-e2e (whole flow from fresh accounts), setup-accounts, export-animation, zk-fixture
  Dockerfile, fly.toml   the public deployment (Fly.io)
demo/             a simulated copy of the screens (no network) for recording video
docs/             original HTML designs; the pool animation as SVG / GIF / MP4 / HTML
deploy.sh         builds and deploys the contract, writes app/.env, creates role accounts
```

## Quick start (front end only, backed by the public deployment)

The committed `app/.env` points `/api` at https://boloka.fly.dev, so a fresh clone runs the
full app against the live testnet backend with no keys, no Rust and no Chrome.

```bash
git clone https://github.com/jxylikestocode/boloka.git
cd boloka/app
npm install
npx vite --port 5181          # one URL for everything: http://localhost:5181
```

Also available, each app on its own port: `npm run dev:boloka` (5173),
`npm run dev:moneygram` (5177), `npm run dev:bank` (5178). Add `-- --host` to open them
from a phone on the same network.

Requirements: **Node 24** (what the deployment uses; 22+ should work) and npm.

## Running your own backend (your own pool, accounts and flows)

Prerequisites:

- Rust with the `wasm32v1-none` (or `wasm32-unknown-unknown`) target, and the
  [Stellar CLI](https://developers.stellar.org/docs/tools/cli) (`stellar`).
- A funded testnet key named `demo`: `stellar keys generate demo --network testnet --fund`
- Google Chrome (or set `CHROME_PATH`): the test anchor's SEP-24 page is completed
  automatically in a hidden browser with fictional details.
- Node 24 and npm.

```bash
circuits/build.sh                 # once, or after changing the circuit: proving key → app/public/zk,
                                  # verification key → circuits/build/vk.json, test fixtures (~2 min)
./deploy.sh                       # builds + deploys the pool (or upgrades the one in app/.env in place),
                                  # installs the verification key, creates sender / payout / yield
                                  # accounts, writes app/.env
cd app
npm install
sed -i '' '/^VITE_API_ORIGIN=/d' .env     # use the local backend instead of boloka.fly.dev
npm run demo:e2e                  # the whole flow on testnet from fresh accounts (~3 min),
                                  # prints every step + tx hash; /how-it-works shows this run
npx vite --port 5181              # the app, now with the backend running in the dev server
```

`VERBOSE=1 npm run demo:e2e` also prints anchor statuses; `SEND_CAD=1000 SCHOOL_FEE=24000`
vary the amounts. Role accounts are written to `app/.accounts.json` (gitignored; testnet keys).

Contract tests: `cargo test -p pool` (they replay real proofs from `contracts/pool/src/fixtures`,
made by `circuits/build.sh`). The committed `app/public/zk/spend.zkey` and the pool's verification
key belong together: after `circuits/build.sh`, run `./deploy.sh` so the pool accepts the new proofs.

## Configuration (`app/.env`, written by `deploy.sh`)

| Variable | Meaning |
|---|---|
| `VITE_POOL_ID`, `VITE_TOKEN_ID`, `VITE_ASSET` | the pool contract and the USDC it holds (Circle's testnet USDC) |
| `VITE_BLEND_POOL`, `VITE_BLEND_USDC_ID`, `VITE_BLEND_USDC_ASSET` | Blend's testnet pool and its mock USDC, used by the yield mirror |
| `VITE_ANCHOR_DOMAIN` | the SEP-24 anchor (default `testanchor.stellar.org`); any anchor is a change of this value |
| `VITE_CHAIN_SCALE` | display scale (default 1000) |
| `VITE_PAYOUT_ADDRESS` | the account pool withdrawals are paid to |
| `VITE_FEATURE_DRIP`, `VITE_FEATURE_PRIVACY` | optional screens, off by default |
| `VITE_SHARED_STATE` | one shared demo account across browsers (on for the public site) |
| `VITE_API_ORIGIN` | if set, the dev server forwards `/api` there instead of running the backend |
| `VITE_RPC_URLS` | Soroban RPC endpoints, comma-separated, first preferred (default: gateway.fm, Ankr, SDF) |

## Deploying the public site (Fly.io)

```bash
cd app
fly launch --no-deploy                     # once: app name, region, a 1 GB volume mounted at /data
fly secrets set ACCOUNTS_JSON="$(cat .accounts.json)"   # the role accounts (testnet keys)
fly deploy --remote-only --ha=false        # builds the Dockerfile (Node 24 + Chromium) remotely
```

The server keeps its small state (ledger, jobs, yield samples, shared account) on the
volume. A deploy restarts the single machine, so don't deploy while a transfer is running.

## The simulated demo (for video)

`demo/` is a copy of the screens with no network: instant, deterministic.

```bash
cd demo && npm install
npm run dev:boloka      # :5174      npm run dev:moneygram   # :5175      npm run dev:bank   # :5176
```

## Slides

`docs/pool-animation.{svg,gif,mp4,html}` is the "how the pool works" animation from the
app's Help screen, for decks. After changing `app/src/PoolAnimation.tsx`, regenerate them
with `cd app && npm run export:animation` (needs Chrome and ffmpeg).

## Known limitations

- The Groth16 setup is a one-party developer ceremony (`circuits/build.sh`); a real deployment
  needs a multi-party one. The circuit and contract are unaudited.
- Deposits and payouts are visible on chain with their amounts (they move USDC); only transfers
  inside the pool hide the amount. The fee-paying account of a spend is the phone's testnet key.
- A spend uses at most two notes, so a send larger than the two biggest notes must be split.
- The original SHA-256 tree (`deposit` / `withdraw`) is kept for savings from before the note
  tree; its withdraw checks membership only, not knowledge of the secret.
- Testnet only; the test anchor's KYC is auto-completed with fictional details. A production
  anchor's KYC is done by the customer or the sending app.
- On testnet the pool never lends its own USDC (Blend lists a different mock USDC); a yield
  account mirrors each deposit instead. On mainnet, with one USDC, the pool lends directly.
