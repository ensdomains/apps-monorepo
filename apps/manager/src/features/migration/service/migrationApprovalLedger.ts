import type { Address } from 'viem'
import {
  type MigrationApproval,
  type MigrationApprovalId,
  migrationApprovalForId,
  trackCreatedMigrationApproval,
} from './migrationApprovals'

const LEDGER_VERSION = 1 as const
const STORAGE_KEY =
  'ens-apps:atomic-hca-migration:temporary-approvals:v1:8d1c893' as const

const APPROVAL_IDS = [
  'base-registrar:migration-helper',
  'base-registrar:hca',
  'name-wrapper:migration-helper',
  'name-wrapper:hca',
  'eth-registry:hca',
] as const satisfies readonly MigrationApprovalId[]

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type MigrationApprovalLedgerScope = {
  readonly chainId: number
  readonly owner: Address
  readonly hca: Address
}

type StoredEntry = {
  readonly scope: string
  readonly approvalIds: readonly MigrationApprovalId[]
}

type StoredLedger = {
  readonly version: typeof LEDGER_VERSION
  readonly entries: readonly StoredEntry[]
}

const isApprovalId = (value: unknown): value is MigrationApprovalId =>
  typeof value === 'string' &&
  (APPROVAL_IDS as readonly string[]).includes(value)

const scopeKey = (scope: MigrationApprovalLedgerScope): string =>
  `${scope.chainId}:${scope.owner.toLowerCase()}:${scope.hca.toLowerCase()}`

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
      !parsed ||
      typeof parsed !== 'object' ||
      (parsed as { version?: unknown }).version !== LEDGER_VERSION ||
      !Array.isArray((parsed as { entries?: unknown }).entries)
    ) {
      return { version: LEDGER_VERSION, entries: [] }
    }

    const entries = (parsed as { entries: unknown[] }).entries.flatMap(
      (entry): StoredEntry[] => {
        if (!entry || typeof entry !== 'object') return []
        const { scope, approvalIds } = entry as {
          scope?: unknown
          approvalIds?: unknown
        }
        if (typeof scope !== 'string' || !Array.isArray(approvalIds)) return []
        const validIds = [...new Set(approvalIds.filter(isApprovalId))]
        return validIds.length > 0 ? [{ scope, approvalIds: validIds }] : []
      },
    )
    return { version: LEDGER_VERSION, entries }
  } catch {
    return { version: LEDGER_VERSION, entries: [] }
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

/**
 * Load only canonical approvals for the current deployment. Persisted data
 * stores ids rather than addresses so browser storage can never redirect a
 * cleanup transaction to an attacker-controlled contract.
 */
export const loadMigrationApprovalLedger = (
  scope: MigrationApprovalLedgerScope,
  storage: StorageLike | null = getBrowserStorage(),
): readonly MigrationApproval[] => {
  const entry = readLedger(storage).entries.find(
    (candidate) => candidate.scope === scopeKey(scope),
  )
  return (entry?.approvalIds ?? []).map((id) =>
    migrationApprovalForId({ id, hcaAddress: scope.hca }),
  )
}

export const persistMigrationApprovalLedger = (
  scope: MigrationApprovalLedgerScope,
  approvals: readonly MigrationApproval[],
  storage: StorageLike | null = getBrowserStorage(),
): void => {
  const ledger = readLedger(storage)
  const key = scopeKey(scope)
  const withoutCurrent = ledger.entries.filter((entry) => entry.scope !== key)
  const approvalIds = [...new Set(approvals.map((approval) => approval.id))]
  writeLedger(storage, {
    version: LEDGER_VERSION,
    entries:
      approvalIds.length > 0
        ? [...withoutCurrent, { scope: key, approvalIds }]
        : withoutCurrent,
  })
}

export const mergeMigrationApprovalLedgers = (
  ...ledgers: readonly (readonly MigrationApproval[])[]
): readonly MigrationApproval[] =>
  ledgers
    .flat()
    .reduce<readonly MigrationApproval[]>(trackCreatedMigrationApproval, [])

export const migrationApprovalLedgerStorageKey = STORAGE_KEY
