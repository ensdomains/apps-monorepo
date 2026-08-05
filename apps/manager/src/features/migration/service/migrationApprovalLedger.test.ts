import type { Address } from 'viem'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  legacyMigrationApprovalLedgerStorageKey,
  loadMigrationApprovalLedger,
  mergeMigrationApprovalLedgers,
  migrationApprovalLedgerStorageKey,
  persistMigrationApprovalLedger,
} from './migrationApprovalLedger'
import { migrationApprovalForId } from './migrationApprovals'

const OWNER = '0x0000000000000000000000000000000000000001' as Address
const OTHER_OWNER = '0x0000000000000000000000000000000000000009' as Address
const HCA = '0x0000000000000000000000000000000000000002' as Address
const OLD_HCA = '0x0000000000000000000000000000000000000003' as Address
const scope = { chainId: 11155111, owner: OWNER, hca: HCA }

const legacyScope = (owner: Address, hca: Address): string =>
  `${scope.chainId}:${owner.toLowerCase()}:${hca.toLowerCase()}`

describe('migrationApprovalLedger', () => {
  beforeEach(() => localStorage.clear())

  it('persists structured v2 permissions and reconstructs trusted addresses', () => {
    const approval = migrationApprovalForId({
      id: 'base-registrar:hca-token',
      hcaAddress: HCA,
      tokenId: 123n,
    })

    persistMigrationApprovalLedger(scope, [approval])

    const stored = localStorage.getItem(migrationApprovalLedgerStorageKey)
    expect(stored).toContain('"version":2')
    expect(stored).toContain('"tokenId":"123"')
    expect(stored).not.toContain(approval.contractAddress)
    expect(loadMigrationApprovalLedger(scope)).toEqual([approval])
  })

  it('scopes current entries by owner, chain, and HCA', () => {
    const approval = migrationApprovalForId({
      id: 'name-wrapper:hca',
      hcaAddress: HCA,
    })
    persistMigrationApprovalLedger(scope, [approval])

    expect(loadMigrationApprovalLedger({ ...scope, hca: OLD_HCA })).toEqual([])
    expect(loadMigrationApprovalLedger(scope)).toEqual([approval])
  })

  it('ignores malformed, negative, and unknown persisted permissions', () => {
    localStorage.setItem(
      migrationApprovalLedgerStorageKey,
      JSON.stringify({
        version: 2,
        entries: [
          {
            scope: legacyScope(OWNER, HCA),
            permissions: [
              { kind: 'operator', id: 'attacker:approval' },
              {
                kind: 'erc721-token',
                id: 'base-registrar:hca-token',
                tokenId: '-1',
              },
              {
                kind: 'erc721-token',
                id: 'base-registrar:hca-token',
                tokenId: (2n ** 256n).toString(),
              },
            ],
          },
        ],
      }),
    )

    expect(loadMigrationApprovalLedger(scope)).toEqual([])
  })

  it('deduplicates identical tokens without merging different token ids', () => {
    const first = migrationApprovalForId({
      id: 'base-registrar:hca-token',
      hcaAddress: HCA,
      tokenId: 1n,
    })
    const second = migrationApprovalForId({
      id: 'base-registrar:hca-token',
      hcaAddress: HCA,
      tokenId: 2n,
    })
    expect(mergeMigrationApprovalLedgers([first], [first, second])).toEqual([
      first,
      second,
    ])
  })

  it('removes the v2 storage document after the final permission is cleared', () => {
    const approval = migrationApprovalForId({
      id: 'base-registrar:hca',
      hcaAddress: HCA,
    })
    persistMigrationApprovalLedger(scope, [approval])
    persistMigrationApprovalLedger(scope, [])

    expect(localStorage.getItem(migrationApprovalLedgerStorageKey)).toBeNull()
  })

  it('imports only helper cleanup entries from the v1 ledger after HCA rotation', () => {
    localStorage.setItem(
      legacyMigrationApprovalLedgerStorageKey,
      JSON.stringify({
        version: 1,
        entries: [
          {
            scope: legacyScope(OWNER, OLD_HCA),
            approvalIds: [
              'base-registrar:migration-helper',
              'name-wrapper:migration-helper',
              'base-registrar:hca',
              'eth-registry:hca',
            ],
          },
        ],
      }),
    )

    expect(
      loadMigrationApprovalLedger(scope).map((approval) => approval.id),
    ).toEqual([
      'base-registrar:migration-helper',
      'name-wrapper:migration-helper',
    ])
  })

  it('durably adopts helper cleanup into v2 before deleting matching v1 data', () => {
    localStorage.setItem(
      legacyMigrationApprovalLedgerStorageKey,
      JSON.stringify({
        version: 1,
        entries: [
          {
            scope: legacyScope(OWNER, OLD_HCA),
            approvalIds: ['base-registrar:migration-helper'],
          },
        ],
      }),
    )
    const imported = loadMigrationApprovalLedger(scope)

    persistMigrationApprovalLedger(scope, imported)

    expect(
      localStorage.getItem(legacyMigrationApprovalLedgerStorageKey),
    ).toBeNull()
    expect(
      loadMigrationApprovalLedger(scope).map((approval) => approval.id),
    ).toEqual(['base-registrar:migration-helper'])
  })

  it('preserves unrelated owners while removing the migrated v1 scope', () => {
    localStorage.setItem(
      legacyMigrationApprovalLedgerStorageKey,
      JSON.stringify({
        version: 1,
        entries: [
          {
            scope: legacyScope(OWNER, OLD_HCA),
            approvalIds: ['base-registrar:migration-helper'],
          },
          {
            scope: legacyScope(OTHER_OWNER, OLD_HCA),
            approvalIds: ['name-wrapper:migration-helper'],
          },
        ],
      }),
    )

    persistMigrationApprovalLedger(scope, loadMigrationApprovalLedger(scope))

    expect(
      localStorage.getItem(legacyMigrationApprovalLedgerStorageKey),
    ).toContain(OTHER_OWNER.toLowerCase())
    expect(
      localStorage.getItem(legacyMigrationApprovalLedgerStorageKey),
    ).not.toContain(OWNER.toLowerCase())
  })
})
