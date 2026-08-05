import type { Address } from 'viem'
import {
  type LegacyMigrationHelperApprovalId,
  type MigrationApproval,
  type MigrationApprovalId,
  type MigrationOperatorApprovalId,
  migrationApprovalForId,
  trackCreatedMigrationApproval,
} from './migrationApprovals'

const LEDGER_VERSION = 2 as const
const STORAGE_KEY =
  'ens-apps:atomic-hca-migration:temporary-approvals:v2:8d1c893' as const
const LEGACY_STORAGE_KEY =
  'ens-apps:atomic-hca-migration:temporary-approvals:v1:8d1c893' as const
const UINT256_MAX = 2n ** 256n - 1n

const OPERATOR_APPROVAL_IDS = [
  'base-registrar:hca',
  'name-wrapper:hca',
  'eth-registry:hca',
  'base-registrar:migration-helper',
  'name-wrapper:migration-helper',
] as const satisfies readonly Exclude<
  MigrationApprovalId,
  'base-registrar:hca-token'
>[]

const LEGACY_HELPER_APPROVAL_IDS = [
  'base-registrar:migration-helper',
  'name-wrapper:migration-helper',
] as const satisfies readonly LegacyMigrationHelperApprovalId[]

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type MigrationApprovalLedgerScope = {
  readonly chainId: number
  readonly owner: Address
  readonly hca: Address
}

type StoredOperatorPermission = {
  readonly kind: 'operator'
  readonly id: MigrationOperatorApprovalId | LegacyMigrationHelperApprovalId
}

type StoredTokenPermission = {
  readonly kind: 'erc721-token'
  readonly id: 'base-registrar:hca-token'
  readonly tokenId: string
}

type StoredPermission = StoredOperatorPermission | StoredTokenPermission

type StoredEntry = {
  readonly scope: string
  readonly permissions: readonly StoredPermission[]
}

type StoredLedger = {
  readonly version: typeof LEDGER_VERSION
  readonly entries: readonly StoredEntry[]
}

type LegacyStoredEntry = {
  readonly scope: string
  readonly approvalIds: readonly MigrationApprovalId[]
}

type LegacyStoredLedger = {
  readonly version: 1
  readonly entries: readonly LegacyStoredEntry[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isOperatorApprovalId = (
  value: unknown,
): value is StoredOperatorPermission['id'] =>
  typeof value === 'string' &&
  (OPERATOR_APPROVAL_IDS as readonly string[]).includes(value)

const isLegacyHelperApprovalId = (
  value: unknown,
): value is LegacyMigrationHelperApprovalId =>
  typeof value === 'string' &&
  (LEGACY_HELPER_APPROVAL_IDS as readonly string[]).includes(value)

const parseTokenId = (value: unknown): bigint | null => {
  if (typeof value !== 'string' || value.length > 78 || !/^\d+$/.test(value)) {
    return null
  }
  try {
    const tokenId = BigInt(value)
    return tokenId <= UINT256_MAX ? tokenId : null
  } catch {
    return null
  }
}

const parseStoredPermission = (value: unknown): StoredPermission | null => {
  if (!isRecord(value)) return null
  if (value.kind === 'operator' && isOperatorApprovalId(value.id)) {
    return { kind: 'operator', id: value.id }
  }
  const tokenId = parseTokenId(value.tokenId)
  if (
    value.kind === 'erc721-token' &&
    value.id === 'base-registrar:hca-token' &&
    tokenId !== null
  ) {
    return {
      kind: 'erc721-token',
      id: value.id,
      tokenId: tokenId.toString(),
    }
  }
  return null
}

const permissionKey = (permission: StoredPermission): string =>
  permission.kind === 'erc721-token'
    ? `${permission.id}:${permission.tokenId}`
    : permission.id

const deduplicatePermissions = (
  permissions: readonly StoredPermission[],
): readonly StoredPermission[] => [
  ...new Map(
    permissions.map((permission) => [permissionKey(permission), permission]),
  ).values(),
]

const scopeKey = (scope: MigrationApprovalLedgerScope): string =>
  `${scope.chainId}:${scope.owner.toLowerCase()}:${scope.hca.toLowerCase()}`

const legacyScopeMatchesOwner = (
  storedScope: string,
  scope: MigrationApprovalLedgerScope,
): boolean => {
  const [chainId, owner] = storedScope.split(':')
  return (
    chainId === String(scope.chainId) && owner === scope.owner.toLowerCase()
  )
}

const getBrowserStorage = (): StorageLike | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const readLedger = (storage: StorageLike | null): StoredLedger => {
  if (!storage) return { version: LEDGER_VERSION, entries: [] }
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return { version: LEDGER_VERSION, entries: [] }
    const parsed = JSON.parse(raw) as unknown
    if (
      !isRecord(parsed) ||
      parsed.version !== LEDGER_VERSION ||
      !Array.isArray(parsed.entries)
    ) {
      return { version: LEDGER_VERSION, entries: [] }
    }

    const entries = parsed.entries.flatMap((entry): StoredEntry[] => {
      if (!isRecord(entry) || typeof entry.scope !== 'string') return []
      if (!Array.isArray(entry.permissions)) return []
      const permissions = deduplicatePermissions(
        entry.permissions.flatMap((permission) => {
          const parsedPermission = parseStoredPermission(permission)
          return parsedPermission ? [parsedPermission] : []
        }),
      )
      return permissions.length > 0 ? [{ scope: entry.scope, permissions }] : []
    })
    return { version: LEDGER_VERSION, entries }
  } catch {
    return { version: LEDGER_VERSION, entries: [] }
  }
}

const readLegacyLedger = (storage: StorageLike | null): LegacyStoredLedger => {
  if (!storage) return { version: 1, entries: [] }
  try {
    const raw = storage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return { version: 1, entries: [] }
    const parsed = JSON.parse(raw) as unknown
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.entries)
    ) {
      return { version: 1, entries: [] }
    }

    const entries = parsed.entries.flatMap((entry): LegacyStoredEntry[] => {
      if (!isRecord(entry) || typeof entry.scope !== 'string') return []
      if (!Array.isArray(entry.approvalIds)) return []
      const approvalIds = [
        ...new Set(entry.approvalIds.filter(isLegacyHelperApprovalId)),
      ]
      return approvalIds.length > 0 ? [{ scope: entry.scope, approvalIds }] : []
    })
    return { version: 1, entries }
  } catch {
    return { version: 1, entries: [] }
  }
}

