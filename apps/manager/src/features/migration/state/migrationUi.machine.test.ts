import type { Erc4337Call, Signer } from '@ens-apps/transaction-manager'
import type { Config as WagmiConfig } from '@wagmi/core'
import type { Address, Hex } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createActor } from 'xstate'

vi.mock('@ens-apps/transaction-manager', () => ({
  transactionManager: { startTransaction: vi.fn() },
  waitForTransaction: vi.fn(),
}))

vi.mock('@/features/migration/service/migrationService', () => ({
  executeMigration: vi.fn(),
}))

import type { MigrationPlan } from '@/features/migration/service/buildMigrationPlan'
import type {
  ClassifiedName,
  GroupedNames,
} from '@/features/migration/service/classifyNames'
import {
  executeMigration,
  type MigrationProgress,
  type MigrationResult,
} from '@/features/migration/service/migrationService'
import type { V1Domain } from '@/features/migration/service/v1SubgraphClient'
import { migrationUiMachine } from './migrationUi.machine'

const executeMigrationMock = vi.mocked(executeMigration)

const OWNER: Address = '0x0000000000000000000000000000000000000001'
const SCA: Address = '0x0000000000000000000000000000000000000002'
const SIGNER = {} as Signer
const WAGMI = {} as WagmiConfig

const domain = (id: string): V1Domain =>
  ({
    id,
    name: `${id}.eth`,
    labelName: id,
    labelhash:
      '0x0000000000000000000000000000000000000000000000000000000000000002',
  }) as unknown as V1Domain

const EMPTY_GROUPS: GroupedNames = {
  unwrapped: [],
  unlocked: [],
  locked2ld: [],
  childNames: new Map(),
}

const makeClassified = (d: V1Domain): ClassifiedName => ({
  domain: d,
  tokenType: 'unwrapped',
  label: d.labelName ?? '',
  parentName: 'eth',
  fuses: 0,
  tokenHolder: OWNER,
  v1ResolverAddress: null,
  resolverStrategy: 'to-owned-permres',
  managerAddress: null,
})

const makePlan = (
  domains: V1Domain[],
  overrides: Partial<MigrationPlan> = {},
): MigrationPlan => ({
  migrationOwner: OWNER,
  domains,
  classified: domains.map(makeClassified),
  ineligible: [],
  groups: EMPTY_GROUPS,
  preflight: {
    preExistingOwnedPermRes: null,
    skipApprovalPhase: false,
    skipFetchProfilesPhase: false,
    baseRegistrarApproved: false,
    nameWrapperApproved: false,
  },
  ownedPermRes: null,
  profiles: new Map(),
  migrateCalls: [
    {
      to: '0x0000000000000000000000000000000000000000',
      data: '0x',
      value: 0n,
    } as Erc4337Call,
  ],
  batches: [
    {
      index: 0,
      names: domains.map((d) => d.name),
      estimatedGas: 0n,
    },
  ],
  roleGrantCalls: [],
  profileReplayCalls: [],
  stepDescriptors: [],
  ...overrides,
})

const start = (domains: V1Domain[] = [domain('alice')]) => {
  const actor = createActor(migrationUiMachine, {
    input: { wagmiConfig: WAGMI },
  })
  actor.start()
  actor.send({
    type: 'migration.start',
    plan: makePlan(domains),
    signer: SIGNER,
    accountAddress: SCA,
  })
  return actor
}

const migrationResult = (
  overrides: Partial<MigrationResult> = {},
): MigrationResult => ({
  completed: 1,
  txHashes: ['0xabc'] as readonly Hex[],
  ineligible: [],
  ...overrides,
})

beforeEach(() => {
  executeMigrationMock.mockReset()
  vi.useFakeTimers()
})

