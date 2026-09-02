import { type Address, type Hex, isAddress } from 'viem'

const JOURNAL_VERSION = 2 as const
const LEGACY_JOURNAL_VERSION = 1 as const
const OBSOLETE_LEGACY_ATTEMPT_ID = 'legacy-v1' as const
const OBSOLETE_LEGACY_REVOCATION_ID = 'legacy-v1-revocation' as const

export const MIGRATION_APPROVAL_CLEANUP_STORAGE_KEY_PREFIX =
  'ens-apps:atomic-hca-migration:approval-cleanup:v1:' as const

export const MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID =
  'eth-registry:hca' as const

export type MigrationApprovalCleanupJournalStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'
>

export type MigrationApprovalCleanupJournalScope = {
  readonly chainId: number
  readonly owner: Address
  readonly hca: Address
}

export type MigrationApprovalCleanupAttemptState =
  | 'prompt-pending'
  | 'grant-submitted'
  | 'historical'

export type MigrationApprovalCleanupObligation = {
  readonly version: typeof JOURNAL_VERSION
  readonly scope: MigrationApprovalCleanupJournalScope
  readonly approvalId: typeof MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID
  readonly attemptId: string
  readonly state: MigrationApprovalCleanupAttemptState
  readonly grantHash?: Hex
  readonly createdAt: number
}

export type MigrationApprovalCleanupPendingRevocation = {
  readonly revocationId: string
  readonly attemptIds: readonly string[]
  readonly hash: Hex
}

export type MigrationApprovalCleanupJournalSnapshot = {
  readonly obligations: readonly MigrationApprovalCleanupObligation[]
  readonly pendingRevocations: readonly MigrationApprovalCleanupPendingRevocation[]
}

type AttemptRecord = MigrationApprovalCleanupObligation & {
  readonly type: 'attempt'
}

type AttemptResolutionRecord = {
  readonly version: typeof JOURNAL_VERSION
  readonly type: 'attempt-resolution'
  readonly scope: MigrationApprovalCleanupJournalScope
  readonly attemptId: string
  readonly outcome: 'rejected' | 'discharged'
  readonly revocationId?: string
  readonly createdAt: number
}

type GrantReplacementRecord = {
  readonly version: typeof JOURNAL_VERSION
  readonly type: 'grant-replacement'
  readonly scope: MigrationApprovalCleanupJournalScope
  readonly attemptId: string
  readonly replacedHash: Hex
  readonly replacementHash: Hex
  readonly createdAt: number
}

type RevocationRecord = {
  readonly version: typeof JOURNAL_VERSION
  readonly type: 'revocation'
  readonly scope: MigrationApprovalCleanupJournalScope
  readonly revocationId: string
  readonly attemptIds: readonly string[]
  readonly hash: Hex
  readonly createdAt: number
}

type RevocationResolutionRecord = {
  readonly version: typeof JOURNAL_VERSION
  readonly type: 'revocation-resolution'
  readonly scope: MigrationApprovalCleanupJournalScope
  readonly revocationId: string
  readonly outcome: 'confirmed' | 'failed'
  readonly createdAt: number
}

type JournalRecord =
  | AttemptRecord
  | AttemptResolutionRecord
  | GrantReplacementRecord
  | RevocationRecord
  | RevocationResolutionRecord

type JournalAccumulator = {
  readonly attempts: Map<string, MigrationApprovalCleanupObligation>
  readonly attemptResolutions: AttemptResolutionRecord[]
  readonly grantReplacements: GrantReplacementRecord[]
  readonly revocations: RevocationRecord[]
  readonly revocationResolutions: RevocationResolutionRecord[]
}

type LegacyObligation = {
  readonly version: typeof LEGACY_JOURNAL_VERSION
  readonly scope: MigrationApprovalCleanupJournalScope
  readonly approvalId: typeof MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID
  readonly generation?: number
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
      'No durable migration approval cleanup obligation exists for this attempt.',
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

const isValidLegacyGeneration = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const isTransactionHash = (value: unknown): value is Hex =>
  typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value)

const isJournalId = (value: unknown): value is string =>
  typeof value === 'string' &&
  (value === OBSOLETE_LEGACY_ATTEMPT_ID ||
    value === OBSOLETE_LEGACY_REVOCATION_ID ||
    /^legacy-v1-(?:historical|prompt):(?:unknown|\d+):\d+$/.test(value) ||
    /^legacy-v1-grant:(?:unknown|\d+):\d+:0x[0-9a-f]{64}$/.test(value) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    ))

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

const scopesEqual = (
  first: MigrationApprovalCleanupJournalScope,
  second: MigrationApprovalCleanupJournalScope,
): boolean => scopeKey(first) === scopeKey(second)

/** Stable key used by the first implementation; retained for safe recovery. */
export const getMigrationApprovalCleanupStorageKey = (
  scope: MigrationApprovalCleanupJournalScope,
): string =>
  `${MIGRATION_APPROVAL_CLEANUP_STORAGE_KEY_PREFIX}${scopeKey(
    normaliseScope(scope),
  )}`

const getScopeEventPrefix = (
  scope: MigrationApprovalCleanupJournalScope,
): string => `${getMigrationApprovalCleanupStorageKey(scope)}:`

const attemptKey = (
  scope: MigrationApprovalCleanupJournalScope,
  attemptId: string,
): string => `${getScopeEventPrefix(scope)}attempt:${attemptId}`

