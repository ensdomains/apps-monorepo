import { type Address, type Hex, isAddress } from 'viem'

import type { Profile } from './fetchV1Profiles'
import type { MigrationApprovalId } from './migrationApprovals'
import type { V1Domain } from './v1SubgraphClient'

const JOURNAL_VERSION = 1 as const
const STORAGE_KEY =
  'ens-apps:atomic-hca-migration:submitted-batches:v1:8d1c893' as const

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type MigrationBatchJournalScope = {
  readonly chainId: number
  readonly owner: Address
  readonly hca: Address
}

export type MigrationJournalOperation = {
  readonly name: string
  readonly action: 'migrate' | 'copy'
}

export type SubmittedAtomicMigrationBatch = {
  readonly intentId: string
  readonly hash: Hex
  readonly names: readonly string[]
  readonly operations: readonly MigrationJournalOperation[]
}

export type PendingAtomicMigrationIntent = {
  readonly id: string
  readonly names: readonly string[]
  readonly operations: readonly MigrationJournalOperation[]
}

/**
 * Durable inputs required to rebuild the exact migration tree after a reload.
 * Calls and verification expectations are deliberately not serialized: they
 * are regenerated from this validated source data and the pinned manifest.
 */
export type MigrationRecoverySnapshot = {
  readonly registryDomains: readonly V1Domain[]
  readonly registryOperations: readonly MigrationJournalOperation[]
  readonly remainingOperations: readonly MigrationJournalOperation[]
  readonly completedOperations: readonly MigrationJournalOperation[]
  readonly profiles: ReadonlyMap<Hex, Profile>
  readonly ownedPermRes: Address | null
  readonly plannedApprovals: readonly MigrationRecoveryApproval[]
}

export type MigrationRecoveryApproval = {
  readonly id: MigrationApprovalId
  readonly tokenId?: bigint
}

type StoredRecoveryProfile = {
  readonly node: Hex
  readonly texts: readonly { readonly key: string; readonly value: string }[]
  readonly addresses: readonly {
    readonly coinType: string
    readonly value: Hex
  }[]
  readonly contentHash: Hex | null
  readonly abis: readonly {
    readonly contentType: string
    readonly value: Hex
  }[]
}

type StoredRecoverySnapshot = Omit<
  MigrationRecoverySnapshot,
  'profiles' | 'plannedApprovals'
> & {
  readonly profiles: readonly StoredRecoveryProfile[]
  readonly plannedApprovals: readonly {
    readonly id: MigrationApprovalId
    readonly tokenId?: string
  }[]
}

type StoredEntry = {
  readonly scope: string
  readonly intents: readonly PendingAtomicMigrationIntent[]
  readonly submissions: readonly SubmittedAtomicMigrationBatch[]
  readonly recovery?: StoredRecoverySnapshot
}

type StoredJournal = {
  readonly version: typeof JOURNAL_VERSION
  readonly entries: readonly StoredEntry[]
}

export class MigrationBatchJournalCorruptError extends Error {
  constructor(cause?: unknown) {
    super(
      'The submitted migration transaction journal is unreadable. Refusing to continue without retry state.',
      { cause },
    )
    this.name = 'MigrationBatchJournalCorruptError'
  }
}

export class MigrationBatchJournalUnavailableError extends Error {
  constructor() {
    super(
      'Submitted migration transaction storage is unavailable. Refusing to continue without retry protection.',
    )
    this.name = 'MigrationBatchJournalUnavailableError'
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isTransactionHash = (value: unknown): value is Hex =>
  typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value)

const isHex = (value: unknown): value is Hex =>
  typeof value === 'string' && /^0x(?:[0-9a-fA-F]{2})*$/.test(value)

const isUintString = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return false
  try {
    return BigInt(value) >= 0n
  } catch {
    return false
  }
}

const parseOperationList = (
  value: unknown,
  allowEmpty: boolean,
): readonly MigrationJournalOperation[] | null => {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) return null
  const operations: MigrationJournalOperation[] = []
  const seen = new Set<string>()
  for (const operation of value) {
    if (
      !isRecord(operation) ||
      typeof operation.name !== 'string' ||
      operation.name.length === 0 ||
      (operation.action !== 'migrate' && operation.action !== 'copy') ||
      seen.has(operation.name)
    ) {
      return null
    }
    seen.add(operation.name)
    operations.push({ name: operation.name, action: operation.action })
  }
  return operations
}

