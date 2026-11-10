// The chain explorer every link points at. stellarchain.io renders testnet
// Soroban transactions; stellar.expert's web pages currently answer
// "Transaction not found" for testnet transactions its own API does have.
export const EXPLORER = 'https://testnet.stellarchain.io'
export const EXPLORER_NAME = 'stellarchain.io'
export const txUrl = (hash: string) => `${EXPLORER}/transactions/${hash}`