const attemptResolutionKey = (
  scope: MigrationApprovalCleanupJournalScope,
  record: AttemptResolutionRecord,
): string =>
  `${getScopeEventPrefix(scope)}attempt-resolution:${record.attemptId}:${record.outcome}:${record.revocationId ?? 'none'}`

const grantReplacementKey = (
  scope: MigrationApprovalCleanupJournalScope,
  attemptId: string,
): string => `${getScopeEventPrefix(scope)}grant-replacement:${attemptId}`

const revocationKey = (
  scope: MigrationApprovalCleanupJournalScope,
  revocationId: string,
): string => `${getScopeEventPrefix(scope)}revocation:${revocationId}`

const revocationResolutionKey = (
  scope: MigrationApprovalCleanupJournalScope,
  record: RevocationResolutionRecord,
): string =>
  `${getScopeEventPrefix(scope)}revocation-resolution:${record.revocationId}:${record.outcome}`

const getBrowserStorage = (): MigrationApprovalCleanupJournalStorage | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export const createMigrationApprovalCleanupJournalId = (): string => {
  try {
    const id = globalThis.crypto?.randomUUID()
    if (!isJournalId(id)) {
      throw new Error('crypto.randomUUID returned an invalid identifier')
    }
    return id.toLowerCase()
  } catch (cause) {
    throw new MigrationApprovalCleanupJournalUnavailableError(cause)
  }
}

const validateJournalId = (id: string): string => {
  if (!isJournalId(id)) {
    throw new MigrationApprovalCleanupJournalValidationError(
      'invalid journal identifier',
    )
  }
  return id.toLowerCase()
}

const validateHash = (hash: Hex): Hex => {
  if (!isTransactionHash(hash)) {
    throw new MigrationApprovalCleanupJournalValidationError(
      'invalid transaction hash',
    )
  }
  return hash
}

const parseAttemptRecord = (
  value: Record<string, unknown>,
  expectedScope: MigrationApprovalCleanupJournalScope,
): AttemptRecord | null => {
  if (
    !hasExactKeys(
      value,
      [
        'version',
        'type',
        'scope',
        'approvalId',
        'attemptId',
        'state',
        'createdAt',
      ],
      ['grantHash'],
    ) ||
    value.version !== JOURNAL_VERSION ||
    value.type !== 'attempt' ||
    value.approvalId !== MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID ||
    !isJournalId(value.attemptId) ||
    !isValidCreatedAt(value.createdAt)
  ) {
    return null
  }
  const parsedScope = parseScope(value.scope)
  if (!parsedScope || !scopesEqual(parsedScope, expectedScope)) return null
  if (
    value.state !== 'prompt-pending' &&
    value.state !== 'grant-submitted' &&
    value.state !== 'historical'
  ) {
    return null
  }
  if (
    value.state === 'grant-submitted'
      ? !isTransactionHash(value.grantHash)
      : Object.hasOwn(value, 'grantHash')
  ) {
    return null
  }

  return {
    version: JOURNAL_VERSION,
    type: 'attempt',
    scope: parsedScope,
    approvalId: MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID,
    attemptId: value.attemptId.toLowerCase(),
    state: value.state,
    ...(isTransactionHash(value.grantHash)
      ? { grantHash: value.grantHash }
      : {}),
    createdAt: value.createdAt,
  }
}

const parseAttemptResolutionRecord = (
  value: Record<string, unknown>,
  expectedScope: MigrationApprovalCleanupJournalScope,
): AttemptResolutionRecord | null => {
  if (
    !hasExactKeys(
      value,
      ['version', 'type', 'scope', 'attemptId', 'outcome', 'createdAt'],
      ['revocationId'],
    ) ||
    value.version !== JOURNAL_VERSION ||
    value.type !== 'attempt-resolution' ||
    !isJournalId(value.attemptId) ||
    !isValidCreatedAt(value.createdAt) ||
    (value.outcome !== 'rejected' && value.outcome !== 'discharged')
  ) {
    return null
  }
  const parsedScope = parseScope(value.scope)
  if (!parsedScope || !scopesEqual(parsedScope, expectedScope)) return null
  if (
    value.outcome === 'discharged'
      ? !isJournalId(value.revocationId)
      : Object.hasOwn(value, 'revocationId')
  ) {
    return null
  }
  return {
    version: JOURNAL_VERSION,
    type: 'attempt-resolution',
    scope: parsedScope,
    attemptId: value.attemptId.toLowerCase(),
    outcome: value.outcome,
    ...(isJournalId(value.revocationId)
      ? { revocationId: value.revocationId.toLowerCase() }
      : {}),
    createdAt: value.createdAt,
  }
}

const parseGrantReplacementRecord = (
  value: Record<string, unknown>,
  expectedScope: MigrationApprovalCleanupJournalScope,
): GrantReplacementRecord | null => {
  if (
    !hasExactKeys(value, [
      'version',
      'type',
      'scope',
      'attemptId',
      'replacedHash',
      'replacementHash',
      'createdAt',
    ]) ||
    value.version !== JOURNAL_VERSION ||
    value.type !== 'grant-replacement' ||
    !isJournalId(value.attemptId) ||
    !isTransactionHash(value.replacedHash) ||
    !isTransactionHash(value.replacementHash) ||
    value.replacedHash.toLowerCase() === value.replacementHash.toLowerCase() ||
    !isValidCreatedAt(value.createdAt)
  ) {
    return null
  }
  const parsedScope = parseScope(value.scope)
  if (!parsedScope || !scopesEqual(parsedScope, expectedScope)) return null
  return {
    version: JOURNAL_VERSION,
    type: 'grant-replacement',
    scope: parsedScope,
    attemptId: value.attemptId.toLowerCase(),
    replacedHash: value.replacedHash,
    replacementHash: value.replacementHash,
    createdAt: value.createdAt,
  }
}

