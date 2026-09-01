import { type Address, type Hex, isAddress } from 'viem'

const JOURNAL_VERSION = 1 as const

export const MIGRATION_APPROVAL_CLEANUP_STORAGE_KEY_PREFIX =
  'ens-apps:atomic-hca-migration:approval-cleanup:v1:' as const

export const MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID =
  'eth-registry:hca' as const

export type MigrationApprovalCleanupJournalStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>

export type MigrationApprovalCleanupJournalScope = {
  readonly chainId: number
  readonly owner: Address
  readonly hca: Address
}

export type MigrationApprovalCleanupObligation = {
  readonly version: typeof JOURNAL_VERSION
  readonly scope: MigrationApprovalCleanupJournalScope
  readonly approvalId: typeof MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID
  readonly grantHash?: Hex
  readonly revocationHash?: Hex
  readonly createdAt: number
}

type JournalListener = () => void

const journalListeners = new Set<JournalListener>()
let journalRevision = 0
let removeStorageListener: (() => void) | null = null

export class MigrationApprovalCleanupJournalValidationError extends Error {
  constructor(message: string) {
    super(`Invalid migration approval cleanup journal value: ${message}`)
    this.name = 'MigrationApprovalCleanupJournalValidationError'
  }
}

export class MigrationApprovalCleanupJournalCorruptError extends Error {
  constructor(cause?: unknown) {
    super(
      'The migration approval cleanup journal is unreadable. Refusing to continue without durable cleanup state.',
      { cause },
    )
    this.name = 'MigrationApprovalCleanupJournalCorruptError'
  }
}

export class MigrationApprovalCleanupJournalUnavailableError extends Error {
  constructor(cause?: unknown) {
    super(
      'Migration approval cleanup storage is unavailable. Refusing to continue without durable cleanup protection.',
      { cause },
    )
    this.name = 'MigrationApprovalCleanupJournalUnavailableError'
  }
}

export class MigrationApprovalCleanupObligationMissingError extends Error {
  constructor() {
    super(
      'No durable migration approval cleanup obligation exists for this scope.',
    )
    this.name = 'MigrationApprovalCleanupObligationMissingError'
  }
}

const emitJournalChange = (): void => {
  journalRevision += 1
  for (const listener of journalListeners) listener()
}

const startStorageListener = (): void => {
  if (removeStorageListener || typeof window === 'undefined') return

  const handleStorage = (event: StorageEvent): void => {
    if (
      event.key !== null &&
      !event.key.startsWith(MIGRATION_APPROVAL_CLEANUP_STORAGE_KEY_PREFIX)
    ) {
      return
    }
    emitJournalChange()
  }

  window.addEventListener('storage', handleStorage)
  removeStorageListener = () => {
    window.removeEventListener('storage', handleStorage)
    removeStorageListener = null
  }
}

export const subscribeMigrationApprovalCleanupJournal = (
  listener: JournalListener,
): (() => void) => {
  journalListeners.add(listener)
  startStorageListener()

  return () => {
    journalListeners.delete(listener)
    if (journalListeners.size === 0) removeStorageListener?.()
  }
}

export const getMigrationApprovalCleanupJournalRevision = (): number =>
  journalRevision

export const getServerMigrationApprovalCleanupJournalRevision = (): number => 0

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const hasExactKeys = (
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): boolean => {
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys])
  return (
    requiredKeys.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowedKeys.has(key))
  )
}

const isValidChainId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

const isValidCreatedAt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const isTransactionHash = (value: unknown): value is Hex =>
  typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value)

const normaliseAddress = (value: Address): Address =>
  value.toLowerCase() as Address

const parseScope = (
  value: unknown,
): MigrationApprovalCleanupJournalScope | null => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['chainId', 'owner', 'hca']) ||
    !isValidChainId(value.chainId) ||
    typeof value.owner !== 'string' ||
    !isAddress(value.owner) ||
    typeof value.hca !== 'string' ||
    !isAddress(value.hca)
  ) {
    return null
  }

  return {
    chainId: value.chainId,
    owner: normaliseAddress(value.owner),
    hca: normaliseAddress(value.hca),
  }
}

const normaliseScope = (
  scope: MigrationApprovalCleanupJournalScope,
): MigrationApprovalCleanupJournalScope => {
  const parsed = parseScope(scope)
  if (!parsed) {
    throw new MigrationApprovalCleanupJournalValidationError('invalid scope')
  }
  return parsed
}

