import { describe, expect, it } from 'vitest'
import { makeDomain } from './_fixtures'
import type {
  MigrationRecoverySnapshot,
  SubmittedAtomicMigrationBatch,
} from './migrationBatchJournal'
import {
  hasCompletedMigrationRecovery,
  settleMigrationRecoveryProgress,
} from './migrationRecoveryProgress'

const confirmed: SubmittedAtomicMigrationBatch = {
  intentId: 'confirmed',
  hash: `0x${'1'.repeat(64)}`,
  names: ['alice.eth'],
  operations: [{ name: 'alice.eth', action: 'migrate' }],
}
const child = { name: 'sub.alice.eth', action: 'copy' as const }
const recovery: MigrationRecoverySnapshot = {
  registryDomains: [makeDomain()],
  registryOperations: [...confirmed.operations, child],
  remainingOperations: [...confirmed.operations, child],
  completedOperations: [],
  profiles: new Map(),
  ownedPermRes: null,
  plannedApprovals: [],
  managerRestorationNames: [],
}

describe('settleMigrationRecoveryProgress', () => {
  it.each([
    'complete',
    'remaining-name',
    'pending',
    'submitted',
    'cleanup',
  ] as const)(
    'only discards completed-only recovery without outstanding work: %s',
    (state) => {
      const completed = {
        ...recovery,
        remainingOperations: [],
        completedOperations: confirmed.operations,
      }
      const journal = {
        pending:
          state === 'pending'
            ? [
                {
                  id: confirmed.intentId,
                  names: confirmed.names,
                  operations: confirmed.operations,
                },
              ]
            : [],
        submitted: state === 'submitted' ? [confirmed] : [],
        recovery:
          state === 'remaining-name'
            ? recovery
            : {
                ...completed,
                ...(state === 'cleanup'
                  ? {
                      temporaryRegistrationApproval: {
                        contractAddress:
                          '0x0000000000000000000000000000000000000001' as const,
                        operatorAddress:
                          '0x0000000000000000000000000000000000000002' as const,
                        state: {
                          status: 'granted' as const,
                          hash: confirmed.hash,
                        },
                      },
                    }
                  : {}),
              },
      }
      expect(hasCompletedMigrationRecovery(journal)).toBe(state === 'complete')
    },
  )

  it('advances only verified operations and retains unfinished child copies', () => {
    const result = settleMigrationRecoveryProgress({
      journal: { recovery, pending: [], submitted: [confirmed] },
      confirmed,
    })
    expect(result).toEqual({
      status: 'settled',
      journal: {
        pending: [],
        submitted: [],
        recovery: {
          ...recovery,
          remainingOperations: [child],
          completedOperations: confirmed.operations,
        },
      },
    })
  })

  it('retains temporary approval cleanup after the final name completes', () => {
    const cleanup = {
      contractAddress: '0x0000000000000000000000000000000000000001',
      operatorAddress: '0x0000000000000000000000000000000000000002',
      state: { status: 'granted', hash: confirmed.hash },
    } as const
    const result = settleMigrationRecoveryProgress({
      journal: {
        pending: [],
        submitted: [confirmed],
        recovery: {
          ...recovery,
          remainingOperations: confirmed.operations,
          temporaryRegistrationApproval: cleanup,
        },
      },
      confirmed,
    })
    expect(result).toEqual({
      status: 'settled',
      journal: {
        pending: [],
        submitted: [],
        recovery: {
          ...recovery,
          remainingOperations: [],
          completedOperations: confirmed.operations,
          temporaryRegistrationApproval: cleanup,
        },
      },
    })
  })

  it.each(['removed', 'changed-action'] as const)(
    'does not apply stale verification to a %s attempt',
    (change) => {
      const submitted =
        change === 'removed'
          ? []
          : [
              {
                ...confirmed,
                operations: [{ name: 'alice.eth', action: 'copy' as const }],
              },
            ]
      expect(
        settleMigrationRecoveryProgress({
          journal: { recovery, pending: [], submitted },
          confirmed,
        }),
      ).toEqual({ status: 'unchanged' })
    },
  )
})
