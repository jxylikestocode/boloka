# Boloka — demo build (for recording)

A copy of `../app` with every network call replaced by local, simulated
behaviour. No testnet, no faucet, no Freighter, no anchor, no `.env`. Same
screens, same copy; actions pause briefly so busy states show on camera.
State lives in this browser's localStorage, on port 5174, so it never mixes
with the real app on 5173.

```bash
npm install
# Three separate apps, each on its own port (own origin, own storage,
# own home-screen identity). Add `-- --host <tailscale-ip>` to reach them
# from a phone.
npm run dev:boloka      # Boloka         http://localhost:5174  (+ /lender /admin /dev)
npm run dev:moneygram   # MoneyGram      http://localhost:5175
npm run dev:bank        # Kalahari Bank  http://localhost:5176
# or everything on one port, by path (/moneygram, /bank): npm run dev
```

## Recording script

MoneyGram and Boloka are separate apps. Best on camera: two browser windows
side by side, sized like phones — **MoneyGram** on port 5175 (Kate in Canada),
**Boloka** on port 5174 (Mma Kgosi in Botswana).

1. `/dev` → **Reset demo** (savings back to P 0), then open Boloka at `/`.
2. MoneyGram: Continue with 1,000 CAD → anchor progress → MoneyGram's own
   **Money delivered** receipt. The sender stays in MoneyGram.
3. Boloka (other window): a **"Money from Lerato arrived · P 9,930"**
   notification drops in and the balance updates. Tap it → Money received.
4. MoneyGram: Send again → type `10000` → Orange Money and Cash pickup grey
   out → Continue → receipt. Boloka: notification **+P 99,300**, Home **P 109,230**.
5. Boloka: **Withdraw** → bank account (default, no limit) → e.g. P 20,000 →
   "Transfer successful" receipt. Switching to Orange Money shows its
   P 10,000 cap and disables the button for amounts above it.
   With the **bank app** open on port 5176 (Kalahari Bank, a fictional bank) in
   another window, the balance counts up with a "+P 19,990.00 from Boloka
   Dollar Savings" chip, and the credit slides in at the top of Transactions
   marked NEW (no pop-up over the bank app).

One window works too: send in MoneyGram, then open `/` — any transfer from
the last 2 minutes that hasn't been opened still shows as a notification.

6. Boloka: Show a lender → Create proof → Copy → open `/lender` → paste → Verify → **APPROVED**.
7. `/admin` → Connect Freighter (simulated, connects as the admin) → Recall / Lend.

What's simulated lives in `src/mock.ts`, `src/chain.ts`, `src/savings.tsx`,
`src/deposit.ts`, `src/anchor.ts`, `src/freighter.ts` and `src/verify.ts`.

## On a phone, as native apps

Run the three servers with `-- --host <tailscale-ip>`, then on the phone open
each app's port and add it to the home screen (keep "Open as Web App" on):

- **iPhone (Safari):** Share → Add to Home Screen, once each on ports 5174,
  5175 and 5176. You get three icons — Boloka, MoneyGram, Kalahari — that open
  full screen with no browser bars.
- **Android (Chrome):** ⋮ → Add to Home screen. Over plain `http://` Chrome adds a
  shortcut that opens in a tab; true full-screen install on Android needs HTTPS.

Demo state (savings, transfers, schedule) is kept by the dev server in
`.demo-state.json` and mirrored to every open app every 1.5 s, so the three
home-screen apps — and the Mac and the phone — see the same transfers.
**Reset demo** on `/dev` resets it everywhere.
