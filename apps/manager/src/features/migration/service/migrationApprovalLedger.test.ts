import type { Address } from 'viem'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadMigrationApprovalLedger,
  mergeMigrationApprovalLedgers,
  migrationApprovalLedgerStorageKey,
  persistMigrationApprovalLedger,
} from './migrationApprovalLedger'
import { migrationApprovalForId } from './migrationApprovals'

const OWNER = '0x0000000000000000000000000000000000000001' as Address
const HCA = '0x0000000000000000000000000000000000000002' as Address
const OTHER_HCA = '0x0000000000000000000000000000000000000003' as Address
const scope = { chainId: 11155111, owner: OWNER, hca: HCA }

describe('migrationApprovalLedger', () => {
  beforeEach(() => localStorage.clear())

  it('persists only approval ids and reconstructs trusted addresses', () => {
    const approval = migrationApprovalForId({
      id: 'base-registrar:hca',
      hcaAddress: HCA,
    })

    persistMigrationApprovalLedger(scope, [approval])

    expect(
      localStorage.getItem(migrationApprovalLedgerStorageKey),
    ).not.toContain(approval.contractAddress)
    expect(loadMigrationApprovalLedger(scope)).toEqual([approval])
  })

  it('scopes entries by owner, chain, and HCA', () => {
    const approval = migrationApprovalForId({
      id: 'name-wrapper:hca',
      hcaAddress: HCA,
    })
    persistMigrationApprovalLedger(scope, [approval])

    expect(loadMigrationApprovalLedger({ ...scope, hca: OTHER_HCA })).toEqual(
      [],
    )
    expect(loadMigrationApprovalLedger(scope)).toEqual([approval])
  })

  it('ignores malformed and unknown persisted approvals', () => {
    localStorage.setItem(
      migrationApprovalLedgerStorageKey,
      JSON.stringify({
        version: 1,
        entries: [
          {
            scope: `11155111:${OWNER.toLowerCase()}:${HCA.toLowerCase()}`,
            approvalIds: ['attacker:approval'],
          },
        ],
      }),
    )

    expect(loadMigrationApprovalLedger(scope)).toEqual([])
  })

  it('deduplicates merged in-memory and persisted ledgers', () => {
    const approval = migrationApprovalForId({
      id: 'eth-registry:hca',
      hcaAddress: HCA,
    })
    expect(mergeMigrationApprovalLedgers([approval], [approval])).toEqual([
      approval,
    ])
  })

  it('removes the storage document after the final approval is cleared', () => {
    const approval = migrationApprovalForId({
      id: 'base-registrar:migration-helper',
      hcaAddress: HCA,
    })
    persistMigrationApprovalLedger(scope, [approval])
    persistMigrationApprovalLedger(scope, [])

    expect(localStorage.getItem(migrationApprovalLedgerStorageKey)).toBeNull()
  })
})
