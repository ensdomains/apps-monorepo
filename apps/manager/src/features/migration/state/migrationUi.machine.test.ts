import type { Signer } from '@ens-apps/transaction-manager'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { Config as WagmiConfig } from '@wagmi/core'
import { errAsync, fromPromise, okAsync } from 'neverthrow'
import type { Address, Hex, WalletClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createActor } from 'xstate'

vi.mock('@ens-apps/transaction-manager', () => ({
  transactionManager: { startTransaction: vi.fn() },
  waitForTransaction: vi.fn(),
}))

vi.mock('@/features/migration/service/migrationService', () => ({
  executeMigration: vi.fn(),
}))

vi.mock(
  '@/features/migration/service/graceRenewal',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/features/migration/service/graceRenewal')
    >()),
    executeGraceRenewal: vi.fn(),
  }),
)

vi.mock('@/features/migration/service/prepareGraceRenewalMigration', () => ({
  prepareGraceRenewalMigration: vi.fn(),
}))

import type { MigrationPlan } from '@/features/migration/service/buildMigrationPlan'
import type { MigrationWalletRequestDescriptor } from '@/features/migration/service/buildStepDescriptors'
import type {
  ClassifiedName,
  GroupedNames,
} from '@/features/migration/service/classifyNames'
import {
  executeGraceRenewal,
  GraceRenewalError,
  type GraceRenewalQuote,
} from '@/features/migration/service/graceRenewal'
import {
  executeMigration,
  type MigrationProgress,
  type MigrationResult,
} from '@/features/migration/service/migrationService'
import { prepareGraceRenewalMigration } from '@/features/migration/service/prepareGraceRenewalMigration'
import type { V1Domain } from '@/features/migration/service/v1SubgraphClient'
import {
  FINAL_STAGE_FILL_MS,
  REUNION_HOLD_MS,
  REUNION_SLIDE_MS,
} from './migrationAnimationTiming'
import { migrationUiMachine } from './migrationUi.machine'

const executeMigrationMock = vi.mocked(executeMigration)
const executeGraceRenewalMock = vi.mocked(executeGraceRenewal)
const prepareGraceRenewalMigrationMock = vi.mocked(prepareGraceRenewalMigration)

const OWNER: Address = '0x0000000000000000000000000000000000000001'
const SCA: Address = '0x0000000000000000000000000000000000000002'
const SIGNER = {} as Signer
const EOA_SIGNER: Signer = {
  type: 'eoa',
  walletClient: {} as WalletClient,
}
const WAGMI = {} as WagmiConfig
const HCA_CLIENT = {
  getAddress: vi.fn(),
  getInitData: vi.fn(),
} as unknown as Pick<RhinestoneAccount, 'getAddress' | 'getInitData'>
const REFRESH_ACCOUNT = vi.fn<() => Promise<void>>()
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
  action: 'migrate',
  domain: d,
  tokenType: 'unwrapped',
  label: d.labelName ?? '',
  parentName: 'eth',
  fuses: 0n,
  tokenHolder: OWNER,
  v1ResolverAddress: null,
  resolverStrategy: 'to-owned-permres',
  registryController: null,
  managerAddress: null,
})

const makePlan = (
  domains: V1Domain[],
  overrides: Partial<MigrationPlan> = {},
): MigrationPlan => {
  const classified = overrides.classified ?? domains.map(makeClassified)
  return {
    hcaAddress: SCA,
    hcaDeploymentRequired: false,
    migrationOwner: OWNER,
    classified,
    registryContext: classified,
    ineligible: [],
    groups: EMPTY_GROUPS,
    preflight: {
      skipFetchProfilesPhase: false,
    },
    ownedPermRes: null,
    profiles: new Map(),
    atomicBatches: [],
    stepDescriptors: [],
    ...overrides,
    directRoutes: overrides.directRoutes ?? new Map(),
  }
}

const start = (domains: V1Domain[] = [domain('alice')]) => {
  const actor = createActor(migrationUiMachine, {
    input: { wagmiConfig: WAGMI },
  })
  actor.start()
  actor.send({
    type: 'migration.start',
    plan: makePlan(domains),
    signer: SIGNER,
    hcaClient: HCA_CLIENT,
    refreshAccount: REFRESH_ACCOUNT,
  })
  return actor
}