describe('migrationUiMachine', () => {
  describe('select state', () => {
    it('starts in the "select" state with empty selection', () => {
      const actor = createActor(migrationUiMachine, {
        input: { wagmiConfig: WAGMI },
      })
      actor.start()
      expect(actor.getSnapshot().value).toBe('select')
      expect(actor.getSnapshot().context.selectedNames).toEqual([])
    })

    it('updates selection on selection.set', () => {
      const actor = createActor(migrationUiMachine, {
        input: { wagmiConfig: WAGMI },
      })
      actor.start()
      actor.send({ type: 'selection.set', names: ['alice.eth', 'bob.eth'] })
      expect(actor.getSnapshot().context.selectedNames).toEqual([
        'alice.eth',
        'bob.eth',
      ])
    })

    it('does not transition to migrate when classified is empty', () => {
      const actor = createActor(migrationUiMachine, {
        input: { wagmiConfig: WAGMI },
      })
      actor.start()
      actor.send({
        type: 'migration.start',
        plan: makePlan([], { classified: [] }),
        signer: SIGNER,
        accountAddress: SCA,
      })
      expect(actor.getSnapshot().value).toBe('select')
    })
  })

  describe('migrate.running state', () => {
    it('transitions select → migrate.running on migration.start with classified names', () => {
      executeMigrationMock.mockImplementation(() => new Promise(() => {}))
      const actor = start()
      expect(actor.getSnapshot().value).toEqual({ migrate: 'running' })
      expect(actor.getSnapshot().context.plan?.domains).toHaveLength(1)
      expect(actor.getSnapshot().context.plan?.migrationOwner).toBe(OWNER)
    })

    it('records progress events into context', async () => {
      let capturedOnProgress:
        | ((progress: MigrationProgress) => void)
        | undefined
      executeMigrationMock.mockImplementation((params) => {
        capturedOnProgress = params.onProgress
        return new Promise(() => {})
      })

      const actor = start()
      capturedOnProgress?.({
        currentStep: 1,
        totalSteps: 2,
        description: 'Approving',
      })
      await vi.advanceTimersByTimeAsync(0)

      expect(actor.getSnapshot().context.progress?.description).toBe(
        'Approving',
      )
    })
  })

  describe('migrate.succeeding → success', () => {
    it('transitions to success after the success hold delay when migration resolves', async () => {
      executeMigrationMock.mockImplementation(async (params) => {
        params.onBatchComplete?.(['alice.eth'], '0xabc' as Hex)
        return migrationResult()
      })
      const actor = start()
      await vi.advanceTimersByTimeAsync(0)

      expect(actor.getSnapshot().value).toEqual({ migrate: 'succeeding' })
      await vi.advanceTimersByTimeAsync(3000)
      expect(actor.getSnapshot().value).toBe('success')
      expect(actor.getSnapshot().context.txHashes).toEqual(['0xabc'])
      expect(actor.getSnapshot().context.migratedNames).toEqual(['alice.eth'])
    })

    it('accumulates migratedNames across multiple batchComplete events', async () => {
      executeMigrationMock.mockImplementation(async (params) => {
        params.onBatchComplete?.(['a.eth'], '0x1' as Hex)
        params.onBatchComplete?.(['b.eth', 'c.eth'], '0x2' as Hex)
        params.onBatchComplete?.(['d.eth'], '0x3' as Hex)
        return migrationResult()
      })
      const actor = start()
      await vi.advanceTimersByTimeAsync(3000)
      expect(actor.getSnapshot().context.migratedNames).toEqual([
        'a.eth',
        'b.eth',
        'c.eth',
        'd.eth',
      ])
    })

    it('resetAll returns to select and wipes context on done', async () => {
      executeMigrationMock.mockImplementation(async (params) => {
        params.onBatchComplete?.(['alice.eth'], '0xabc' as Hex)
        return migrationResult()
      })
      const actor = start()
      await vi.advanceTimersByTimeAsync(3000)

      actor.send({ type: 'done' })
      expect(actor.getSnapshot().value).toBe('select')
      expect(actor.getSnapshot().context.plan).toBeUndefined()
      expect(actor.getSnapshot().context.migratedNames).toEqual([])
    })
  })

  describe('migrate.failing → failure', () => {
    it('routes to failing when migration complete but no tx hashes (isOnlyFailures guard)', async () => {
      executeMigrationMock.mockResolvedValueOnce(
        migrationResult({ txHashes: [] }),
      )
      const actor = start()
      await vi.advanceTimersByTimeAsync(0)

      expect(actor.getSnapshot().value).toEqual({ migrate: 'failing' })
      await vi.advanceTimersByTimeAsync(1500)
      expect(actor.getSnapshot().value).toBe('failure')
    })

    it('routes to failing on migration.failed event', async () => {
      executeMigrationMock.mockRejectedValueOnce(new Error('boom'))
      const actor = start()
      await vi.advanceTimersByTimeAsync(0)

      expect(actor.getSnapshot().value).toEqual({ migrate: 'failing' })
      expect(actor.getSnapshot().context.lastError?.type).toBe('generic')
    })
  })

  describe('failure.retry → resetForRetry', () => {
    it('resetForRetry: filters migrated names from plan and clears error/progress', async () => {
      const actor = createActor(migrationUiMachine, {
        input: { wagmiConfig: WAGMI },
      })
      actor.start()
      actor.send({ type: 'selection.set', names: ['alice.eth', 'bob.eth'] })

      executeMigrationMock.mockImplementation(async (params) => {
        params.onBatchComplete?.(['alice.eth'], '0xabc' as Hex)
        throw new Error('boom')
      })
      actor.send({
        type: 'migration.start',
        plan: makePlan([domain('alice'), domain('bob')]),
        signer: SIGNER,
        accountAddress: SCA,
      })

      await vi.advanceTimersByTimeAsync(1500)
      expect(actor.getSnapshot().value).toBe('failure')
      expect(actor.getSnapshot().context.migratedNames).toEqual(['alice.eth'])

      executeMigrationMock.mockImplementation(() => new Promise(() => {}))
      actor.send({ type: 'retry' })

      const ctx = actor.getSnapshot().context
      expect(ctx.selectedNames).toEqual(['bob.eth'])
      expect(ctx.plan?.domains.map((d) => d.name)).toEqual(['bob.eth'])
      expect(ctx.lastError).toBeUndefined()
      expect(ctx.progress).toBeUndefined()
    })

    it('cancel returns to select and wipes context', async () => {
      executeMigrationMock.mockRejectedValueOnce(new Error('boom'))
      const actor = start()
      await vi.advanceTimersByTimeAsync(1500)
      expect(actor.getSnapshot().value).toBe('failure')

      actor.send({ type: 'cancel' })
      expect(actor.getSnapshot().value).toBe('select')
      expect(actor.getSnapshot().context.plan).toBeUndefined()
    })
  })
})