const parseAttemptIds = (value: unknown): readonly string[] | null => {
  if (!Array.isArray(value) || !value.every(isJournalId)) return null
  const normalised = value.map((id) => id.toLowerCase())
  return new Set(normalised).size === normalised.length ? normalised : null
}

const parseRevocationRecord = (
  value: Record<string, unknown>,
  expectedScope: MigrationApprovalCleanupJournalScope,
): RevocationRecord | null => {
  if (
    !hasExactKeys(value, [
      'version',
      'type',
      'scope',
      'revocationId',
      'attemptIds',
      'hash',
      'createdAt',
    ]) ||
    value.version !== JOURNAL_VERSION ||
    value.type !== 'revocation' ||
    !isJournalId(value.revocationId) ||
    !isTransactionHash(value.hash) ||
    !isValidCreatedAt(value.createdAt)
  ) {
    return null
  }
  const parsedScope = parseScope(value.scope)
  const attemptIds = parseAttemptIds(value.attemptIds)
  if (!parsedScope || !scopesEqual(parsedScope, expectedScope) || !attemptIds) {
    return null
  }
  return {
    version: JOURNAL_VERSION,
    type: 'revocation',
    scope: parsedScope,
    revocationId: value.revocationId.toLowerCase(),
    attemptIds,
    hash: value.hash,
    createdAt: value.createdAt,
  }
}

const parseRevocationResolutionRecord = (
  value: Record<string, unknown>,
  expectedScope: MigrationApprovalCleanupJournalScope,
): RevocationResolutionRecord | null => {
  if (
    !hasExactKeys(value, [
      'version',
      'type',
      'scope',
      'revocationId',
      'outcome',
      'createdAt',
    ]) ||
    value.version !== JOURNAL_VERSION ||
    value.type !== 'revocation-resolution' ||
    !isJournalId(value.revocationId) ||
    (value.outcome !== 'confirmed' && value.outcome !== 'failed') ||
    !isValidCreatedAt(value.createdAt)
  ) {
    return null
  }
  const parsedScope = parseScope(value.scope)
  if (!parsedScope || !scopesEqual(parsedScope, expectedScope)) return null
  return {
    version: JOURNAL_VERSION,
    type: 'revocation-resolution',
    scope: parsedScope,
    revocationId: value.revocationId.toLowerCase(),
    outcome: value.outcome,
    createdAt: value.createdAt,
  }
}

const parseJournalRecord = (
  raw: string,
  expectedScope: MigrationApprovalCleanupJournalScope,
): JournalRecord | null => {
  let value: unknown
  try {
    value = JSON.parse(raw) as unknown
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  switch (value.type) {
    case 'attempt':
      return parseAttemptRecord(value, expectedScope)
    case 'attempt-resolution':
      return parseAttemptResolutionRecord(value, expectedScope)
    case 'grant-replacement':
      return parseGrantReplacementRecord(value, expectedScope)
    case 'revocation':
      return parseRevocationRecord(value, expectedScope)
    case 'revocation-resolution':
      return parseRevocationResolutionRecord(value, expectedScope)
    default:
      return null
  }
}

const parseLegacyObligation = (
  raw: string,
  expectedScope: MigrationApprovalCleanupJournalScope,
): LegacyObligation | null => {
  let value: unknown
  try {
    value = JSON.parse(raw) as unknown
  } catch {
    return null
  }
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      ['version', 'scope', 'approvalId', 'createdAt'],
      ['generation', 'grantHash', 'revocationHash'],
    ) ||
    value.version !== LEGACY_JOURNAL_VERSION ||
    value.approvalId !== MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID ||
    !isValidCreatedAt(value.createdAt) ||
    (Object.hasOwn(value, 'generation') &&
      !isValidLegacyGeneration(value.generation)) ||
    (Object.hasOwn(value, 'grantHash') &&
      !isTransactionHash(value.grantHash)) ||
    (Object.hasOwn(value, 'revocationHash') &&
      !isTransactionHash(value.revocationHash))
  ) {
    return null
  }
  const parsedScope = parseScope(value.scope)
  if (!parsedScope || !scopesEqual(parsedScope, expectedScope)) return null
  return {
    version: LEGACY_JOURNAL_VERSION,
    scope: parsedScope,
    approvalId: MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID,
    ...(isValidLegacyGeneration(value.generation)
      ? { generation: value.generation }
      : {}),
    ...(isTransactionHash(value.grantHash)
      ? { grantHash: value.grantHash }
      : {}),
    ...(isTransactionHash(value.revocationHash)
      ? { revocationHash: value.revocationHash }
      : {}),
    createdAt: value.createdAt,
  }
}