const makeRenewalQuote = (graceDomain: V1Domain): GraceRenewalQuote => ({
  ownerAddress: OWNER,
  chainId: 1,
  paymentToken: OWNER,
  renewerAddress: SCA,
  items: [
    {
      domain: graceDomain,
      label: graceDomain.labelName ?? '',
      registrationExpiry: 1000n,
      duration: 604_800n,
      targetExpiry: 605_800n,
      amount: 100n,
    },
  ],
  totalAmount: 100n,
  balance: 100n,
  expiresAt: 1200n,
  quotedAtMs: Date.now(),
})

const startRenewal = (
  domains: [V1Domain, ...V1Domain[]] = [domain('alice')],
  requestSteps?: readonly MigrationWalletRequestDescriptor[],
  quoteOverrides: Partial<GraceRenewalQuote> = {},
) => {
  const actor = createActor(migrationUiMachine, {
    input: { wagmiConfig: WAGMI },
  })
  actor.start()
  actor.send({
    type: 'migration.renewAndStart',
    renewal: {
      quote: { ...makeRenewalQuote(domains[0]), ...quoteOverrides },
      domains,
      hcaAddress: SCA,
      requestSteps,
    },
    signer: EOA_SIGNER,
    hcaClient: HCA_CLIENT,
    refreshAccount: REFRESH_ACCOUNT,
  })
  return actor
}

const MIGRATION_REQUEST_STEPS: MigrationPlan['stepDescriptors'] = [
  {
    type: 'atomic-batch',
    index: 0,
    total: 1,
    count: 1,
    migrateCount: 1,
    copyCount: 0,
  },
]
const RENEWAL_REQUEST_STEPS: readonly MigrationWalletRequestDescriptor[] = [
  { type: 'renewal-approval' },
  { type: 'renew-grace', count: 1 },
  ...MIGRATION_REQUEST_STEPS,
]

const migrationResult = (
  overrides: Partial<MigrationResult> = {},
): MigrationResult => ({
  completed: 1,
  migrated: 1,
  copied: 0,
  completedOperations: [{ name: 'alice.eth', action: 'migrate' }],
  txHashes: ['0xabc'] as readonly Hex[],
  ineligible: [],
  ...overrides,
})

beforeEach(() => {
  executeMigrationMock.mockReset()
  executeGraceRenewalMock.mockReset()
  prepareGraceRenewalMigrationMock.mockReset()
  REFRESH_ACCOUNT.mockReset()
  vi.useFakeTimers()
})

