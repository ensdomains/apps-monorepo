import { registrationMachine } from '@ens-apps/transaction-manager/machines/registration/registration.machine'
import type { RegistrationVerification } from '@ens-apps/transaction-manager/machines/registration/registration.verification'
import { okAsync, ResultAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createActor, createMachine } from 'xstate'
import { bindAnalyticsFlow, createAnalyticsFlow } from '@/lib/posthog/flow'
import { publicClient } from '@/lib/wagmi'
import {
  captureRegistrationCompletion,
  observeRegistrationCompletion,
} from './registrationCompletionAnalytics'

const getTransaction = vi.hoisted(() => vi.fn())
const submit = vi.hoisted(() => vi.fn())
const verifyEoa = vi.hoisted(() => vi.fn())
const verifyHca = vi.hoisted(() => vi.fn())
vi.mock(
  '@ens-apps/transaction-manager/machines/registration/registration.actors',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@ens-apps/transaction-manager/machines/registration/registration.actors')
    >()),
    submitRegistrationActor: submit,
    verifyRegistrationActor: verifyEoa,
  }),
)
vi.mock(
  '@ens-apps/transaction-manager/machines/registration/registration.hca.actors',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@ens-apps/transaction-manager/machines/registration/registration.hca.actors')
    >()),
    submitRevealBatchActor: submit,
    verifyHcaRegistrationActor: verifyHca,
  }),
)
vi.mock('@ens-apps/transaction-manager/providers/transactionManager', () => ({
  transactionManager: { getTransaction },
}))

const transactionMachine = createMachine({
  context: {},
  initial: 'pending',
  states: {
    pending: { on: { CONFIRMED: 'success', FAILED: 'error' } },
    success: {},
    error: { initial: 'reverted', states: { reverted: {} } },
  },
})

beforeEach(() => getTransaction.mockReset())

describe('registration completion observation', () => {
  it.each(['submitRegistration', 'submitRevealBatch'] as const)(
    'observes %s receipts when UI stops before the queued ID is published',
    async (actorName) => {
      const transaction = createActor(transactionMachine).start()
      getTransaction.mockReturnValue(transaction)
      let queued = (_txId: string) => {}
      const pending = new Promise<string>((resolve) => {
        queued = resolve
      })
      submit.mockReturnValue(ResultAsync.fromPromise(pending, (cause) => cause))
      const capture = vi.fn()
      const completion = {
        analytics: { ...createAnalyticsFlow(), capture },
        properties: { flow_id: 'pending-submission' },
      }
      const implementation =
        registrationMachine.implementations.actors?.[actorName]
      const logic =
        implementation && 'src' in implementation
          ? implementation.src
          : implementation
      if (!logic) throw new Error(`Missing actor ${actorName}`)
      const owner = createActor(logic, {
        input: {
          onRegistrationQueued: (txId: string) =>
            observeRegistrationCompletion(completion, txId),
        },
      }).start()
      owner.stop()
      queued('queued-after-unmount')
      await vi.waitFor(() =>
        expect(getTransaction).toHaveBeenCalledWith('queued-after-unmount'),
      )
      transaction.send({ type: 'CONFIRMED' })
      await vi.waitFor(() =>
        expect(capture).toHaveBeenCalledWith(
          'registration:flow_complete',
          completion.properties,
        ),
      )
      expect(capture).toHaveBeenCalledOnce()
      transaction.stop()
    },
  )

  it('captures a real transaction outcome once after its UI owner stops', async () => {
    const transaction = createActor(transactionMachine).start()
    const subscribe = vi.spyOn(transaction, 'subscribe')
    getTransaction.mockReturnValue(transaction)
    const capture = vi.fn()
    const completion = {
      analytics: { flow_id: 'flow', capture },
      properties: {
        flow_id: 'flow',
        chain_id: 11155111,
        execution_method: 'hca' as const,
      },
    }
    const owner = createActor(
      createMachine({
        entry: () => observeRegistrationCompletion(completion, 'reveal'),
      }),
    ).start()
    owner.stop()
    transaction.send({ type: 'CONFIRMED' })
    await vi.waitFor(() =>
      expect(capture).toHaveBeenCalledWith(
        'registration:flow_complete',
        completion.properties,
      ),
    )
    captureRegistrationCompletion(completion)
    observeRegistrationCompletion(completion, 'reveal')
    expect(capture).toHaveBeenCalledOnce()
    expect(subscribe).toHaveBeenCalledOnce()
    transaction.stop()
  })

  it('deduplicates overlapping observations after the same flow is rebound', async () => {
    const transaction = createActor(transactionMachine).start()
    const subscribe = vi.spyOn(transaction, 'subscribe')
    getTransaction.mockReturnValue(transaction)
    const capture = vi.fn()
    const first = {
      analytics: createAnalyticsFlow('rebound-flow'),
      properties: { flow_id: 'rebound-flow' },
    }
    vi.spyOn(first.analytics, 'capture').mockImplementation(capture)
    const resumed = {
      analytics: bindAnalyticsFlow(first.analytics),
      properties: first.properties,
    }
    vi.spyOn(resumed.analytics, 'capture').mockImplementation(capture)
    observeRegistrationCompletion(first, 'reveal')
    observeRegistrationCompletion(resumed, 'reveal')
    transaction.send({ type: 'CONFIRMED' })
    await vi.waitFor(() =>
      expect(capture).toHaveBeenCalledWith(
        'registration:flow_complete',
        first.properties,
      ),
    )
    await Promise.resolve()
    captureRegistrationCompletion(resumed)
    expect(capture).toHaveBeenCalledOnce()
    expect(subscribe).toHaveBeenCalledOnce()
    transaction.stop()
  })

  it('observes a replacement transaction under the same queued ID after a failed attempt', async () => {
    const failed = createActor(transactionMachine).start()
    getTransaction.mockReturnValue(failed)
    const capture = vi.fn()
    const analytics = { ...createAnalyticsFlow(), capture }
    const completion = { analytics, properties: { flow_id: analytics.flow_id } }
    observeRegistrationCompletion(completion, 'tx-reg-register')
    failed.send({ type: 'FAILED' })
    const replacement = createActor(transactionMachine).start()
    getTransaction.mockReturnValue(replacement)
    const owner = createActor(
      createMachine({
        entry: () =>
          observeRegistrationCompletion(completion, 'tx-reg-register'),
      }),
    ).start()
    owner.stop()
    replacement.send({ type: 'CONFIRMED' })
    await vi.waitFor(() =>
      expect(capture).toHaveBeenCalledWith(
        'registration:flow_complete',
        completion.properties,
      ),
    )
    expect(capture).toHaveBeenCalledOnce()
    failed.stop()
    replacement.stop()
  })

  it('does not turn a reverted receipt into a completion', async () => {
    const transaction = createActor(transactionMachine).start()
    getTransaction.mockReturnValue(transaction)
    const capture = vi.fn()
    observeRegistrationCompletion(
      {
        analytics: { flow_id: 'failed-flow', capture },
        properties: { flow_id: 'failed-flow' },
      },
      'reveal',
    )
    transaction.send({ type: 'FAILED' })
    await vi.waitFor(() =>
      expect(transaction.getSnapshot().matches('error')).toBe(true),
    )
    await Promise.resolve()
    expect(capture).not.toHaveBeenCalled()
    transaction.stop()
  })
})

