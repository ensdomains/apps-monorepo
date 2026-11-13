import { registrationMachine } from '@ens-apps/transaction-manager/machines/registration/registration.machine'
import type { RegistrationVerification } from '@ens-apps/transaction-manager/machines/registration/registration.verification'
import { okAsync, ResultAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createActor, createMachine } from 'xstate'
import { bindAnalyticsFlow, createAnalyticsFlow } from '@/lib/posthog/flow'
import { publicClient } from '@/lib/wagmi'
import { createRegistrationCompletion } from './registrationCompletionAnalytics'

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

beforeEach(() => vi.clearAllMocks())

describe('registration completion observation', () => {
  it.each([
    ['eoa', 'CONFIRMED'],
    ['hca', 'CONFIRMED'],
    ['eoa', 'STOPPED'],
    ['hca', 'STOPPED'],
  ] as const)(
    'completes detached %s submission on %s receipt using pinned verification when needed',
    async (mode, outcome) => {
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
      let queued = (_txId: string) => {}
      submit.mockReturnValue(
        ResultAsync.fromSafePromise(
          new Promise<string>((resolve) => {
            queued = resolve
          }),
        ),
      )
      const capture = vi.fn()
      const analytics = { ...createAnalyticsFlow(), capture }
      const completion = createRegistrationCompletion({
        analytics,
        properties: { flow_id: analytics.flow_id, ens_name: input.name },
      })
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
          ) => completion.observe(txId, pinned),
        },
      }).start()
      actor.stop()
      queued('queued-after-unmount')
      await vi.waitFor(() =>
        expect(getTransaction).toHaveBeenCalledWith('queued-after-unmount'),
      )
      expect(capture).not.toHaveBeenCalled()
      if (outcome === 'STOPPED') transaction.stop()
      else transaction.send({ type: outcome })
      await vi.waitFor(() =>
        expect(capture).toHaveBeenCalledWith(
          'registration:flow_complete',
          completion.properties,
        ),
      )
      expect(capture).toHaveBeenCalledOnce()
      expect(verify.mock.calls).toEqual(outcome === 'STOPPED' ? [[input]] : [])
      transaction.stop()
    },
  )

  it('does not launch another verification poll for a live actor failure', async () => {
    const transaction = createActor(transactionMachine).start()
    getTransaction.mockReturnValue(transaction)
    const capture = vi.fn()
    const analytics = { ...createAnalyticsFlow(), capture }
    const completion = createRegistrationCompletion({
      analytics,
      properties: { flow_id: analytics.flow_id },
    })
    completion.observe('tx', {
      mode: 'eoa',
      input: {
        name: 'example.eth',
        owner: '0x1111111111111111111111111111111111111111',
        resolverAddress: '0x2222222222222222222222222222222222222222',
        publicClient,
        commitment: '0x1234',
      },
    })
    transaction.send({ type: 'FAILED' })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(verifyEoa).not.toHaveBeenCalled()
    expect(verifyHca).not.toHaveBeenCalled()
    expect(capture).not.toHaveBeenCalled()
    transaction.stop()
  })

  it('retries a replaced transaction under the same ID and deduplicates rebound observers', async () => {
    const failed = createActor(transactionMachine).start()
    getTransaction.mockReturnValue(failed)
    const analytics = createAnalyticsFlow('retry-flow')
    const capture = vi.spyOn(analytics, 'capture')
    const completion = createRegistrationCompletion({
      analytics,
      properties: { flow_id: analytics.flow_id },
    })
    completion.observe('tx-reg-register')
    failed.send({ type: 'FAILED' })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(capture).not.toHaveBeenCalled()

    const replacement = createActor(transactionMachine).start()
    const subscribe = vi.spyOn(replacement, 'subscribe')
    getTransaction.mockReturnValue(replacement)
    const rebound = bindAnalyticsFlow(analytics)
    vi.spyOn(rebound, 'capture').mockImplementation(capture)
    completion.observe('tx-reg-register')
    const reboundCompletion = createRegistrationCompletion(
      {
        analytics: rebound,
        properties: { ...completion.properties, execution_method: 'hca' },
      },
      completion,
    )
    reboundCompletion.observe('tx-reg-register')
    replacement.send({ type: 'CONFIRMED' })
    await vi.waitFor(() =>
      expect(capture).toHaveBeenCalledWith(
        'registration:flow_complete',
        completion.properties,
      ),
    )
    reboundCompletion.complete()
    expect(rebound.claimCompletion()).toBe(false)
    expect(capture).toHaveBeenCalledOnce()
    expect(subscribe).toHaveBeenCalledOnce()
    failed.stop()
    replacement.stop()
  })
})
