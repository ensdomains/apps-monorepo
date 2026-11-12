import { transactionManager } from '@ens-apps/transaction-manager'
import {
  createCountingWallet,
  resetTransactionManager,
  testIntent,
  testPublicClient,
} from '@ens-apps/transaction-manager/test-utils/transactionActor'
import {
  createPublicClient,
  custom,
  encodeAbiParameters,
  encodeFunctionResult,
  multicall3Abi,
  toFunctionSelector,
} from 'viem'
import { sepolia } from 'viem/chains'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { waitFor } from 'xstate'
import {
  createRegistrationAnalytics,
  observeQueuedRegistrationReceipt,
} from './registrationAnalytics'

afterEach(resetTransactionManager)

const makeRun = (flowId?: string, name?: string) => {
  const capture = vi.fn()
  const analytics = createRegistrationAnalytics(
    11155111,
    { capture },
    flowId,
    name,
  )
  const observe = (value: string, retryTarget?: string) =>
    analytics.observe({ value, context: { retryTarget } })
  return { capture, analytics, observe }
}

describe('registration journey observation', () => {
  it('does not infer successful setup or cooldown from state group changes', () => {
    const { capture, observe } = makeRun()
    observe('submittingEoaSetupBundle')
    observe('waitingForCommitment')
    observe('fetchingCommitmentAge')
    observe('checkingAllowance')
    observe('commitmentCooldown')
    expect(capture.mock.calls.map(([name]) => name)).toEqual([
      'registration:stage_enter',
      'registration:stage_enter',
      'registration:stage_enter',
    ])
    expect(
      capture.mock.calls.map(([, properties]) => properties.stage),
    ).toEqual(['commit', 'approval', 'cooldown'])
  })

  it('keeps one flow through a failed stage and retry, completing only after ownership verification', () => {
    const { capture, analytics, observe } = makeRun('registration-entry')
    analytics.start(false)
    observe('committingTransaction')
    observe('waitingForCommitment')
    observe('error', 'committingTransaction')
    analytics.retry()
    observe('committingTransaction')
    observe('waitingForCommitment')
    observe('registeringDomain')
    observe('verifyingRegistration')
    expect(
      capture.mock.calls.filter(
        ([name]) => name === 'registration:flow_complete',
      ),
    ).toEqual([])
    observe('success')
    observe('success')
    analytics.complete()
    expect(capture.mock.calls.map(([name]) => name)).toEqual([
      'registration:flow_start',
      'registration:stage_enter',
      'registration:stage_fail',
      'registration:flow_retry',
      'registration:stage_enter',
      'registration:stage_enter',
      'registration:stage_enter',
      'registration:flow_complete',
    ])
    const flowId = capture.mock.calls[0]?.[1].flow_id
    expect(flowId).toBe('registration-entry')
    expect(capture.mock.calls[2]?.[1]).toEqual({
      flow_id: flowId,
      execution_method: 'eoa',
      chain_id: 11155111,
      stage: 'commit',
      is_retryable: true,
    })
    expect(
      capture.mock.calls.every(
        ([, properties]) =>
          properties.flow_id === flowId &&
          properties.execution_method === 'eoa' &&
          properties.chain_id === 11155111,
      ),
    ).toBe(true)
  })
})

describe('registration operation subscription', () => {
  it('observes a known-hash reveal mined after the recovery verifier would have stopped', async () => {
    vi.useFakeTimers()
    try {
      const { capture, analytics } = makeRun()
      const wallet = createCountingWallet(
        '0x1111111111111111111111111111111111111111',
      )
      const zero = '0x0000000000000000000000000000000000000000'
      let isMined = false
      const client = createPublicClient({
        chain: sepolia,
        transport: custom({
          request: async ({ method, params }) => {
            if (method !== 'eth_call')
              throw new Error(`Unexpected RPC method ${method}`)
            const call = params as readonly [{ readonly data: string }]
            const selector = call[0].data.slice(0, 10)
            const address = (value: typeof zero | typeof wallet.address) =>
              encodeAbiParameters([{ type: 'address' }], [value])
            const registeredOwner = address(isMined ? wallet.address : zero)
            const results: Readonly<Record<string, `0x${string}`>> = {
              [toFunctionSelector('REGISTRY()')]: address(wallet.address),
              [toFunctionSelector('commitmentAt(bytes32)')]:
                encodeAbiParameters([{ type: 'uint256' }], [isMined ? 0n : 1n]),
              [toFunctionSelector('aggregate3((address,bool,bytes)[])')]:
                encodeFunctionResult({
                  abi: multicall3Abi,
                  functionName: 'aggregate3',
                  result: [
                    { success: true, returnData: registeredOwner },
                    { success: true, returnData: registeredOwner },
                    { success: true, returnData: address(zero) },
                  ],
                }),
            }
            if (results[selector]) return results[selector]
            throw new Error(`Unexpected call selector ${selector}`)
          },
        }),
      })
      let finishReceipt = () => {}
      const receipt = new Promise<
        Awaited<ReturnType<typeof testPublicClient.waitForTransactionReceipt>>
      >((resolve) => {
        finishReceipt = async () =>
          resolve(
            await testPublicClient.waitForTransactionReceipt({ hash: '0xab' }),
          )
      })
      const id = transactionManager.startTransaction(
        testIntent(wallet.address),
        wallet.signer,
        {
          id: 'late-reveal',
          publicClient: { ...client, waitForTransactionReceipt: () => receipt },
        },
      )
      const actor = transactionManager.getTransaction(id)
      if (!actor) throw new Error('Missing reveal actor')
      await waitFor(actor, (snapshot) => snapshot.matches('pending'))
      observeQueuedRegistrationReceipt(id, analytics, {
        mode: 'eoa',
        input: {
          owner: wallet.address,
          publicClient: client,
          resolverAddress: wallet.address,
          name: 'review.eth',
          commitment: `0x${'ab'.repeat(32)}`,
        },
      })
      transactionManager.clear()
      await vi.advanceTimersByTimeAsync(40_000)
      expect(
        capture.mock.calls.filter(
          ([name]) => name === 'registration:flow_complete',
        ),
      ).toEqual([])
      isMined = true
      finishReceipt()
      await vi.advanceTimersByTimeAsync(30_000)
      expect(
        capture.mock.calls.filter(
          ([name]) => name === 'registration:flow_complete',
        ),
      ).toHaveLength(1)
      expect(wallet.walletRequests()).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

it('pins the normalized registration target through a later stage and completion', () => {
  const { capture, analytics, observe } = makeRun('named-entry', 'ALICE.eth')
  analytics.start(false)
  observe('registeringDomain')
  analytics.complete()
  expect(capture.mock.calls).toEqual([
    [
      'registration:flow_start',
      {
        flow_id: 'named-entry',
        ens_name: 'alice.eth',
        execution_method: 'eoa',
        chain_id: 11155111,
      },
    ],
    [
      'registration:stage_enter',
      {
        flow_id: 'named-entry',
        ens_name: 'alice.eth',
        execution_method: 'eoa',
        chain_id: 11155111,
        stage: 'registration',
      },
    ],
    [
      'registration:flow_complete',
      {
        flow_id: 'named-entry',
        ens_name: 'alice.eth',
        execution_method: 'eoa',
        chain_id: 11155111,
      },
    ],
  ])
})