it.each(['eoa', 'hca'] as const)(
  'uses pinned %s verification when a detached submission receipt fails',
  async (mode) => {
    const transaction = createActor(transactionMachine).start()
    getTransaction.mockReturnValue(transaction)
    const input = {
      name: 'example.eth',
      owner: '0x2222222222222222222222222222222222222222' as const,
      wallet: '0x2222222222222222222222222222222222222222' as const,
      hca: '0x1111111111111111111111111111111111111111' as const,
      resolverAddress: '0x1111111111111111111111111111111111111111' as const,
      publicClient,
      duration: 31557600n,
      commitment: '0x1234' as const,
    }
    const verification: RegistrationVerification =
      mode === 'eoa' ? { mode, input } : { mode, input }
    const verify = mode === 'eoa' ? verifyEoa : verifyHca
    verify.mockReturnValue(okAsync({ verified: true }))
    let queued: (txId: string) => void = () => undefined
    const pending = new Promise<string>((resolve) => {
      queued = resolve
    })
    submit.mockReturnValue(ResultAsync.fromSafePromise(pending))
    const capture = vi.fn()
    const completion = {
      analytics: { ...createAnalyticsFlow(), capture },
      properties: { flow_id: 'detached-verified' },
    }
    const implementation =
      registrationMachine.implementations.actors?.[
        mode === 'eoa' ? 'submitRegistration' : 'submitRevealBatch'
      ]
    const logic =
      implementation && 'src' in implementation
        ? implementation.src
        : implementation
    if (!logic) throw new Error('Missing submission actor')
    const actor = createActor(logic, {
      input: {
        verification,
        onRegistrationQueued: (
          txId: string,
          pinned?: RegistrationVerification,
        ) => observeRegistrationCompletion(completion, txId, pinned),
      },
    }).start()
    actor.stop()
    queued('queued-after-unmount')
    transaction.send({ type: 'FAILED' })
    await vi.waitFor(() =>
      expect(capture).toHaveBeenCalledWith(
        'registration:flow_complete',
        completion.properties,
      ),
    )
    expect(verify).toHaveBeenCalledWith(input)
    transaction.stop()
  },
)
