# Boloka

> **Disclaimer.** This project was generated 100% by Claude (Anthropic's AI) during a
> hackathon, with no human-written code. It is a prototype on Stellar **testnet** and is
> **not suitable for production**: the contract is unaudited, the privacy design is a
> placeholder, and funds would not be safe. Do not use it with real money.

A dollar savings account for families in Botswana receiving money from relatives abroad,
built on Stellar: a Soroban savings pool, Stellar anchors (SEP-10 / SEP-24) for money in and
out, and Blend for yield. Three apps make up the demo: the sender's MoneyGram-style screen,
Boloka itself, and a fictional bank where payouts land.

See [CLAUDE.md](CLAUDE.md) for the architecture, what is real on testnet vs simulated, and
how to run it (`./deploy.sh`, `cd app && npm run demo:e2e`, `npm run dev:*`).
