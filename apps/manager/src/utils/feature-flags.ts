export const PARA_TEST_ACCOUNTS = {
  EMAILS: [
    'dev@test.getpara.com',
    'test1@test.getpara.com',
    'test2@test.getpara.com',
  ],
  PHONES: ['(425)-555-1234', '(206)-555-9876', '(310)-555-0001'],
} as const

export const BASE_USER_LISTS = {
  TEAM: ['team@example.com', 'dev@example.com'],
  QA: ['qa@example.com'],
  BETA: ['beta@example.com'],
  PARA_TEST: [...PARA_TEST_ACCOUNTS.EMAILS, ...PARA_TEST_ACCOUNTS.PHONES],
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

export const FEATURE_FLAGS: Record<string, FeatureFlagConfig | boolean> = {
  DISCOUNTS_APPLIED: {
    enabled: import.meta.env.VITE_FF_DISCOUNTS_APPLIED === 'true',
  },
  SKIP_NOTIFICATION_SETTINGS: {
    enabled: false,
  },
  SEARCH_RESULTS_BLUR_BACKDROP: {
    enabled: import.meta.env.VITE_FF_SEARCH_RESULTS_BLUR_BACKDROP === 'true',
  },
  RHINESTONE_SESSIONS: {
    enabled: import.meta.env.VITE_FF_RHINESTONE_SESSIONS === 'true',
    allowedUsers: [...BASE_USER_LISTS.TEAM],
  },
  USE_WARP_INFRA: {
    enabled: import.meta.env.VITE_FF_USE_WARP_INFRA === 'true',
    allowedUsers: [...BASE_USER_LISTS.TEAM],
  },
  LANGUAGE_SELECTOR: {
    enabled: import.meta.env.VITE_FF_LANGUAGE_SELECTOR === 'true',
  },
} as const

export type FeatureFlag = keyof typeof FEATURE_FLAGS
export type SessionProvider = 'zerodev' | 'rhinestone'
export type TransactionInfra = 'warp' | 'pimlico'

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

export function getSessionProvider(
  identifier?: UserIdentifier,
): SessionProvider {
  return isFeatureEnabled('RHINESTONE_SESSIONS', identifier)
    ? 'rhinestone'
    : 'zerodev'
}

export function getTransactionInfra(
  identifier?: UserIdentifier,
): TransactionInfra {
  return isFeatureEnabled('USE_WARP_INFRA', identifier) ? 'warp' : 'pimlico'
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
