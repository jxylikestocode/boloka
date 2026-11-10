# Boloka

A dollar savings account for families in Botswana who receive money from relatives abroad
(Kate in Canada sends via MoneyGram; her parents, Mma Kgosi and family, save it in Boloka).
It targets three problems: the **transfer cap** (P 9,500 per transfer — Remitly's cap;
Orange Money's own limit is P 10,000), the **cash trip for school fees** (P 24,000 a term vs
P 3,000 per ATM withdrawal and a P 4,000 card limit), and **the pula losing value** (savings
held in US dollars, earning interest; other routes hide about 5% in the exchange rate).

## Rules

- **Parents' screens never say** USDC, wallet, address, key, blockchain, Stellar, SEP or crypto.
  They show pula (`P 9,930`). CAD amounts are written `$ CAD`. Jargon is fine on the MoneyGram
  screen, `/admin` and `/how-it-works` (judges only, not linked from the parents' screens).
- Every pula ↔ chain-unit conversion goes through `app/src/money.ts`; the copy's numbers
  (caps, limits, school fee, hidden cost) are constants there.
- Testnet only. Don't print secrets; `.accounts.json`, `.shared-state.json`, `.yield-state.json`
  and `.runs/` are gitignored and hold testnet keys / deposit secrets.

## Layout

```
contracts/pool/      Soroban pool (soroban-sdk =29.0.1): deposit(commitment), withdraw(nullifier,
                     Merkle path), verify, Blend supply/withdraw (admin), total_assets.
deploy.sh            builds, deploys/reuses the pool, writes app/.env, creates role accounts
app/                 the real prototype (testnet)
  src/               React screens (Boloka, MoneyGram mock, bank mock, lender, admin, how-it-works)
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

## Anchor-based architecture

Money enters and leaves through a **Stellar anchor**, reached only through the shared standards
(SEP-1 stellar.toml, SEP-10 sign-in, SEP-24 interactive deposit/withdrawal) using
`@stellar/typescript-wallet-sdk`. The anchor is **config, not code**: `VITE_ANCHOR_DOMAIN` in
`app/.env` (default `testanchor.stellar.org`). MoneyGram, Yellow Card or any SEP-24 anchor is a
change of that value.

- **Sender flow** (MoneyGram screen → Boloka): the browser makes the parents' secret and
  commitment (the secret never leaves the device), then `POST /api/flow/deposit`: SEP-10 →
  SEP-24 deposit of the anchor's USDC into the `sender` settlement account → pool `deposit`
  under the commitment → Blend mirror supply → yield read.
- **Payout flow** ("Pay to bank / school", "Send to Orange Money"): the parents' browser runs the
  pool `withdraw` (Merkle proof + nullifier) to the `payout` account, then
  `POST /api/flow/payout`: Blend mirror withdraw → SEP-10 → SEP-24 withdrawal (pay the anchor's
  account with its memo; the anchor completes the fiat leg). Parents only see pula.
- **The test anchor's KYC page** is completed by `server/interactive.ts` with fictional test
  details, in a hidden Chrome (`CHROME_PATH`, default macOS Chrome). Test anchor only; a
  production anchor's KYC is done by the customer or the sending app.
- **Display scale** `VITE_CHAIN_SCALE` (default 1000): on-chain amounts are 1/1000 of what the
  screens show, so each leg fits the test anchor's 1–10 USDC limits. Payouts below the anchor's
  1 USDC minimum (any Orange Money payout, ≤ P 10,000) get a real pool withdrawal but a
  **simulated** anchor leg, recorded as such.

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
npx vite --port 5181          # ONE URL for everything: / is the launcher (story + open the three
                              # apps), Boloka at /home, /moneygram, /bank, /lender, /how-it-works
cargo test -p pool                # contract tests
```

`/how-it-works` shows the latest `demo:e2e` run: SEP-10 auth → SEP-24 deposit → pool deposit →
Blend supply → yield read → pool withdraw → SEP-24 withdrawal, each linked to stellar.expert
testnet, with off-chain / read-only / simulated steps marked.
