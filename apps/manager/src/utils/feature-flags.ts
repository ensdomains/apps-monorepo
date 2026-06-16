export const BASE_USER_LISTS = {
  TEAM: ['team@example.com', 'dev@example.com'],
  QA: ['qa@example.com'],
  BETA: ['beta@example.com'],
} as const

export type UserIdentifier = {
  walletAddress?: string | null
  email?: string | null
  phone?: string | null
}

type FeatureFlagConfig = {
  enabled: boolean
  allowedUsers?: readonly string[]
  deniedUsers?: readonly string[]
}

const FEATURE_FLAGS_INTERNAL = {
  DISCOUNTS_APPLIED: {
    enabled: import.meta.env.VITE_FF_DISCOUNTS_APPLIED === 'true',
  },
  SKIP_NOTIFICATION_SETTINGS: {
    enabled: false,
  },
  SEARCH_RESULTS_BLUR_BACKDROP: {
    enabled: import.meta.env.VITE_FF_SEARCH_RESULTS_BLUR_BACKDROP === 'true',
  },
  USE_WARP_INFRA: {
    enabled: import.meta.env.VITE_FF_USE_WARP_INFRA === 'true',
    allowedUsers: [...BASE_USER_LISTS.TEAM],
  },
  LANGUAGE_SELECTOR: {
    enabled: import.meta.env.VITE_FF_LANGUAGE_SELECTOR === 'true',
  },
  MIGRATION: {
    enabled: import.meta.env.VITE_FF_MIGRATION === 'true',
  },
  PROFILE_VIEW_NEW: {
    enabled: import.meta.env.VITE_FF_PROFILE_VIEW_NEW === 'true',
  },
  /** Favorite/search demand stats in the temp premium price cooldown banner. */
  TEMP_PREMIUM_NAME_STATS: {
    enabled: import.meta.env.VITE_FF_TEMP_PREMIUM_NAME_STATS === 'true',
  },
  REGISTRATION_V2: {
    enabled: true,
  },
  /**
   * Force the transaction manager to use plain EOA signing only — bypasses
   * the Rhinestone smart-account flow entirely. Useful for environments
   * (e.g. the Tenderly virtual sepolia fork) where the relayer/bundler
   * infrastructure isn't available.
   */
  USE_EOA: {
    enabled: import.meta.env.VITE_FF_USE_EOA === 'true',
  },
  /**
   * Enable paying ENS registration rent from L2 stables (Base Sepolia USDC)
   * via Rhinestone cross-chain intents. When off, only L1 (Sepolia)
   * USDC/DAI payment sources are offered. The rent is always charged in the
   * L1 destination token; the L2 stable is bridged to satisfy it.
   */
  L2_STABLES: {
    enabled: import.meta.env.VITE_FF_L2_STABLES === 'true',
  },
} as const satisfies Record<string, FeatureFlagConfig | boolean>

export type TransactionInfra = 'warp'
export type FeatureFlag = keyof typeof FEATURE_FLAGS_INTERNAL

// Typescript hack to correctly infer the flag names but keep the config type as generic
export const FEATURE_FLAGS = FEATURE_FLAGS_INTERNAL as Record<
  FeatureFlag,
  FeatureFlagConfig | boolean
>

function normalizeIdentifier(id: string): string {
  return id.trim().toLowerCase()
}

function matchesUser(identifier: UserIdentifier, user: string): boolean {
  const normalizedUser = normalizeIdentifier(user)

  if (identifier.walletAddress) {
    if (normalizeIdentifier(identifier.walletAddress) === normalizedUser) {
      return true
    }
  }

  if (identifier.email) {
    if (normalizeIdentifier(identifier.email) === normalizedUser) {
      return true
    }
  }

  if (identifier.phone) {
    if (normalizeIdentifier(identifier.phone) === normalizedUser) {
      return true
    }
  }

  return false
}

function isUserInList(
  identifier: UserIdentifier,
  users: readonly string[],
): boolean {
  return users.some((user) => matchesUser(identifier, user))
}

export function isFeatureEnabled(
  featureName: FeatureFlag,
  identifier?: UserIdentifier,
): boolean {
  const config = FEATURE_FLAGS[featureName]

  if (typeof config === 'boolean') {
    return config
  }

  if (!config) {
    return false
  }

  const baseEnabled = config.enabled

  if (!identifier) {
    return baseEnabled
  }

  if (config.deniedUsers && isUserInList(identifier, config.deniedUsers)) {
    return false
  }

  if (config.allowedUsers && isUserInList(identifier, config.allowedUsers)) {
    return true
  }

  return baseEnabled
}

export function getTransactionInfra(
  _identifier?: UserIdentifier,
): TransactionInfra {
  // Rhinestone HCA operations always route through the Warp orchestrator
  // (intent-based, relayer-sponsored). Warp is the only supported infra.
  return 'warp'
}

/**
 * Resolves which infrastructure to use for a transaction.
 * Priority: explicit override > signer default > feature flag
 */
export function resolveInfrastructure(
  options?: { infrastructure?: TransactionInfra },
  signerDefaultInfra?: TransactionInfra,
  identifier?: UserIdentifier,
): TransactionInfra {
  if (options?.infrastructure) {
    return options.infrastructure
  }

  if (signerDefaultInfra) {
    return signerDefaultInfra
  }

  return getTransactionInfra(identifier)
}
