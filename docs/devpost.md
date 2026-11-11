# Boloka — Devpost "About the project"

## Inspiration

*Boloka* means "to keep" in Setswana.

Kate, our teammate, studies at a university in Waterloo, Canada. Every term she sends P13,500 (about C$1,350) home to Mogoditshane, Botswana, into her mom's Orange Money wallet, to pay her little sister's school fees. The transfer works. Everything around it doesn't:

1. **Sending.** The wallet caps each transfer at P10,000, so one term's fee is two transfers and two fees — six a year. And about 5% vanishes in the exchange rate on top of the fee line: roughly P675 lost on a single term's fees, against a UN target of 3% for remittance costs.
2. **Receiving.** Orange Money can't pay the school. So her mom cashes out at an agent, travels 8.5 km each way to a deposit ATM at Gaborone Bus Rank, queues, feeds the same cash back into her bank account, and only then pays the school by transfer. Three extra steps, a ride across town and the risk of carrying cash, to pay one bill.
3. **Spending.** Paying by the wallet's prepaid card instead? P4,000 per swipe: four swipes and four fees per term, twelve a year.
4. **Saving.** Meanwhile the pula has lost 17% against the US dollar in five years (P10,000 bought US$878 in November 2021 and US$727 in November 2026). Every pula the family keeps buys less each year.

We interviewed senders in Canada to Botswana, China, Egypt, India, Nigeria and Zimbabwe and heard the same pattern: the hard part of a remittance is not the transfer, it's holding, saving and spending the money after it lands.

Two findings from the China and India interviews sharpened it:

- **The hard direction is out, not in.** Sending from Canada to China or India is relatively easy; the apps and banks are quick and the money lands. The friction both groups described is sending money *out* of China and India: both countries restrict it, and a family paying for a student abroad meets limits, paperwork and delays at every step. Our product sits on the receiving side today; the sending side of those two corridors is a market of its own.
- **Recurring, not occasional.** One Indian sender was unusual: he sends money *to* India every month, to pay the mortgage on the family home and to fund a mutual-fund auto-invest plan. Fixed dates, exact amounts, specific accounts. That is "pay directly" as a standing order, and it is why scheduled payouts and in-app bill payment are on the roadmap rather than a nice-to-have.

## What it does

Boloka is a dollar savings account for families who receive money from abroad: send once, pay directly, keep its value.

- **The sender** uses MoneyGram (or any Stellar anchor) exactly as before and picks *Boloka* under "How they receive". No cap, no instalments, no transfer fee.
- **The money** arrives in seconds as USDC on Stellar and sits in one shared pool, earning interest through Blend. Savings keep their dollar value while the family sees a familiar pula balance (or dollars, with one switch).
- **The parents** tap "Withdraw to cash" and the money goes through a licensed local partner straight to a bank account or the school — one transfer, no cash run, no split swipes. Families without a bank account keep Orange Money.
- **Private transfer:** "Mom" can send part of it to Kate's sister Neo's own Boloka, in seconds, with no fee and no limit. The dollars never leave the pool, so they keep earning, and the transfer is a zero-knowledge spend: the chain learns neither the amount nor the two people.

The parents never see a wallet address, a token, or the word crypto. A "How it works" screen explains the pool, the interest and our share in plain words for anyone who asks.

**Live demo:** https://boloka.fly.dev — Mom's phone and, beside it, whichever phone the money involves (MoneyGram, Neo's Boloka, the bank), every step a real Stellar testnet transaction, each linked to the explorer with its timing.

## How we built it

- **Savings pool:** a Soroban (Rust) contract on Stellar testnet. Every deposit is a *note* — a Poseidon commitment to (amount, owner, blinding) in a Merkle tree — plus a memo only the owner's phone can decrypt, so the chain never shows who holds what or who sends to whom.
- **Zero-knowledge spends:** a Groth16 circuit (Circom, two notes in, two out) proves ownership, membership, conservation of value and the payout address. The phone makes the proof in about 1.5 s; the contract verifies it with Stellar's BN254 pairing and Poseidon host functions. A private transfer and a payout are the same call; the chain records two nullifiers and two new notes.
- **Money in and out:** Stellar's anchor standards (SEP-10 sign-in, SEP-24 deposit/withdrawal) against the SDF test anchor. The anchor is a config value, so MoneyGram, Yellow Card or any SEP-24 anchor plugs in without a rebuild.
- **Seconds, not minutes:** the parents are paid from a pre-funded settlement float the moment the sender confirms (one transaction, ~6 s); the anchor's deposit then refills the float behind the scenes. This is how real remittance payout partners settle.
- **Yield:** the pool's dollars are lent on Blend v2; the parents' "growing" figure is Blend's live supply rate, read from the position on chain. Families keep 80% of the interest, Boloka keeps 20%. That is the whole business model — we never earn from the transfer, so serving Kate's family gets structurally cheaper rather than subsidised.
- **App:** React + TypeScript (three apps: a MoneyGram-style sender screen, Boloka for the parents, a fictional bank), a Node server for the anchor and yield legs, deployed on Fly.io.
- **Process:** one developer and Claude Code, with Kate's own transfers, MoneyGram's published limits and terms, and her sister's school's fee schedule as the spec.