const scopeKey = (scope: MigrationApprovalCleanupJournalScope): string =>
  `${scope.chainId}:${scope.owner}:${scope.hca}`

export const getMigrationApprovalCleanupStorageKey = (
  scope: MigrationApprovalCleanupJournalScope,
): string =>
  `${MIGRATION_APPROVAL_CLEANUP_STORAGE_KEY_PREFIX}${scopeKey(
    normaliseScope(scope),
  )}`

const scopesEqual = (
  first: MigrationApprovalCleanupJournalScope,
  second: MigrationApprovalCleanupJournalScope,
): boolean => scopeKey(first) === scopeKey(second)

const parseObligation = (
  value: unknown,
  expectedScope: MigrationApprovalCleanupJournalScope,
): MigrationApprovalCleanupObligation | null => {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      ['version', 'scope', 'approvalId', 'createdAt'],
      ['grantHash', 'revocationHash'],
    ) ||
    value.version !== JOURNAL_VERSION ||
    value.approvalId !== MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID ||
    !isValidCreatedAt(value.createdAt)
  ) {
    return null
  }

  const parsedScope = parseScope(value.scope)
  if (!parsedScope || !scopesEqual(parsedScope, expectedScope)) return null

  if (
    (Object.hasOwn(value, 'grantHash') &&
      !isTransactionHash(value.grantHash)) ||
    (Object.hasOwn(value, 'revocationHash') &&
      !isTransactionHash(value.revocationHash))
  ) {
    return null
  }

  return {
    version: JOURNAL_VERSION,
    scope: parsedScope,
    approvalId: MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID,
    ...(isTransactionHash(value.grantHash)
      ? { grantHash: value.grantHash }
      : {}),
    ...(isTransactionHash(value.revocationHash)
      ? { revocationHash: value.revocationHash }
      : {}),
    createdAt: value.createdAt,
  }
}

const obligationsEqual = (
  first: MigrationApprovalCleanupObligation,
  second: MigrationApprovalCleanupObligation,
): boolean =>
  first.version === second.version &&
  scopesEqual(first.scope, second.scope) &&
  first.approvalId === second.approvalId &&
  first.grantHash === second.grantHash &&
  first.revocationHash === second.revocationHash &&
  first.createdAt === second.createdAt

const getBrowserStorage = (): MigrationApprovalCleanupJournalStorage | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const readObligation = (
  scope: MigrationApprovalCleanupJournalScope,
  storage: MigrationApprovalCleanupJournalStorage | null,
): MigrationApprovalCleanupObligation | null => {
  if (!storage) throw new MigrationApprovalCleanupJournalUnavailableError()

  let raw: string | null
  try {
    raw = storage.getItem(getMigrationApprovalCleanupStorageKey(scope))
  } catch (cause) {
    throw new MigrationApprovalCleanupJournalUnavailableError(cause)
  }

  if (raw === null) return null

  try {
    const parsed = parseObligation(JSON.parse(raw) as unknown, scope)
    if (!parsed) throw new MigrationApprovalCleanupJournalCorruptError()
    return parsed
  } catch (cause) {
    if (cause instanceof MigrationApprovalCleanupJournalCorruptError) {
      throw cause
    }
    throw new MigrationApprovalCleanupJournalCorruptError(cause)
  }
}

const writeObligation = (
  obligation: MigrationApprovalCleanupObligation,
  storage: MigrationApprovalCleanupJournalStorage | null,
): void => {
  if (!storage) throw new MigrationApprovalCleanupJournalUnavailableError()

  try {
    storage.setItem(
      getMigrationApprovalCleanupStorageKey(obligation.scope),
      JSON.stringify(obligation),
    )
  } catch (cause) {
    throw new MigrationApprovalCleanupJournalUnavailableError(cause)
  }

  const persisted = readObligation(obligation.scope, storage)
  if (!persisted || !obligationsEqual(persisted, obligation)) {
    throw new MigrationApprovalCleanupJournalCorruptError()
  }
  emitJournalChange()
}

const deleteObligation = (
  scope: MigrationApprovalCleanupJournalScope,
  storage: MigrationApprovalCleanupJournalStorage | null,
): void => {
  if (!storage) throw new MigrationApprovalCleanupJournalUnavailableError()

  const key = getMigrationApprovalCleanupStorageKey(scope)
  try {
    storage.removeItem(key)
  } catch (cause) {
    throw new MigrationApprovalCleanupJournalUnavailableError(cause)
  }

  let persisted: string | null
  try {
    persisted = storage.getItem(key)
  } catch (cause) {
    throw new MigrationApprovalCleanupJournalUnavailableError(cause)
  }
  if (persisted !== null) {
    throw new MigrationApprovalCleanupJournalCorruptError()
  }
  emitJournalChange()
}