const parseOperations = (
  value: unknown,
  legacyNames: readonly string[],
): readonly MigrationJournalOperation[] | null => {
  // Version-one journals predate copy operations. Treat their name-only
  // entries as direct migrations so interrupted migrations remain recoverable.
  if (value === undefined) {
    return legacyNames.map((name) => ({ name, action: 'migrate' as const }))
  }
  const operations = parseOperationList(value, false)
  if (!operations) return null

  const operationNames = operations.map(({ name }) => name)
  if (
    operationNames.length !== legacyNames.length ||
    operationNames.some((name, index) => name !== legacyNames[index])
  ) {
    return null
  }
  return operations
}

const parseNullableRecord = (value: unknown): Record<string, unknown> | null =>
  value === null ? null : isRecord(value) ? value : null

const parseV1Domain = (value: unknown): V1Domain | null => {
  if (!isRecord(value)) return null
  const resolver = parseNullableRecord(value.resolver)
  const registrant = parseNullableRecord(value.registrant)
  const wrappedOwner = parseNullableRecord(value.wrappedOwner)
  const parent = parseNullableRecord(value.parent)
  const registration = parseNullableRecord(value.registration)
  const wrappedDomain = parseNullableRecord(value.wrappedDomain)
  if (
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    (value.labelName !== null && typeof value.labelName !== 'string') ||
    typeof value.labelhash !== 'string' ||
    value.labelhash.length === 0 ||
    typeof value.name !== 'string' ||
    value.name.length === 0 ||
    !isRecord(value.owner) ||
    typeof value.owner.id !== 'string' ||
    (resolver !== null && typeof resolver.address !== 'string') ||
    (registrant !== null && typeof registrant.id !== 'string') ||
    (wrappedOwner !== null && typeof wrappedOwner.id !== 'string') ||
    (parent !== null &&
      (typeof parent.name !== 'string' ||
        (parent.wrappedDomain !== null &&
          (!isRecord(parent.wrappedDomain) ||
            typeof parent.wrappedDomain.fuses !== 'number')))) ||
    (registration !== null && !isUintString(registration.expiryDate)) ||
    (wrappedDomain !== null &&
      (!isUintString(wrappedDomain.expiryDate) ||
        typeof wrappedDomain.fuses !== 'number'))
  ) {
    return null
  }
  return value as unknown as V1Domain
}

const parseStoredProfile = (value: unknown): StoredRecoveryProfile | null => {
  if (
    !isRecord(value) ||
    !isTransactionHash(value.node) ||
    !Array.isArray(value.texts) ||
    !value.texts.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.key === 'string' &&
        typeof entry.value === 'string',
    ) ||
    !Array.isArray(value.addresses) ||
    !value.addresses.every(
      (entry) =>
        isRecord(entry) && isUintString(entry.coinType) && isHex(entry.value),
    ) ||
    (value.contentHash !== null && !isHex(value.contentHash)) ||
    !Array.isArray(value.abis) ||
    !value.abis.every(
      (entry) =>
        isRecord(entry) &&
        isUintString(entry.contentType) &&
        isHex(entry.value),
    )
  ) {
    return null
  }
  return value as unknown as StoredRecoveryProfile
}