const expectedRecordKey = (
  scope: MigrationApprovalCleanupJournalScope,
  record: JournalRecord,
): string => {
  switch (record.type) {
    case 'attempt':
      return attemptKey(scope, record.attemptId)
    case 'attempt-resolution':
      return attemptResolutionKey(scope, record)
    case 'grant-replacement':
      return grantReplacementKey(scope, record.attemptId)
    case 'revocation':
      return revocationKey(scope, record.revocationId)
    case 'revocation-resolution':
      return revocationResolutionKey(scope, record)
  }
}

type StorageScan = {
  readonly allKeys: ReadonlySet<string>
  readonly scopeRecords: ReadonlyMap<string, string>
}

const storageScansEqual = (first: StorageScan, second: StorageScan): boolean =>
  first.allKeys.size === second.allKeys.size &&
  first.scopeRecords.size === second.scopeRecords.size &&
  [...first.allKeys].every((key) => second.allKeys.has(key)) &&
  [...first.scopeRecords].every(
    ([key, raw]) => second.scopeRecords.get(key) === raw,
  )

const scanStorageOnce = (params: {
  readonly storage: MigrationApprovalCleanupJournalStorage
  readonly legacyKey: string
  readonly eventPrefix: string
}): StorageScan | null => {
  const lengthBefore = params.storage.length
  const allKeys = new Set<string>()
  const scopeRecords = new Map<string, string>()
  for (let index = 0; index < lengthBefore; index += 1) {
    const key = params.storage.key(index)
    if (key === null || allKeys.has(key)) return null
    allKeys.add(key)
    if (key !== params.legacyKey && !key.startsWith(params.eventPrefix)) {
      continue
    }
    const raw = params.storage.getItem(key)
    if (raw === null) return null
    scopeRecords.set(key, raw)
  }
  if (params.storage.length !== lengthBefore || allKeys.size !== lengthBefore) {
    return null
  }
  return { allKeys, scopeRecords }
}

const listStableScopeRecords = (
  scope: MigrationApprovalCleanupJournalScope,
  storage: MigrationApprovalCleanupJournalStorage | null,
): readonly (readonly [key: string, raw: string])[] => {
  if (!storage) throw new MigrationApprovalCleanupJournalUnavailableError()
  const legacyKey = getMigrationApprovalCleanupStorageKey(scope)
  const eventPrefix = getScopeEventPrefix(scope)
  let previous: StorageScan | undefined
  try {
    for (let scanIndex = 0; scanIndex < 8; scanIndex += 1) {
      const current = scanStorageOnce({ storage, legacyKey, eventPrefix })
      if (!current) {
        previous = undefined
        continue
      }
      if (previous && storageScansEqual(previous, current)) {
        return [...current.scopeRecords]
      }
      previous = current
    }
  } catch (cause) {
    throw new MigrationApprovalCleanupJournalUnavailableError(cause)
  }
  throw new MigrationApprovalCleanupJournalUnavailableError(
    new Error('cleanup journal changed during a consistent read'),
  )
}

const readRaw = (
  key: string,
  storage: MigrationApprovalCleanupJournalStorage | null,
): string | null => {
  if (!storage) throw new MigrationApprovalCleanupJournalUnavailableError()
  try {
    return storage.getItem(key)
  } catch (cause) {
    throw new MigrationApprovalCleanupJournalUnavailableError(cause)
  }
}

const activeSnapshot = (params: {
  readonly attempts: ReadonlyMap<string, MigrationApprovalCleanupObligation>
  readonly attemptResolutions: readonly AttemptResolutionRecord[]
  readonly grantReplacements: readonly GrantReplacementRecord[]
  readonly revocations: readonly RevocationRecord[]
  readonly revocationResolutions: readonly RevocationResolutionRecord[]
}): MigrationApprovalCleanupJournalSnapshot => {
  const attempts = new Map(params.attempts)
  const replacementsByAttempt = new Map<string, GrantReplacementRecord>()
  for (const replacement of params.grantReplacements) {
    if (replacementsByAttempt.has(replacement.attemptId)) {
      throw new MigrationApprovalCleanupJournalCorruptError()
    }
    replacementsByAttempt.set(replacement.attemptId, replacement)
  }
  for (const [attemptId, replacement] of replacementsByAttempt) {
    const attempt = attempts.get(attemptId)
    if (attempt?.state !== 'grant-submitted' || !attempt.grantHash) {
      throw new MigrationApprovalCleanupJournalCorruptError()
    }
    if (
      attempt.grantHash.toLowerCase() !== replacement.replacedHash.toLowerCase()
    ) {
      throw new MigrationApprovalCleanupJournalCorruptError()
    }
    attempts.set(attemptId, {
      ...attempt,
      grantHash: replacement.replacementHash,
    })
  }

  const discharged = new Set(
    params.attemptResolutions
      .filter(({ outcome }) => outcome === 'discharged')
      .map(({ attemptId }) => attemptId),
  )
  const rejected = new Set(
    params.attemptResolutions
      .filter(({ outcome }) => outcome === 'rejected')
      .map(({ attemptId }) => attemptId),
  )
  const obligations = [...attempts.values()].filter((attempt) => {
    if (discharged.has(attempt.attemptId)) return false
    if (attempt.state === 'grant-submitted') return true
    return !rejected.has(attempt.attemptId)
  })
  const dischargeable = new Set(
    obligations
      .filter(({ state }) => state !== 'prompt-pending')
      .map(({ attemptId }) => attemptId),
  )
  const resolvedRevocations = new Set(
    params.revocationResolutions.map(({ revocationId }) => revocationId),
  )
  const pendingRevocations = params.revocations
    .filter(
      ({ revocationId, attemptIds }) =>
        !resolvedRevocations.has(revocationId) &&
        attemptIds.some((attemptId) => dischargeable.has(attemptId)),
    )
    .map(({ revocationId, attemptIds, hash }) => ({
      revocationId,
      attemptIds,
      hash,
    }))

  return { obligations, pendingRevocations }
}

