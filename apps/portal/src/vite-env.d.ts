/// <reference types="vite/client" />

/**
 * Build-time environment read by the portal. Declared so a typo in a variable
 * name is a type error rather than a silent `any`.
 *
 * Only `src/config.ts` should read network and endpoint values; the rest are
 * app concerns (analytics, dev tooling, test wallets).
 */
interface ImportMetaEnv {
  /** Target network. Required: the build fails if it is unset or unknown. */
  readonly VITE_ENS_NETWORK?: string
  readonly VITE_SEPOLIA_RPC_URL?: string
  readonly VITE_SEPOLIA_RPC_URL_SERVER?: string
  readonly VITE_INDEXER_GRAPHQL_URL?: string
  readonly VITE_MANAGER_APP_URL?: string
  readonly VITE_TIME_TRAVEL?: string
  readonly VITE_TIME_TRAVEL_RPC?: string
  readonly VITE_DQA?: string
  readonly VITE_DQA_URL?: string
  readonly VITE_DQA_LINEAR_ISSUE?: string
  readonly VITE_USE_MOCK_WALLET?: string
  readonly VITE_MOCK_ACCOUNT?: string
  readonly VITE_PUBLIC_POSTHOG_KEY?: string
  readonly VITE_PUBLIC_POSTHOG_HOST?: string
  readonly VITE_PUBLIC_POSTHOG_FEEDBACK_SURVEY_ID?: string
  readonly VITE_CSP_ENFORCE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