const parseRecovery = (value: unknown): StoredRecoverySnapshot | null => {
  if (
    !isRecord(value) ||
    !Array.isArray(value.registryDomains) ||
    value.registryDomains.length === 0 ||
    !Array.isArray(value.profiles) ||
    (value.plannedApprovals !== undefined &&
      !Array.isArray(value.plannedApprovals)) ||
    (value.ownedPermRes !== null &&
      (typeof value.ownedPermRes !== 'string' ||
        !isAddress(value.ownedPermRes)))
  ) {
    return null
  }
  const registryDomains = value.registryDomains.map(parseV1Domain)
  const profiles = value.profiles.map(parseStoredProfile)
  if (registryDomains.some((domain) => domain === null)) return null
  if (profiles.some((profile) => profile === null)) return null
  const plannedApprovals = (value.plannedApprovals ?? []).map(
    (approval): StoredRecoverySnapshot['plannedApprovals'][number] | null => {
      if (!isRecord(approval)) return null
      const id = approval.id
      if (
        id !== 'base-registrar:hca' &&
        id !== 'base-registrar:hca-token' &&
        id !== 'name-wrapper:hca' &&
        id !== 'eth-registry:hca'
      ) {
        return null
      }
      if (id === 'base-registrar:hca-token') {
        return isUintString(approval.tokenId)
          ? { id, tokenId: approval.tokenId }
          : null
      }
      return approval.tokenId === undefined ? { id } : null
    },
  )
  if (plannedApprovals.some((approval) => approval === null)) return null
  const domainNames = registryDomains.map((domain) => domain?.name ?? '')
  if (new Set(domainNames).size !== domainNames.length) return null
  const registryOperations = parseOperations(
    value.registryOperations,
    domainNames,
  )
  const remainingOperations = parseOperationList(
    value.remainingOperations,
    true,
  )
  const completedOperations = parseOperationList(
    value.completedOperations,
    true,
  )
  if (!registryOperations || !remainingOperations || !completedOperations) {
    return null
  }
  const expectedActions = new Map(
    registryOperations.map(({ name, action }) => [name, action] as const),
  )
  const partition = [...remainingOperations, ...completedOperations]
  if (
    partition.length !== registryOperations.length ||
    new Set(partition.map(({ name }) => name)).size !== partition.length ||
    partition.some(
      ({ name, action }) => expectedActions.get(name) !== action,
    ) ||
    new Set(profiles.map((profile) => profile?.node.toLowerCase())).size !==
      profiles.length
  ) {
    return null
  }
  return {
    registryDomains: registryDomains as V1Domain[],
    registryOperations,
    remainingOperations,
    completedOperations,
    profiles: profiles as StoredRecoveryProfile[],
    ownedPermRes: value.ownedPermRes as Address | null,
    plannedApprovals:
      plannedApprovals as StoredRecoverySnapshot['plannedApprovals'],
  }
}

const parseSubmission = (
  value: unknown,
): SubmittedAtomicMigrationBatch | null => {
  if (
    !isRecord(value) ||
    typeof value.intentId !== 'string' ||
    value.intentId.length === 0 ||
    !isTransactionHash(value.hash)
  ) {
    return null
  }
  if (
    !Array.isArray(value.names) ||
    value.names.length === 0 ||
    !value.names.every((name) => typeof name === 'string' && name.length > 0)
  ) {
    return null
  }
  const names = [...new Set(value.names)]
  const operations = parseOperations(value.operations, names)
  if (!operations) return null
  return {
    intentId: value.intentId,
    hash: value.hash,
    names,
    operations,
  }
}

const parseIntent = (value: unknown): PendingAtomicMigrationIntent | null => {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    value.id.length === 0
  ) {
    return null
  }
  if (
    !Array.isArray(value.names) ||
    value.names.length === 0 ||
    !value.names.every((name) => typeof name === 'string' && name.length > 0)
  ) {
    return null
  }
  const names = [...new Set(value.names)]
  const operations = parseOperations(value.operations, names)
  if (!operations) return null
  return { id: value.id, names, operations }
}

const scopeKey = (scope: MigrationBatchJournalScope): string =>
  `${scope.chainId}:${scope.owner.toLowerCase()}:${scope.hca.toLowerCase()}`

const getBrowserStorage = (): StorageLike | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const emptyJournal = (): StoredJournal => ({
  version: JOURNAL_VERSION,
  entries: [],
})

const readJournal = (storage: StorageLike | null): StoredJournal => {
  if (!storage) throw new MigrationBatchJournalUnavailableError()
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return emptyJournal()
    const parsed = JSON.parse(raw) as unknown
    if (
      !isRecord(parsed) ||
      parsed.version !== JOURNAL_VERSION ||
      !Array.isArray(parsed.entries)
    ) {
      throw new MigrationBatchJournalCorruptError()
    }

    const entries = parsed.entries.map((entry): StoredEntry => {
      if (
        !isRecord(entry) ||
        typeof entry.scope !== 'string' ||
        (entry.intents !== undefined && !Array.isArray(entry.intents)) ||
        !Array.isArray(entry.submissions)
      ) {
        throw new MigrationBatchJournalCorruptError()
      }
      const submissions = [
        ...new Map(
          entry.submissions.map((submission) => {
            const parsedSubmission = parseSubmission(submission)
            if (!parsedSubmission) {
              throw new MigrationBatchJournalCorruptError()
            }
            return [
              parsedSubmission.hash.toLowerCase(),
              parsedSubmission,
            ] as const
          }),
        ).values(),
      ]
      const intents = [
        ...new Map(
          (entry.intents ?? []).map((intent) => {
            const parsedIntent = parseIntent(intent)
            if (!parsedIntent) {
              throw new MigrationBatchJournalCorruptError()
            }
            return [parsedIntent.id, parsedIntent] as const
          }),
        ).values(),
      ]
      const recovery =
        entry.recovery === undefined ? undefined : parseRecovery(entry.recovery)
      if (entry.recovery !== undefined && !recovery) {
        throw new MigrationBatchJournalCorruptError()
      }
      if (
        submissions.length === 0 &&
        intents.length === 0 &&
        recovery === undefined
      ) {
        throw new MigrationBatchJournalCorruptError()
      }
      return {
        scope: entry.scope,
        intents,
        submissions,
        ...(recovery ? { recovery } : {}),
      }
    })
    return { version: JOURNAL_VERSION, entries }
  } catch (cause) {
    if (cause instanceof MigrationBatchJournalCorruptError) throw cause
    throw new MigrationBatchJournalCorruptError(cause)
  }
}