const legacyAttemptIdFor = (
  legacy: LegacyObligation,
  state: MigrationApprovalCleanupAttemptState,
): string => {
  const generation = legacy.generation?.toString() ?? 'unknown'
  if (state === 'grant-submitted' && legacy.grantHash) {
    return `legacy-v1-grant:${generation}:${legacy.createdAt}:${legacy.grantHash.toLowerCase()}`
  }
  return `legacy-v1-${state === 'historical' ? 'historical' : 'prompt'}:${generation}:${legacy.createdAt}`
}

const attemptsEqual = (
  first: MigrationApprovalCleanupObligation,
  second: MigrationApprovalCleanupObligation,
): boolean =>
  first.version === second.version &&
  scopesEqual(first.scope, second.scope) &&
  first.approvalId === second.approvalId &&
  first.attemptId === second.attemptId &&
  first.state === second.state &&
  first.grantHash?.toLowerCase() === second.grantHash?.toLowerCase() &&
  first.createdAt === second.createdAt

const grantReplacementsEqual = (
  first: GrantReplacementRecord,
  second: GrantReplacementRecord,
): boolean =>
  scopesEqual(first.scope, second.scope) &&
  first.attemptId === second.attemptId &&
  first.replacedHash.toLowerCase() === second.replacedHash.toLowerCase() &&
  first.replacementHash.toLowerCase() === second.replacementHash.toLowerCase()

const addLegacyObligation = (params: {
  readonly raw: string
  readonly scope: MigrationApprovalCleanupJournalScope
  readonly accumulator: JournalAccumulator
  readonly storage: MigrationApprovalCleanupJournalStorage | null
}): void => {
  const legacy = parseLegacyObligation(params.raw, params.scope)
  if (!legacy) throw new MigrationApprovalCleanupJournalCorruptError()
  const state: MigrationApprovalCleanupAttemptState = legacy.grantHash
    ? 'grant-submitted'
    : legacy.generation === 0
      ? 'historical'
      : 'prompt-pending'
  const attemptId = legacyAttemptIdFor(legacy, state)
  const record: AttemptRecord = {
    version: JOURNAL_VERSION,
    type: 'attempt',
    scope: params.scope,
    approvalId: MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID,
    attemptId,
    state,
    ...(legacy.grantHash ? { grantHash: legacy.grantHash } : {}),
    createdAt: legacy.createdAt,
  }

  // Import mutable v1 evidence into an immutable v2 key before trusting it.
  // A still-open older tab may later replace or remove the shared v1 key; the
  // shadow keeps every already-observed prompt/grant independently recoverable.
  persistRecord(
    attemptKey(params.scope, attemptId),
    record,
    params.storage,
    'append',
  )
  params.accumulator.attempts.set(attemptId, toObligation(record))

  // A v1 record mutably combined its latest grant and revocation hashes. An
  // older tab can overwrite the grant after the revocation was submitted, so
  // that receipt cannot safely prove which grant evidence it covered. Keep the
  // evidence visible and let v2 submit a fresh, causally bound revocation.
}

const addJournalRecord = (params: {
  readonly key: string
  readonly raw: string
  readonly scope: MigrationApprovalCleanupJournalScope
  readonly accumulator: JournalAccumulator
}): void => {
  const record = parseJournalRecord(params.raw, params.scope)
  if (!record || expectedRecordKey(params.scope, record) !== params.key) {
    throw new MigrationApprovalCleanupJournalCorruptError()
  }
  switch (record.type) {
    case 'attempt': {
      const existing = params.accumulator.attempts.get(record.attemptId)
      if (existing && !attemptsEqual(existing, record)) {
        throw new MigrationApprovalCleanupJournalCorruptError()
      }
      params.accumulator.attempts.set(record.attemptId, toObligation(record))
      return
    }
    case 'attempt-resolution':
      params.accumulator.attemptResolutions.push(record)
      return
    case 'grant-replacement':
      params.accumulator.grantReplacements.push(record)
      return
    case 'revocation':
      params.accumulator.revocations.push(record)
      return
    case 'revocation-resolution':
      params.accumulator.revocationResolutions.push(record)
  }
}

export const loadMigrationApprovalCleanupJournal = (
  scope: MigrationApprovalCleanupJournalScope,
  storage: MigrationApprovalCleanupJournalStorage | null = getBrowserStorage(),
): MigrationApprovalCleanupJournalSnapshot => {
  const normalisedScope = normaliseScope(scope)
  const legacyKey = getMigrationApprovalCleanupStorageKey(normalisedScope)
  const accumulator: JournalAccumulator = {
    attempts: new Map(),
    attemptResolutions: [],
    grantReplacements: [],
    revocations: [],
    revocationResolutions: [],
  }

  for (const [key, raw] of listStableScopeRecords(normalisedScope, storage)) {
    if (key === legacyKey) {
      addLegacyObligation({
        raw,
        scope: normalisedScope,
        accumulator,
        storage,
      })
      continue
    }
    addJournalRecord({ key, raw, scope: normalisedScope, accumulator })
  }

  return activeSnapshot(accumulator)
}

