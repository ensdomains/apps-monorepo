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

type UserIdentifier = {
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
} as const

export type FeatureFlag = keyof typeof FEATURE_FLAGS

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