const writeJournal = (
  storage: StorageLike | null,
  journal: StoredJournal,
): void => {
  if (!storage) throw new MigrationBatchJournalUnavailableError()
  if (journal.entries.length === 0) {
    storage.removeItem(STORAGE_KEY)
    return
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(journal))
}

export const loadSubmittedAtomicMigrationBatches = (
  scope: MigrationBatchJournalScope,
  storage: StorageLike | null = getBrowserStorage(),
): readonly SubmittedAtomicMigrationBatch[] => {
  const key = scopeKey(scope)
  return (
    readJournal(storage).entries.find((entry) => entry.scope === key)
      ?.submissions ?? []
  )
}

export const loadPendingAtomicMigrationIntents = (
  scope: MigrationBatchJournalScope,
  storage: StorageLike | null = getBrowserStorage(),
): readonly PendingAtomicMigrationIntent[] => {
  const key = scopeKey(scope)
  return (
    readJournal(storage).entries.find((entry) => entry.scope === key)
      ?.intents ?? []
  )
}

const hydrateRecovery = (
  recovery: StoredRecoverySnapshot,
): MigrationRecoverySnapshot => ({
  ...recovery,
  profiles: new Map(
    recovery.profiles.map((profile) => [
      profile.node,
      {
        texts: profile.texts,
        addresses: profile.addresses.map(({ coinType, value }) => ({
          coinType: BigInt(coinType),
          value,
        })),
        contentHash: profile.contentHash,
        abis: profile.abis.map(({ contentType, value }) => ({
          contentType: BigInt(contentType),
          value,
        })),
      },
    ]),
  ),
  plannedApprovals: recovery.plannedApprovals.map((approval) => ({
    id: approval.id,
    ...(approval.tokenId === undefined
      ? {}
      : { tokenId: BigInt(approval.tokenId) }),
  })),
})

const storeRecovery = (
  recovery: MigrationRecoverySnapshot,
): StoredRecoverySnapshot => ({
  ...recovery,
  profiles: [...recovery.profiles].map(([node, profile]) => ({
    node,
    texts: profile.texts,
    addresses: profile.addresses.map(({ coinType, value }) => ({
      coinType: coinType.toString(),
      value,
    })),
    contentHash: profile.contentHash,
    abis: profile.abis.map(({ contentType, value }) => ({
      contentType: contentType.toString(),
      value,
    })),
  })),
  plannedApprovals: recovery.plannedApprovals.map((approval) => ({
    id: approval.id,
    ...(approval.tokenId === undefined
      ? {}
      : { tokenId: approval.tokenId.toString() }),
  })),
})

export const loadMigrationRecoverySnapshot = (
  scope: MigrationBatchJournalScope,
  storage: StorageLike | null = getBrowserStorage(),
): MigrationRecoverySnapshot | null => {
  const key = scopeKey(scope)
  const recovery = readJournal(storage).entries.find(
    (entry) => entry.scope === key,
  )?.recovery
  return recovery ? hydrateRecovery(recovery) : null
}

export const persistMigrationRecoverySnapshot = (
  scope: MigrationBatchJournalScope,
  recovery: MigrationRecoverySnapshot,
  storage: StorageLike | null = getBrowserStorage(),
): void => {
  const journal = readJournal(storage)
  const key = scopeKey(scope)
  const current = journal.entries.find((entry) => entry.scope === key)
  writeJournal(storage, {
    version: JOURNAL_VERSION,
    entries: [
      ...journal.entries.filter((entry) => entry.scope !== key),
      {
        scope: key,
        intents: current?.intents ?? [],
        submissions: current?.submissions ?? [],
        recovery: storeRecovery(recovery),
      },
    ],
  })
}