## Challenges we ran into

- **Two kinds of test USDC.** The test anchor pays Circle's testnet USDC; Blend's testnet pool only lists its own mock USDC. The pool holds the anchor's USDC and a yield account mirrors every deposit into Blend, and the demo says so. On mainnet, with one USDC, the pool lends directly.
- **Speed.** A transfer first took ~100 s. Half of that was the public testnet RPC answering in 0.04–8 s per call at random; the rest was waiting for the anchor before paying the family. Switching to faster public RPCs with failover and paying from the float first brought arrival to ~6 s.
- **Partnerships can't be built in two weeks.** A real MoneyGram payout listing and a Botswana off-ramp need agreements. Building to the anchor standard means the code is ready when the partners are.
- **Hiding the blockchain.** Every screen had to make sense to a parent who has never heard of USDC — and still be honest about what's underneath when they want to know.
- **Making Poseidon agree on both sides.** The circuit hashes with circomlib's Poseidon; the contract only has Stellar's low-level permutation host function. We generated the constants from the same library the apps use, built the sponge in the contract, and checked it against circomlib's test vectors before trusting a single proof.
- **Getting a proof verified on chain.** Point encodings (G2 as c1‖c0, the Ethereum convention), the exact order of public signals, binding the payout address into the proof, and a trusted setup that has to match the proving key the apps ship. The contract tests replay real proofs, so a drift between circuit, key and contract fails loudly instead of silently.
- **Tooling that would not install.** The circom compiler could not be built from source in our environment; we used its WebAssembly build instead, and Stellar's Poseidon crate pinned an older SDK, so we generated our own tables rather than fork it. A half-finished install once left the Stellar SDK hanging on import for an hour of head-scratching; a clean reinstall fixed it.
- **A note tree needs an upgrade path.** The first contract had no upgrade function, so adding the note tree meant a new pool; the new one upgrades in place.
- **Two notes per proof, no limit for the user.** A spend can take at most two notes, but a family's savings are many (every deposit, every change). Instead of a per-send limit, the app combines notes two at a time with spends that pay nothing out, then sends — each a real transaction shown in the status pill.
- **Finding your own money.** The recipient's phone has to discover a note someone else made for it without anyone being told. Each note carries a memo sealed to the owner's key, and the phone scans new notes and tries to open them.
- **A demo page people can actually use.** Four phones on one screen was too much. The page now shows Mom's phone and the one the money involves, switching as people act; the under-the-hood detail collapsed into a status pill. Along the way, invisible phones were silently swallowing clicks, which only a real-mouse test caught.
- **Scope.** In-app bill payment and scheduled payouts are version two.

## Accomplishments that we're proud of

- A real family's problem, documented step by step with their own numbers, solved end to end on testnet and running publicly.
- Money that arrives in seconds, on the anchor standards the whole Stellar ecosystem shares.
- Private transfers between family members with real zero-knowledge proofs, made on the phone and verified by the contract on testnet, measured at about six seconds from tap to the other phone.
- Sender interviews across six corridors (Botswana, China, Egypt, India, Nigeria, Zimbabwe) confirming the problem is not unique to one country, and showing where it differs: for China and India, the hard direction is money going out.
- A model that earns without charging families anything.

## What we learned

- The cost of a remittance hides in the exchange rate, not the fee line: about 5%, against the UN's 3% target.
- The last mile is the product: holding, saving and spending the money after it lands. A P10,000 cap and a P4,000 swipe limit turn one school fee into six transfers or twelve swipes.
- Corridors differ in direction. Into China and India the transfer is easy; out of them it is the hard part. And some senders are not sending occasional support but standing payments: a mortgage, an investment plan, every month.
- Stellar's anchors make the regulated steps someone else's licensed job, which is what lets a small team build this.
- Prefunding is what makes "instant" possible — settle with the network later, pay the family now.
- A clear user story makes design decisions easy. Abstracting the chain away was the right call the moment we pictured Kate's mom using it.

## What's next for Boloka

- Go live with MoneyGram and a licensed Botswana off-ramp as anchors.
- Pilot with one community in Botswana, starting with Kate's family.
- Version two: school fees, electricity, water and phone paid in-app; scheduled payouts (the monthly mortgage and the auto-invest plan our Indian interviewee pays by hand today); a multi-party trusted-setup ceremony and an audit of the circuit and contract before mainnet.
- Expand across Southern Africa and to high-inflation corridors such as Egypt. 800 million people depend on money sent from abroad.
- Later, the other direction: for families in China and India, a Boloka account funded in-country that a student abroad spends in dollars, where getting money out is the problem the interviews named.