/**
 * Reads one immutable attempt directly by its deterministic key. Cleanup
 * coverage uses this instead of inferring safety from an aggregate storage
 * scan that another tab could change while it is being enumerated.
 */
export const loadMigrationApprovalCleanupAttempt = (
  scope: MigrationApprovalCleanupJournalScope,
  attemptId: string,
  storage: MigrationApprovalCleanupJournalStorage | null = getBrowserStorage(),
): MigrationApprovalCleanupObligation | null => {
  const normalisedScope = normaliseScope(scope)
  const validAttemptId = validateJournalId(attemptId)
  const key = attemptKey(normalisedScope, validAttemptId)
  const raw = readRaw(key, storage)
  if (raw === null) return null
  const parsed = parseJournalRecord(raw, normalisedScope)
  if (
    parsed?.type !== 'attempt' ||
    expectedRecordKey(normalisedScope, parsed) !== key
  ) {
    throw new MigrationApprovalCleanupJournalCorruptError()
  }

  const obligation = toObligation(parsed)
  const replacementKey = grantReplacementKey(normalisedScope, validAttemptId)
  const replacementRaw = readRaw(replacementKey, storage)
  if (replacementRaw === null) return obligation
  const replacement = parseJournalRecord(replacementRaw, normalisedScope)
  if (
    replacement?.type !== 'grant-replacement' ||
    expectedRecordKey(normalisedScope, replacement) !== replacementKey ||
    obligation.state !== 'grant-submitted' ||
    !obligation.grantHash ||
    replacement.replacedHash.toLowerCase() !==
      obligation.grantHash.toLowerCase()
  ) {
    throw new MigrationApprovalCleanupJournalCorruptError()
  }
  return { ...obligation, grantHash: replacement.replacementHash }
}

export const loadMigrationApprovalCleanupObligation = (
  scope: MigrationApprovalCleanupJournalScope,
  storage: MigrationApprovalCleanupJournalStorage | null = getBrowserStorage(),
): MigrationApprovalCleanupObligation | null =>
  loadMigrationApprovalCleanupJournal(scope, storage).obligations.at(0) ?? null

const isIdempotentAppend = (params: {
  readonly key: string
  readonly existing: string
  readonly record: JournalRecord
}): boolean => {
  const existingRecord = parseJournalRecord(
    params.existing,
    params.record.scope,
  )
  if (params.record.type === 'attempt') {
    return (
      existingRecord?.type === 'attempt' &&
      expectedRecordKey(params.record.scope, existingRecord) === params.key &&
      attemptsEqual(existingRecord, params.record)
    )
  }
  if (params.record.type === 'grant-replacement') {
    return (
      existingRecord?.type === 'grant-replacement' &&
      expectedRecordKey(params.record.scope, existingRecord) === params.key &&
      grantReplacementsEqual(existingRecord, params.record)
    )
  }
  if (
    params.record.type !== 'attempt-resolution' &&
    params.record.type !== 'revocation-resolution'
  ) {
    return false
  }
  return (
    existingRecord?.type === params.record.type &&
    expectedRecordKey(params.record.scope, existingRecord) === params.key
  )
}

function persistRecord(
  key: string,
  record: JournalRecord,
  storage: MigrationApprovalCleanupJournalStorage | null,
  mode: 'append' | 'replace',
): void {
  if (!storage) throw new MigrationApprovalCleanupJournalUnavailableError()
  const serialized = JSON.stringify(record)
  try {
    const existing = storage.getItem(key)
    if (mode === 'append' && existing !== null) {
      if (
        existing === serialized ||
        isIdempotentAppend({ key, existing, record })
      ) {
        return
      }
      throw new MigrationApprovalCleanupJournalCorruptError()
    }
    storage.setItem(key, serialized)
    if (storage.getItem(key) !== serialized) {
      throw new MigrationApprovalCleanupJournalCorruptError()
    }
  } catch (cause) {
    if (cause instanceof MigrationApprovalCleanupJournalCorruptError) {
      throw cause
    }
    throw new MigrationApprovalCleanupJournalUnavailableError(cause)
  }
  emitJournalChange()
}

const validateCreatedAt = (createdAt: number): number => {
  if (!isValidCreatedAt(createdAt)) {
    throw new MigrationApprovalCleanupJournalValidationError(
      'invalid creation timestamp',
    )
  }
  return createdAt
}

const toObligation = (
  record: AttemptRecord,
): MigrationApprovalCleanupObligation => ({
  version: record.version,
  scope: record.scope,
  approvalId: record.approvalId,
  attemptId: record.attemptId,
  state: record.state,
  ...(record.grantHash ? { grantHash: record.grantHash } : {}),
  createdAt: record.createdAt,
})