export const removeMigrationRecoverySnapshot = (
  scope: MigrationBatchJournalScope,
  storage: StorageLike | null = getBrowserStorage(),
): void => {
  const journal = readJournal(storage)
  const key = scopeKey(scope)
  const current = journal.entries.find((entry) => entry.scope === key)
  const intents = current?.intents ?? []
  const submissions = current?.submissions ?? []
  writeJournal(storage, {
    version: JOURNAL_VERSION,
    entries: [
      ...journal.entries.filter((entry) => entry.scope !== key),
      ...(intents.length > 0 || submissions.length > 0
        ? [{ scope: key, intents, submissions }]
        : []),
    ],
  })
}

/**
 * Remove every durable migration entry for one wallet/HCA scope after the
 * complete flow, including temporary-access cleanup, has succeeded.
 */
export const clearMigrationBatchJournalScope = (
  scope: MigrationBatchJournalScope,
  storage: StorageLike | null = getBrowserStorage(),
): void => {
  const journal = readJournal(storage)
  const key = scopeKey(scope)
  writeJournal(storage, {
    version: JOURNAL_VERSION,
    entries: journal.entries.filter((entry) => entry.scope !== key),
  })
}

export const persistPendingAtomicMigrationIntent = (
  scope: MigrationBatchJournalScope,
  intent: PendingAtomicMigrationIntent,
  storage: StorageLike | null = getBrowserStorage(),
): void => {
  const journal = readJournal(storage)
  const key = scopeKey(scope)
  const current = journal.entries.find((entry) => entry.scope === key)
  const intents = [
    ...new Map(
      [...(current?.intents ?? []), intent].map((entry) => [entry.id, entry]),
    ).values(),
  ]
  writeJournal(storage, {
    version: JOURNAL_VERSION,
    entries: [
      ...journal.entries.filter((entry) => entry.scope !== key),
      {
        scope: key,
        intents,
        submissions: current?.submissions ?? [],
        ...(current?.recovery ? { recovery: current.recovery } : {}),
      },
    ],
  })
}

export const removePendingAtomicMigrationIntent = (
  scope: MigrationBatchJournalScope,
  intentId: string,
  storage: StorageLike | null = getBrowserStorage(),
): void => {
  const journal = readJournal(storage)
  const key = scopeKey(scope)
  const current = journal.entries.find((entry) => entry.scope === key)
  const intents =
    current?.intents.filter((intent) => intent.id !== intentId) ?? []
  const submissions = current?.submissions ?? []
  const recovery = current?.recovery
  writeJournal(storage, {
    version: JOURNAL_VERSION,
    entries: [
      ...journal.entries.filter((entry) => entry.scope !== key),
      ...(intents.length > 0 || submissions.length > 0 || recovery
        ? [{ scope: key, intents, submissions, recovery }]
        : []),
    ],
  })
}

export const persistSubmittedAtomicMigrationBatch = (
  scope: MigrationBatchJournalScope,
  submission: SubmittedAtomicMigrationBatch,
  storage: StorageLike | null = getBrowserStorage(),
): void => {
  const journal = readJournal(storage)
  const key = scopeKey(scope)
  const current = journal.entries.find((entry) => entry.scope === key)
  const existing = current?.submissions ?? []
  const submissions = [
    ...new Map(
      [...existing, submission].map((entry) => [
        entry.hash.toLowerCase(),
        entry,
      ]),
    ).values(),
  ]
  writeJournal(storage, {
    version: JOURNAL_VERSION,
    entries: [
      ...journal.entries.filter((entry) => entry.scope !== key),
      {
        scope: key,
        intents: current?.intents ?? [],
        submissions,
        ...(current?.recovery ? { recovery: current.recovery } : {}),
      },
    ],
  })
}

export const removeSubmittedAtomicMigrationBatch = (
  scope: MigrationBatchJournalScope,
  hash: Hex,
  storage: StorageLike | null = getBrowserStorage(),
): void => {
  const journal = readJournal(storage)
  const key = scopeKey(scope)
  const current = journal.entries.find((entry) => entry.scope === key)
  const submissions =
    current?.submissions.filter(
      (submission) => submission.hash.toLowerCase() !== hash.toLowerCase(),
    ) ?? []
  const intents = current?.intents ?? []
  const recovery = current?.recovery
  writeJournal(storage, {
    version: JOURNAL_VERSION,
    entries: [
      ...journal.entries.filter((entry) => entry.scope !== key),
      ...(submissions.length > 0 || intents.length > 0 || recovery
        ? [{ scope: key, intents, submissions, recovery }]
        : []),
    ],
  })
}