const writeLedger = (
  storage: StorageLike | null,
  ledger: StoredLedger,
): void => {
  if (!storage) {
    throw new Error(
      'Temporary migration permissions cannot be tracked in this browser',
    )
  }
  if (ledger.entries.length === 0) {
    storage.removeItem(STORAGE_KEY)
    return
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(ledger))
}

const removeMigratedLegacyEntries = (
  storage: StorageLike,
  scope: MigrationApprovalLedgerScope,
): void => {
  const legacyLedger = readLegacyLedger(storage)
  const remainingEntries = legacyLedger.entries.filter(
    (entry) => !legacyScopeMatchesOwner(entry.scope, scope),
  )
  if (remainingEntries.length === 0) {
    storage.removeItem(LEGACY_STORAGE_KEY)
    return
  }
  storage.setItem(
    LEGACY_STORAGE_KEY,
    JSON.stringify({ version: 1, entries: remainingEntries }),
  )
}

const storedPermissionFor = (approval: MigrationApproval): StoredPermission =>
  approval.kind === 'erc721-token'
    ? {
        kind: approval.kind,
        id: approval.id,
        tokenId: approval.tokenId.toString(),
      }
    : { kind: approval.kind, id: approval.id }

const migrationApprovalForStoredPermission = (
  permission: StoredPermission,
  scope: MigrationApprovalLedgerScope,
): MigrationApproval =>
  migrationApprovalForId({
    id: permission.id,
    hcaAddress: scope.hca,
    tokenId:
      permission.kind === 'erc721-token'
        ? BigInt(permission.tokenId)
        : undefined,
  })

/**
 * Load canonical v2 entries plus helper-only recovery entries from v1.
 * Legacy HCA/operator entries are intentionally ignored because v1 cannot
 * prove they belong to the current direct-transfer permission model.
 */
export const loadMigrationApprovalLedger = (
  scope: MigrationApprovalLedgerScope,
  storage: StorageLike | null = getBrowserStorage(),
): readonly MigrationApproval[] => {
  const entry = readLedger(storage).entries.find(
    (candidate) => candidate.scope === scopeKey(scope),
  )
  const current = (entry?.permissions ?? []).map((permission) =>
    migrationApprovalForStoredPermission(permission, scope),
  )
  const legacy = readLegacyLedger(storage)
    .entries.filter((candidate) =>
      legacyScopeMatchesOwner(candidate.scope, scope),
    )
    .flatMap((candidate) =>
      candidate.approvalIds.map((id) =>
        migrationApprovalForId({ id, hcaAddress: scope.hca }),
      ),
    )
  return mergeMigrationApprovalLedgers(current, legacy)
}

/**
 * Persist before wallet submission. Once v2 has durably adopted any helper
 * cleanup entries, the matching v1 entries are removed to avoid replaying
 * stale helper permissions on future loads.
 */
export const persistMigrationApprovalLedger = (
  scope: MigrationApprovalLedgerScope,
  approvals: readonly MigrationApproval[],
  storage: StorageLike | null = getBrowserStorage(),
): void => {
  const ledger = readLedger(storage)
  const key = scopeKey(scope)
  const withoutCurrent = ledger.entries.filter((entry) => entry.scope !== key)
  const permissions = deduplicatePermissions(approvals.map(storedPermissionFor))
  writeLedger(storage, {
    version: LEDGER_VERSION,
    entries:
      permissions.length > 0
        ? [...withoutCurrent, { scope: key, permissions }]
        : withoutCurrent,
  })
  if (storage) removeMigratedLegacyEntries(storage, scope)
}

export const mergeMigrationApprovalLedgers = (
  ...ledgers: readonly (readonly MigrationApproval[])[]
): readonly MigrationApproval[] =>
  ledgers
    .flat()
    .reduce<readonly MigrationApproval[]>(trackCreatedMigrationApproval, [])

export const migrationApprovalLedgerStorageKey = STORAGE_KEY
export const legacyMigrationApprovalLedgerStorageKey = LEGACY_STORAGE_KEY