const createAttempt = (params: {
  readonly scope: MigrationApprovalCleanupJournalScope
  readonly state: MigrationApprovalCleanupAttemptState
  readonly grantHash?: Hex
  readonly storage: MigrationApprovalCleanupJournalStorage | null
  readonly createdAt: number
  readonly attemptId: string
}): MigrationApprovalCleanupObligation => {
  const scope = normaliseScope(params.scope)
  const attemptId = validateJournalId(params.attemptId)
  if (
    (params.state === 'grant-submitted') !==
    (params.grantHash !== undefined)
  ) {
    throw new MigrationApprovalCleanupJournalValidationError(
      'submitted grants require exactly one transaction hash',
    )
  }
  const record: AttemptRecord = {
    version: JOURNAL_VERSION,
    type: 'attempt',
    scope,
    approvalId: MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID,
    attemptId,
    state: params.state,
    ...(params.state === 'grant-submitted' && params.grantHash
      ? { grantHash: validateHash(params.grantHash) }
      : {}),
    createdAt: validateCreatedAt(params.createdAt),
  }
  persistRecord(attemptKey(scope, attemptId), record, params.storage, 'append')
  return toObligation(record)
}

/** Writes a unique marker before opening a temporary-grant wallet prompt. */
export const recordMigrationApprovalCleanupGrantAttempt = (
  scope: MigrationApprovalCleanupJournalScope,
  storage: MigrationApprovalCleanupJournalStorage | null = getBrowserStorage(),
  createdAt: number = Date.now(),
  attemptId: string = createMigrationApprovalCleanupJournalId(),
): MigrationApprovalCleanupObligation => {
  // A corrupt scope must block any new grant before its wallet prompt opens.
  loadMigrationApprovalCleanupJournal(scope, storage)
  return createAttempt({
    scope,
    state: 'prompt-pending',
    storage,
    createdAt,
    attemptId,
  })
}

export const recordMigrationApprovalCleanupGrantHash = (
  scope: MigrationApprovalCleanupJournalScope,
  attemptId: string,
  grantHash: Hex,
  storage: MigrationApprovalCleanupJournalStorage | null = getBrowserStorage(),
): MigrationApprovalCleanupObligation => {
  const normalisedScope = normaliseScope(scope)
  const validAttemptId = validateJournalId(attemptId)
  const key = attemptKey(normalisedScope, validAttemptId)
  const raw = readRaw(key, storage)
  if (raw === null) throw new MigrationApprovalCleanupObligationMissingError()
  const current = parseJournalRecord(raw, normalisedScope)
  if (current?.type !== 'attempt') {
    throw new MigrationApprovalCleanupJournalCorruptError()
  }
  const validGrantHash = validateHash(grantHash)
  if (current.state === 'historical') {
    throw new MigrationApprovalCleanupJournalValidationError(
      'historical evidence cannot become a submitted grant',
    )
  }
  if (current.state === 'grant-submitted') {
    if (current.grantHash?.toLowerCase() === validGrantHash.toLowerCase()) {
      return toObligation(current)
    }
    // Transaction Manager can report both the initially submitted hash and a
    // wallet replacement. Preserve each hash as independent evidence: without
    // proving they share a nonce, a later cleanup must fence both.
    return createAttempt({
      scope: normalisedScope,
      state: 'grant-submitted',
      grantHash: validGrantHash,
      storage,
      createdAt: Date.now(),
      attemptId: createMigrationApprovalCleanupJournalId(),
    })
  }
  const record: AttemptRecord = {
    version: JOURNAL_VERSION,
    type: 'attempt',
    scope: normalisedScope,
    approvalId: MIGRATION_APPROVAL_CLEANUP_APPROVAL_ID,
    attemptId: validAttemptId,
    state: 'grant-submitted',
    grantHash: validGrantHash,
    createdAt: current.createdAt,
  }
  persistRecord(key, record, storage, 'replace')
  return toObligation(record)
}

/**
 * Records a replacement proven by Transaction Manager's successful receipt.
 * The original submission stays immutable while readers follow the append-only
 * replacement chain to the transaction that can actually be queried.
 */
export const recordMigrationApprovalCleanupGrantReplacement = (
  scope: MigrationApprovalCleanupJournalScope,
  attemptId: string,
  replacedHash: Hex,
  replacementHash: Hex,
  storage: MigrationApprovalCleanupJournalStorage | null = getBrowserStorage(),
  createdAt: number = Date.now(),
): MigrationApprovalCleanupObligation => {
  const normalisedScope = normaliseScope(scope)
  const validAttemptId = validateJournalId(attemptId)
  const validReplacedHash = validateHash(replacedHash)
  const validReplacementHash = validateHash(replacementHash)
  if (validReplacedHash.toLowerCase() === validReplacementHash.toLowerCase()) {
    throw new MigrationApprovalCleanupJournalValidationError(
      'replacement hash must differ from the submitted hash',
    )
  }

  const current = loadMigrationApprovalCleanupJournal(
    normalisedScope,
    storage,
  ).obligations.find(({ attemptId: id }) => id === validAttemptId)
  if (current?.state !== 'grant-submitted' || !current.grantHash) {
    throw new MigrationApprovalCleanupObligationMissingError()
  }
  if (current.grantHash.toLowerCase() === validReplacementHash.toLowerCase()) {
    return current
  }
  if (current.grantHash.toLowerCase() !== validReplacedHash.toLowerCase()) {
    throw new MigrationApprovalCleanupJournalValidationError(
      'replacement does not extend the current submitted grant hash',
    )
  }

  const record: GrantReplacementRecord = {
    version: JOURNAL_VERSION,
    type: 'grant-replacement',
    scope: normalisedScope,
    attemptId: validAttemptId,
    replacedHash: validReplacedHash,
    replacementHash: validReplacementHash,
    createdAt: validateCreatedAt(createdAt),
  }
  persistRecord(
    grantReplacementKey(normalisedScope, record.attemptId),
    record,
    storage,
    'append',
  )
  return { ...current, grantHash: validReplacementHash }
}