describe('migrationUiMachine', () => {
  describe('grace renewal before migration', () => {
    it('keeps an underfunded selection from starting renewal or migration', async () => {
      const actor = startRenewal([domain('alice'), domain('bob')], undefined, {
        balance: 99n,
      })
      await vi.advanceTimersByTimeAsync(60_000)

      expect(actor.getSnapshot().value).toBe('select')
      expect(actor.getSnapshot().context.renewal).toBeUndefined()
      expect(executeGraceRenewalMock).not.toHaveBeenCalled()
      expect(prepareGraceRenewalMigrationMock).not.toHaveBeenCalled()
      expect(executeMigrationMock).not.toHaveBeenCalled()
      actor.stop()
    })

    it.each([
      { scenario: 'the exact renewal balance', amount: 100n },
      { scenario: 'a zero-cost renewal and zero balance', amount: 0n },
    ])('allows $scenario to renew and then migrate', async ({ amount }) => {
      const graceDomain = domain('alice')
      const quote = makeRenewalQuote(graceDomain)
      const renewedDomains = [graceDomain]
      executeGraceRenewalMock.mockReturnValue(okAsync(renewedDomains))
      prepareGraceRenewalMigrationMock.mockResolvedValue(
        makePlan(renewedDomains),
      )
      executeMigrationMock.mockImplementation(() => new Promise(() => {}))

      const actor = startRenewal([graceDomain], undefined, {
        items: quote.items.map((item) => ({ ...item, amount })),
        totalAmount: amount,
        balance: amount,
      })
      await vi.advanceTimersByTimeAsync(0)

      expect(actor.getSnapshot().value).toEqual({ migrate: 'running' })
      expect(executeGraceRenewalMock).toHaveBeenCalledTimes(1)
      expect(prepareGraceRenewalMigrationMock).toHaveBeenCalledTimes(1)
      expect(executeMigrationMock).toHaveBeenCalledTimes(1)
      actor.stop()
    })

    it('exposes discard confirmation and clears it when renewal fails', async () => {
      const graceDomain = domain('alice')
      const quote = makeRenewalQuote(graceDomain)
      const pending = {
        ownerAddress: quote.ownerAddress,
        chainId: quote.chainId,
        items: quote.items.map(({ domain, targetExpiry }) => ({
          id: domain.id,
          name: domain.name,
          targetExpiry,
        })),
      }
      executeGraceRenewalMock.mockImplementation((params) =>
        fromPromise(
          (async () => {
            expect(
              await params.confirmDiscardUnsubmittedRenewal?.(pending),
            ).toBe(false)
            throw new Error('Previous renewal unresolved')
          })(),
          (cause) => new GraceRenewalError({ cause }),
        ),
      )
      const actor = startRenewal([graceDomain])
      await vi.advanceTimersByTimeAsync(0)
      const confirmation =
        actor.getSnapshot().context.renewalDiscardConfirmation
      expect(confirmation?.pending).toEqual(pending)
      confirmation?.resolve(false)
      await vi.advanceTimersByTimeAsync(0)
      expect(
        actor.getSnapshot().context.renewalDiscardConfirmation,
      ).toBeUndefined()
      expect(executeMigrationMock).not.toHaveBeenCalled()
      actor.stop()
    })

    it('waits for confirmed renewal and prepares the plan with refreshed names before starting migration', async () => {
      const graceDomain = domain('alice')
      const renewedDomain: V1Domain = {
        ...graceDomain,
        registration: { expiryDate: '605800' },
      }
      const activeDomain = domain('bob')
      let confirmRenewal!: (domains: readonly V1Domain[]) => void
      executeGraceRenewalMock.mockImplementation((params) => {
        params.onRenewalSubmitted?.('0x1234')
        params.onStatus?.('confirming')
        return fromPromise(
          new Promise<readonly V1Domain[]>((resolve) => {
            confirmRenewal = resolve
          }),
          (cause) => new GraceRenewalError({ cause }),
        )
      })
      let finishPreparation!: (plan: MigrationPlan) => void
      prepareGraceRenewalMigrationMock.mockImplementation(
        () =>
          new Promise<MigrationPlan>((resolve) => {
            finishPreparation = resolve
          }),
      )
      executeMigrationMock.mockImplementation(() => new Promise(() => {}))

      const actor = startRenewal([graceDomain, activeDomain])
      await vi.advanceTimersByTimeAsync(60_000)

      expect(actor.getSnapshot().value).toEqual({ migrate: 'renewing' })
      expect(actor.getSnapshot().context.progress?.isAwaitingConfirmation).toBe(
        true,
      )
      expect(executeGraceRenewalMock).toHaveBeenCalledTimes(1)
      expect(prepareGraceRenewalMigrationMock).not.toHaveBeenCalled()
      expect(executeMigrationMock).not.toHaveBeenCalled()

      confirmRenewal([renewedDomain])
      await vi.advanceTimersByTimeAsync(0)

      expect(actor.getSnapshot().value).toEqual({ migrate: 'preparing' })
      expect(prepareGraceRenewalMigrationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          domains: [graceDomain, activeDomain],
          renewedDomains: [renewedDomain],
          ownerAddress: OWNER,
          hcaAddress: SCA,
        }),
      )
      expect(executeMigrationMock).not.toHaveBeenCalled()

      const plan = makePlan([renewedDomain, activeDomain])
      finishPreparation(plan)
      await vi.advanceTimersByTimeAsync(0)

      expect(actor.getSnapshot().value).toEqual({ migrate: 'running' })
      expect(executeMigrationMock).toHaveBeenCalledWith(
        expect.objectContaining({ plan }),
      )
      actor.stop()
    })

    it('retries failed plan preparation without renewing the names again', async () => {
      const renewedDomains = [domain('alice')]
      executeGraceRenewalMock.mockReturnValue(okAsync(renewedDomains))
      prepareGraceRenewalMigrationMock
        .mockRejectedValueOnce(new Error('Could not fetch profiles'))
        .mockResolvedValueOnce(makePlan(renewedDomains))
      executeMigrationMock.mockImplementation(() => new Promise(() => {}))

      const actor = startRenewal()
      await vi.advanceTimersByTimeAsync(1500)

      expect(actor.getSnapshot().value).toBe('failure')
      expect(actor.getSnapshot().context.renewedDomains).toEqual(renewedDomains)
      expect(executeMigrationMock).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(executeGraceRenewalMock).toHaveBeenCalledTimes(1)
      expect(prepareGraceRenewalMigrationMock).toHaveBeenCalledTimes(1)

      actor.send({ type: 'retry' })
      await vi.advanceTimersByTimeAsync(0)

      expect(actor.getSnapshot().value).toEqual({ migrate: 'running' })
      expect(executeGraceRenewalMock).toHaveBeenCalledTimes(1)
      expect(prepareGraceRenewalMigrationMock).toHaveBeenCalledTimes(2)
      expect(executeMigrationMock).toHaveBeenCalledTimes(1)
      expect(actor.getSnapshot().context.lastError).toBeUndefined()
      actor.stop()
    })

    it('preserves a submitted renewal hash and only resumes it after an explicit retry', async () => {
      const renewalHash: Hex = '0x1234'
      executeGraceRenewalMock
        .mockImplementationOnce((params) => {
          params.onRenewalSubmitted?.(renewalHash)
          return errAsync(
            new GraceRenewalError({
              cause: new Error('Receipt wait timed out'),
            }),
          )
        })
        .mockReturnValueOnce(okAsync([domain('alice')]))
      prepareGraceRenewalMigrationMock.mockImplementation(
        () => new Promise(() => {}),
      )

      const actor = startRenewal()
      await vi.advanceTimersByTimeAsync(1500)

      expect(actor.getSnapshot().value).toBe('failure')
      expect(actor.getSnapshot().context.renewalHash).toBe(renewalHash)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(executeGraceRenewalMock).toHaveBeenCalledTimes(1)
      expect(prepareGraceRenewalMigrationMock).not.toHaveBeenCalled()
      expect(executeMigrationMock).not.toHaveBeenCalled()

      actor.send({ type: 'retry' })
      await vi.advanceTimersByTimeAsync(0)

      expect(executeGraceRenewalMock).toHaveBeenCalledTimes(2)
      expect(executeGraceRenewalMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ renewalHash }),
      )
      expect(actor.getSnapshot().value).toEqual({ migrate: 'preparing' })
      actor.stop()
    })

    it('stops after renewal rejection without submitting migration or retrying automatically', async () => {
      executeGraceRenewalMock.mockReturnValue(
        errAsync(
          new GraceRenewalError({ cause: new Error('User rejected request') }),
        ),
      )

      const actor = startRenewal()
      await vi.advanceTimersByTimeAsync(61_500)

      expect(actor.getSnapshot().value).toBe('failure')
      expect(actor.getSnapshot().context.lastError?.type).toBe('user-rejected')
      expect(executeGraceRenewalMock).toHaveBeenCalledTimes(1)
      expect(prepareGraceRenewalMigrationMock).not.toHaveBeenCalled()
      expect(executeMigrationMock).not.toHaveBeenCalled()
      actor.stop()
    })

    it('counts renewal as one completed game step throughout subsequent migration progress', async () => {
      executeGraceRenewalMock.mockReturnValue(okAsync([domain('alice')]))
      prepareGraceRenewalMigrationMock.mockResolvedValue(
        makePlan([domain('alice')], {
          stepDescriptors: [
            { type: 'deploy-hca' },
            { type: 'approval', approvalId: 'base-registrar:hca' },
            {
              type: 'atomic-batch',
              index: 0,
              total: 1,
              count: 1,
              migrateCount: 1,
              copyCount: 0,
            },
          ],
        }),
      )
      executeMigrationMock.mockImplementation(() => new Promise(() => {}))

      const actor = startRenewal()
      await vi.advanceTimersByTimeAsync(0)

      expect(actor.getSnapshot().context.stepDescriptors[0]).toEqual({
        type: 'renew-grace',
        count: 1,
      })
      expect(actor.getSnapshot().context.progress).toMatchObject({
        currentStep: 1,
        totalSteps: 4,
      })

      const onProgress = executeMigrationMock.mock.calls[0]?.[0].onProgress
      for (const currentStep of [0, 1, 3]) {
        onProgress?.({ currentStep, totalSteps: 3, description: 'Upgrading' })
        expect(actor.getSnapshot().context.progress).toMatchObject({
          currentStep: currentStep + 1,
          totalSteps: 4,
          description: 'Upgrading',
        })
      }
      actor.stop()
    })

    it('starts with the complete preview of approval, renewal, and migration requests', () => {
      executeGraceRenewalMock.mockReturnValue(
        fromPromise(
          new Promise<readonly V1Domain[]>(() => {}),
          (cause) => new GraceRenewalError({ cause }),
        ),
      )

      const actor = startRenewal([domain('alice')], RENEWAL_REQUEST_STEPS)

      expect(actor.getSnapshot().context.stepDescriptors).toEqual(
        RENEWAL_REQUEST_STEPS,
      )
      expect(actor.getSnapshot().context.progress).toMatchObject({
        currentStep: 0,
        totalSteps: 3,
      })
      expect(actor.getSnapshot().context.renewalApprovalCompleted).toBe(false)
      actor.stop()
    })

    it('adds a required approval and distinguishes signing from both receipt waits', () => {
      executeGraceRenewalMock.mockReturnValue(
        fromPromise(
          new Promise<readonly V1Domain[]>(() => {}),
          (cause) => new GraceRenewalError({ cause }),
        ),
      )
      const actor = startRenewal(
        [domain('alice')],
        RENEWAL_REQUEST_STEPS.filter(({ type }) => type !== 'renewal-approval'),
      )
      const callbacks = executeGraceRenewalMock.mock.calls[0]?.[0]

      callbacks?.onApprovalRequired?.(true)
      expect(actor.getSnapshot().context.stepDescriptors).toEqual(
        RENEWAL_REQUEST_STEPS,
      )
      callbacks?.onStatus?.('approving')
      expect(actor.getSnapshot().context.progress).toMatchObject({
        currentStep: 0,
        totalSteps: 3,
        isAwaitingConfirmation: false,
      })
      callbacks?.onStatus?.('approval-confirming')
      expect(actor.getSnapshot().context.progress).toMatchObject({
        currentStep: 0,
        totalSteps: 3,
        isAwaitingConfirmation: true,
      })
      callbacks?.onStatus?.('approval-complete')
      expect(actor.getSnapshot().context.renewalApprovalCompleted).toBe(true)
      expect(actor.getSnapshot().context.progress).toMatchObject({
        currentStep: 1,
        totalSteps: 3,
      })
      callbacks?.onStatus?.('renewing')
      expect(actor.getSnapshot().context.progress).toMatchObject({
        currentStep: 1,
        totalSteps: 3,
        isAwaitingConfirmation: false,
      })
      callbacks?.onStatus?.('confirming')
      expect(actor.getSnapshot().context.progress).toMatchObject({
        currentStep: 1,
        totalSteps: 3,
        isAwaitingConfirmation: true,
      })
      actor.stop()
    })

    it('removes a preview approval when the current allowance already covers renewal', () => {
      executeGraceRenewalMock.mockReturnValue(
        fromPromise(
          new Promise<readonly V1Domain[]>(() => {}),
          (cause) => new GraceRenewalError({ cause }),
        ),
      )
      const actor = startRenewal([domain('alice')], RENEWAL_REQUEST_STEPS)
      const callbacks = executeGraceRenewalMock.mock.calls[0]?.[0]

      callbacks?.onApprovalRequired?.(false)
      callbacks?.onStatus?.('renewing')
      expect(actor.getSnapshot().context.stepDescriptors).toEqual(
        RENEWAL_REQUEST_STEPS.filter(({ type }) => type !== 'renewal-approval'),
      )
      expect(actor.getSnapshot().context.progress).toMatchObject({
        currentStep: 0,
        totalSteps: 2,
        isAwaitingConfirmation: false,
      })
      callbacks?.onStatus?.('confirming')
      expect(actor.getSnapshot().context.progress).toMatchObject({
        currentStep: 0,
        totalSteps: 2,
        isAwaitingConfirmation: true,
      })
      expect(actor.getSnapshot().context.renewalApprovalCompleted).toBe(false)
      actor.stop()
    })

    it('retains a completed approval when retrying a submitted renewal without requiring it again', async () => {
      const renewalHash: Hex = '0x1234'
      executeGraceRenewalMock
        .mockImplementationOnce((params) => {
          params.onApprovalRequired?.(true)
          params.onStatus?.('approving')
          params.onStatus?.('approval-confirming')
          params.onStatus?.('approval-complete')
          params.onRenewalSubmitted?.(renewalHash)
          params.onStatus?.('confirming')
          return errAsync(
            new GraceRenewalError({
              cause: new Error('Renewal receipt wait timed out'),
            }),
          )
        })
        .mockImplementationOnce((params) => {
          params.onApprovalRequired?.(false)
          params.onStatus?.('confirming')
          return fromPromise(
            new Promise<readonly V1Domain[]>(() => {}),
            (cause) => new GraceRenewalError({ cause }),
          )
        })

      const actor = startRenewal([domain('alice')], RENEWAL_REQUEST_STEPS)
      await vi.advanceTimersByTimeAsync(1500)

      expect(actor.getSnapshot().value).toBe('failure')
      expect(actor.getSnapshot().context.renewalApprovalCompleted).toBe(true)
      expect(actor.getSnapshot().context.renewalHash).toBe(renewalHash)
      expect(actor.getSnapshot().context.progress).toMatchObject({
        currentStep: 1,
      })

      actor.send({ type: 'retry' })
      await vi.advanceTimersByTimeAsync(0)

      expect(executeGraceRenewalMock).toHaveBeenCalledTimes(2)
      expect(executeGraceRenewalMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ renewalHash }),
      )
      expect(actor.getSnapshot().value).toEqual({ migrate: 'renewing' })
      expect(actor.getSnapshot().context.renewalApprovalCompleted).toBe(true)
      expect(actor.getSnapshot().context.stepDescriptors).toEqual(
        RENEWAL_REQUEST_STEPS,
      )
      expect(actor.getSnapshot().context.progress).toMatchObject({
        currentStep: 1,
        totalSteps: 3,
        isAwaitingConfirmation: true,
      })
      actor.stop()
    })

    it('preserves both completed renewal requests when plan preparation is retried', async () => {
      const renewedDomains = [domain('alice')]
      executeGraceRenewalMock.mockImplementation((params) => {
        params.onApprovalRequired?.(true)
        params.onStatus?.('approval-complete')
        return okAsync(renewedDomains)
      })
      prepareGraceRenewalMigrationMock
        .mockRejectedValueOnce(new Error('Could not fetch profiles'))
        .mockResolvedValueOnce(
          makePlan(renewedDomains, {
            stepDescriptors: MIGRATION_REQUEST_STEPS,
          }),
        )
      executeMigrationMock.mockImplementation(() => new Promise(() => {}))

      const actor = startRenewal([domain('alice')], RENEWAL_REQUEST_STEPS)
      await vi.advanceTimersByTimeAsync(1500)
      expect(actor.getSnapshot().value).toBe('failure')
      expect(actor.getSnapshot().context.progress).toMatchObject({
        currentStep: 2,
        totalSteps: 3,
      })

      actor.send({ type: 'retry' })
      await vi.advanceTimersByTimeAsync(0)

      expect(executeGraceRenewalMock).toHaveBeenCalledTimes(1)
      expect(prepareGraceRenewalMigrationMock).toHaveBeenCalledTimes(2)
      expect(actor.getSnapshot().value).toEqual({ migrate: 'running' })
      expect(actor.getSnapshot().context.renewalApprovalCompleted).toBe(true)
      expect(actor.getSnapshot().context.stepDescriptors).toEqual(
        RENEWAL_REQUEST_STEPS,
      )
      expect(actor.getSnapshot().context.progress).toMatchObject({
        currentStep: 2,
        totalSteps: 3,
      })
      actor.stop()
    })

    it('offsets migration progress and its final count by both completed renewal requests', async () => {
      const renewedDomains = [domain('alice')]
      executeGraceRenewalMock.mockImplementation((params) => {
        params.onApprovalRequired?.(true)
        params.onStatus?.('approval-complete')
        return okAsync(renewedDomains)
      })
      prepareGraceRenewalMigrationMock.mockResolvedValue(
        makePlan(renewedDomains, {
          stepDescriptors: MIGRATION_REQUEST_STEPS,
        }),
      )
      let finishMigration!: (result: MigrationResult) => void
      executeMigrationMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            finishMigration = resolve
          }),
      )

      const actor = startRenewal([domain('alice')], RENEWAL_REQUEST_STEPS)
      await vi.advanceTimersByTimeAsync(0)
      expect(actor.getSnapshot().context.progress).toMatchObject({
        currentStep: 2,
        totalSteps: 3,
      })
      expect(actor.getSnapshot().context.stepDescriptors).toEqual(
        RENEWAL_REQUEST_STEPS,
      )

      const onProgress = executeMigrationMock.mock.calls[0]?.[0].onProgress
      for (const currentStep of [0, 1]) {
        onProgress?.({ currentStep, totalSteps: 1, description: 'Upgrading' })
        expect(actor.getSnapshot().context.progress).toMatchObject({
          currentStep: currentStep + 2,
          totalSteps: 3,
        })
      }
      finishMigration(migrationResult())
      await vi.advanceTimersByTimeAsync(0)

      expect(actor.getSnapshot().value).toEqual({ migrate: 'landing' })
      expect(actor.getSnapshot().context.progress).toMatchObject({
        currentStep: 3,
        totalSteps: 3,
      })
      actor.stop()
    })
  })

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
        hcaClient: HCA_CLIENT,
        refreshAccount: REFRESH_ACCOUNT,
      })
      expect(actor.getSnapshot().value).toBe('select')
    })
  })

  describe('migrate.running state', () => {
    it('transitions select → migrate.running on migration.start with classified names', () => {
      executeMigrationMock.mockImplementation(() => new Promise(() => {}))
      const actor = start()
      expect(actor.getSnapshot().value).toEqual({ migrate: 'running' })
      expect(actor.getSnapshot().context.plan?.classified).toHaveLength(1)
      expect(actor.getSnapshot().context.plan?.migrationOwner).toBe(OWNER)
      expect(executeMigrationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          signer: SIGNER,
          hcaClient: HCA_CLIENT,
          refreshAccount: REFRESH_ACCOUNT,
          reconcileBeforeSubmit: false,
        }),
      )
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

  describe('migrate.running → success', () => {
    it('finishes the stage fill, slides to center and holds the reunion for two seconds, then shows success', async () => {
      executeMigrationMock.mockImplementation(async (params) => {
        params.onBatchComplete?.(
          [{ name: 'alice.eth', action: 'migrate' }],
          '0xabc' as Hex,
        )
        return migrationResult()
      })
      const actor = start()
      await vi.advanceTimersByTimeAsync(0)

      expect(actor.getSnapshot().value).toEqual({ migrate: 'landing' })
      await vi.advanceTimersByTimeAsync(FINAL_STAGE_FILL_MS - 1)
      expect(actor.getSnapshot().value).toEqual({ migrate: 'landing' })
      await vi.advanceTimersByTimeAsync(1)
      expect(actor.getSnapshot().value).toEqual({ migrate: 'reuniting' })
      await vi.advanceTimersByTimeAsync(700)
      expect(actor.getSnapshot().value).toEqual({ migrate: 'reuniting' })
      await vi.advanceTimersByTimeAsync(1999)
      expect(actor.getSnapshot().value).toEqual({ migrate: 'reuniting' })
      await vi.advanceTimersByTimeAsync(1)
      expect(actor.getSnapshot().value).toBe('success')
      expect(actor.getSnapshot().context.txHashes).toEqual(['0xabc'])
      expect(actor.getSnapshot().context.completedOperations).toEqual([
        { name: 'alice.eth', action: 'migrate' },
      ])
    })

    it('accumulates migrate and copy operations across batchComplete events', async () => {
      executeMigrationMock.mockImplementation(async (params) => {
        params.onBatchComplete?.(
          [{ name: 'a.eth', action: 'migrate' }],
          '0x1' as Hex,
        )
        params.onBatchComplete?.(
          [
            { name: 'b.a.eth', action: 'copy' },
            { name: 'c.a.eth', action: 'copy' },
          ],
          '0x2' as Hex,
        )
        params.onBatchComplete?.(
          [{ name: 'd.eth', action: 'migrate' }],
          '0x3' as Hex,
        )
        return migrationResult({
          completed: 4,
          migrated: 2,
          copied: 2,
          completedOperations: [
            { name: 'a.eth', action: 'migrate' },
            { name: 'b.a.eth', action: 'copy' },
            { name: 'c.a.eth', action: 'copy' },
            { name: 'd.eth', action: 'migrate' },
          ],
        })
      })
      const actor = start()
      await vi.advanceTimersByTimeAsync(0)
      expect(actor.getSnapshot().context.completedOperations).toEqual([
        { name: 'a.eth', action: 'migrate' },
        { name: 'b.a.eth', action: 'copy' },
        { name: 'c.a.eth', action: 'copy' },
        { name: 'd.eth', action: 'migrate' },
      ])
    })

    it('records a reconciled batch when no transaction hash is available', async () => {
      executeMigrationMock.mockImplementation(async (params) => {
        params.onBatchComplete?.([{ name: 'alice.eth', action: 'migrate' }])
        return migrationResult({ txHashes: [] })
      })
      const actor = start()
      await vi.advanceTimersByTimeAsync(
        FINAL_STAGE_FILL_MS + REUNION_SLIDE_MS + REUNION_HOLD_MS,
      )

      expect(actor.getSnapshot().value).toBe('success')
      expect(actor.getSnapshot().context.completedOperations).toEqual([
        { name: 'alice.eth', action: 'migrate' },
      ])
      expect(actor.getSnapshot().context.txHashes).toEqual([])
    })

    it('resetAll returns to select and wipes context on done', async () => {
      executeMigrationMock.mockImplementation(async (params) => {
        params.onBatchComplete?.(
          [{ name: 'alice.eth', action: 'migrate' }],
          '0xabc' as Hex,
        )
        return migrationResult()
      })
      const actor = start()
      await vi.advanceTimersByTimeAsync(
        FINAL_STAGE_FILL_MS + REUNION_SLIDE_MS + REUNION_HOLD_MS,
      )

      actor.send({ type: 'done' })
      expect(actor.getSnapshot().value).toBe('select')
      expect(actor.getSnapshot().context.plan).toBeUndefined()
      expect(actor.getSnapshot().context.completedOperations).toEqual([])
      expect(actor.getSnapshot().context.txHashes).toEqual([])
    })
  })

  describe('migrate.failing → failure', () => {
    it('routes to failing when migration complete but no tx hashes (isOnlyFailures guard)', async () => {
      executeMigrationMock.mockResolvedValueOnce(
        migrationResult({
          completed: 0,
          migrated: 0,
          completedOperations: [],
          txHashes: [],
        }),
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
        params.onBatchComplete?.(
          [{ name: 'alice.eth', action: 'migrate' }],
          '0xabc' as Hex,
        )
        throw new Error('boom')
      })
      actor.send({
        type: 'migration.start',
        plan: makePlan([domain('alice'), domain('bob')]),
        signer: SIGNER,
        hcaClient: HCA_CLIENT,
        refreshAccount: REFRESH_ACCOUNT,
      })

      await vi.advanceTimersByTimeAsync(1500)
      expect(actor.getSnapshot().value).toBe('failure')
      expect(actor.getSnapshot().context.completedOperations).toEqual([
        { name: 'alice.eth', action: 'migrate' },
      ])

      executeMigrationMock.mockImplementation(() => new Promise(() => {}))
      actor.send({ type: 'retry' })

      const ctx = actor.getSnapshot().context
      expect(ctx.selectedNames).toEqual(['bob.eth'])
      expect(ctx.plan?.classified.map(({ domain }) => domain.name)).toEqual([
        'bob.eth',
      ])
      expect(ctx.lastError).toBeUndefined()
      expect(ctx.progress).toBeUndefined()
    })

    it('enables reconciliation mode for retries', async () => {
      executeMigrationMock.mockRejectedValueOnce(new Error('boom'))
      const actor = start()
      await vi.advanceTimersByTimeAsync(1500)

      executeMigrationMock.mockImplementation(() => new Promise(() => {}))
      actor.send({ type: 'retry' })
      await vi.advanceTimersByTimeAsync(0)

      expect(executeMigrationMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          reconcileBeforeSubmit: true,
        }),
      )
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