const requireObligation = (
  scope: MigrationApprovalCleanupJournalScope,
  storage: MigrationApprovalCleanupJournalStorage | null,
): MigrationApprovalCleanupObligation => {
  const obligation = readObligation(scope, storage)
  if (!obligation) throw new MigrationApprovalCleanupObligationMissingError()
  return obligation
}

const validateHash = (hash: Hex): Hex => {
  if (!isTransactionHash(hash)) {
    throw new MigrationApprovalCleanupJournalValidationError(
      'invalid transaction hash',
    )
  }
  return hash
}

export const loadMigrationApprovalCleanupObligation = (
  scope: MigrationApprovalCleanupJournalScope,
  storage: MigrationApprovalCleanupJournalStorage | null = getBrowserStorage(),
): MigrationApprovalCleanupObligation | null =>
  readObligation(normaliseScope(scope), storage)

/**
 * Records the cleanup obligation before requesting the temporary approval from
 * the wallet. Existing state is preserved so a retry cannot erase evidence of
 * an earlier, still-unresolved grant.
 */
export const recordMigrationApprovalCleanupRequired = (
  scope: MigrationApprovalCleanupJournalScope,
  storage: MigrationApprovalCleanupJournalStorage | null = getBrowserStorage(),
  createdAt: number = Date.now(),
): MigrationApprovalCleanupObligation => {
  const normalisedScope = normaliseScope(scope)
  if (!isValidCreatedAt(createdAt)) {
    throw new MigrationApprovalCleanupJournalValidationError(
      'invalid creation timestamp',
    )
  }
  const existing = readObligation(normalisedScope, storage)
  if (existing) return existing

  const obligation: MigrationApprovalCleanupObligation = {
    version: JOURNAL_VERSION,
    scope: normalisedScope,
    approvalId: MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID,
    createdAt,
  }
  writeObligation(obligation, storage)
  return obligation
}

export const recordMigrationApprovalCleanupGrantHash = (
  scope: MigrationApprovalCleanupJournalScope,
  grantHash: Hex,
  storage: MigrationApprovalCleanupJournalStorage | null = getBrowserStorage(),
): MigrationApprovalCleanupObligation => {
  const normalisedScope = normaliseScope(scope)
  const validGrantHash = validateHash(grantHash)
  const obligation = requireObligation(normalisedScope, storage)
  const updated = { ...obligation, grantHash: validGrantHash }
  writeObligation(updated, storage)
  return updated
}

export const recordMigrationApprovalCleanupRevocationHash = (
  scope: MigrationApprovalCleanupJournalScope,
  revocationHash: Hex,
  storage: MigrationApprovalCleanupJournalStorage | null = getBrowserStorage(),
): MigrationApprovalCleanupObligation => {
  const normalisedScope = normaliseScope(scope)
  const validRevocationHash = validateHash(revocationHash)
  const obligation = requireObligation(normalisedScope, storage)
  const updated = {
    ...obligation,
    revocationHash: validRevocationHash,
  }
  writeObligation(updated, storage)
  return updated
}

export const clearMigrationApprovalCleanupRevocationHash = (
  scope: MigrationApprovalCleanupJournalScope,
  storage: MigrationApprovalCleanupJournalStorage | null = getBrowserStorage(),
): MigrationApprovalCleanupObligation => {
  const normalisedScope = normaliseScope(scope)
  const obligation = requireObligation(normalisedScope, storage)
  if (obligation.revocationHash === undefined) return obligation

  const updated: MigrationApprovalCleanupObligation = {
    version: obligation.version,
    scope: obligation.scope,
    approvalId: obligation.approvalId,
    ...(obligation.grantHash ? { grantHash: obligation.grantHash } : {}),
    createdAt: obligation.createdAt,
  }
  writeObligation(updated, storage)
  return updated
}

export const removeMigrationApprovalCleanupObligation = (
  scope: MigrationApprovalCleanupJournalScope,
  storage: MigrationApprovalCleanupJournalStorage | null = getBrowserStorage(),
): void => {
  const normalisedScope = normaliseScope(scope)
  deleteObligation(normalisedScope, storage)
}