export const recordMigrationApprovalCleanupPromptRejected = (
  scope: MigrationApprovalCleanupJournalScope,
  attemptId: string,
  storage: MigrationApprovalCleanupJournalStorage | null = getBrowserStorage(),
  createdAt: number = Date.now(),
): void => {
  const normalisedScope = normaliseScope(scope)
  const record: AttemptResolutionRecord = {
    version: JOURNAL_VERSION,
    type: 'attempt-resolution',
    scope: normalisedScope,
    attemptId: validateJournalId(attemptId),
    outcome: 'rejected',
    createdAt: validateCreatedAt(createdAt),
  }
  persistRecord(
    attemptResolutionKey(normalisedScope, record),
    record,
    storage,
    'append',
  )
}

/** Ensures live/historical chain evidence has a dischargeable journal marker. */
export const recordMigrationApprovalCleanupRequired = (
  scope: MigrationApprovalCleanupJournalScope,
  storage: MigrationApprovalCleanupJournalStorage | null = getBrowserStorage(),
  createdAt: number = Date.now(),
  attemptId?: string,
): MigrationApprovalCleanupObligation => {
  const existing = loadMigrationApprovalCleanupJournal(
    scope,
    storage,
  ).obligations.find(({ state }) => state !== 'prompt-pending')
  if (existing) return existing
  return createAttempt({
    scope,
    state: 'historical',
    storage,
    createdAt,
    attemptId: attemptId ?? createMigrationApprovalCleanupJournalId(),
  })
}

export const recordMigrationApprovalCleanupRevocationHash = (
  scope: MigrationApprovalCleanupJournalScope,
  revocationId: string,
  attemptIds: readonly string[],
  revocationHash: Hex,
  storage: MigrationApprovalCleanupJournalStorage | null = getBrowserStorage(),
  createdAt: number = Date.now(),
): void => {
  const normalisedScope = normaliseScope(scope)
  const normalisedAttemptIds = parseAttemptIds(attemptIds)
  if (!normalisedAttemptIds) {
    throw new MigrationApprovalCleanupJournalValidationError(
      'invalid revocation attempt identifiers',
    )
  }
  const record: RevocationRecord = {
    version: JOURNAL_VERSION,
    type: 'revocation',
    scope: normalisedScope,
    revocationId: validateJournalId(revocationId),
    attemptIds: normalisedAttemptIds,
    hash: validateHash(revocationHash),
    createdAt: validateCreatedAt(createdAt),
  }
  persistRecord(
    revocationKey(normalisedScope, record.revocationId),
    record,
    storage,
    'replace',
  )
}

const recordRevocationResolution = (params: {
  readonly scope: MigrationApprovalCleanupJournalScope
  readonly revocationId: string
  readonly outcome: 'confirmed' | 'failed'
  readonly storage: MigrationApprovalCleanupJournalStorage | null
  readonly createdAt: number
}): void => {
  const scope = normaliseScope(params.scope)
  const record: RevocationResolutionRecord = {
    version: JOURNAL_VERSION,
    type: 'revocation-resolution',
    scope,
    revocationId: validateJournalId(params.revocationId),
    outcome: params.outcome,
    createdAt: validateCreatedAt(params.createdAt),
  }
  persistRecord(
    revocationResolutionKey(scope, record),
    record,
    params.storage,
    'append',
  )
}

export const recordMigrationApprovalCleanupRevocationFailed = (
  scope: MigrationApprovalCleanupJournalScope,
  revocationId: string,
  storage: MigrationApprovalCleanupJournalStorage | null = getBrowserStorage(),
  createdAt: number = Date.now(),
): void =>
  recordRevocationResolution({
    scope,
    revocationId,
    outcome: 'failed',
    storage,
    createdAt,
  })

export const recordMigrationApprovalCleanupRevocationConfirmed = (
  scope: MigrationApprovalCleanupJournalScope,
  revocationId: string,
  attemptIds: readonly string[],
  storage: MigrationApprovalCleanupJournalStorage | null = getBrowserStorage(),
  createdAt: number = Date.now(),
): void => {
  const normalisedScope = normaliseScope(scope)
  const normalisedAttemptIds = parseAttemptIds(attemptIds)
  if (!normalisedAttemptIds) {
    throw new MigrationApprovalCleanupJournalValidationError(
      'invalid revocation attempt identifiers',
    )
  }
  const validRevocationId = validateJournalId(revocationId)
  for (const attemptId of normalisedAttemptIds) {
    const record: AttemptResolutionRecord = {
      version: JOURNAL_VERSION,
      type: 'attempt-resolution',
      scope: normalisedScope,
      attemptId,
      outcome: 'discharged',
      revocationId: validRevocationId,
      createdAt: validateCreatedAt(createdAt),
    }
    persistRecord(
      attemptResolutionKey(normalisedScope, record),
      record,
      storage,
      'append',
    )
  }
  recordRevocationResolution({
    scope: normalisedScope,
    revocationId: validRevocationId,
    outcome: 'confirmed',
    storage,
    createdAt,
  })
}
