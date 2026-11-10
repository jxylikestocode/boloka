// Features outside the core three problems (transfer cap, the cash trip for
// school fees, pula losing value) are off unless enabled in app/.env. Their
// code — and the contract's nullifier logic behind the privacy story — stays.
const env = import.meta.env as Record<string, string | undefined>

export const FEATURES = {
  /** Monthly scheduled withdrawals ("Drip"). */
  drip: env.VITE_FEATURE_DRIP === 'true',
  /** The "Your privacy" explainer. */
  privacy: env.VITE_FEATURE_PRIVACY === 'true',
}
