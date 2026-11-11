import {
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import {
  createCountingWallet,
  resetTransactionManager,
  TEST_TX_HASH,
  testIntent,
  testPublicClient,
} from '@ens-apps/transaction-manager/test-utils/transactionActor'
import { createWalletClient, custom, toHex } from 'viem'
import { sepolia } from 'viem/chains'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { waitFor } from 'xstate'
import {
  createRenewalAnalytics,
  getRenewalProtocolProperties,
} from './renewalAnalytics'

afterEach(resetTransactionManager)

const makeRun = (transactionCount = 1, itemCount = 1) => {
  const capture = vi.fn()
  const signer = createCountingWallet(
    '0x1111111111111111111111111111111111111111',
  )
  const analytics = createRenewalAnalytics(itemCount, sepolia.id, { capture })
  return {
    capture,
    signer,
    analytics,
    calls: (name: string) =>
      capture.mock.calls.filter(([event]) => event === `renewal:${name}`),
    start: (
      id: string,
      stage: 'approval' | 'execution' = 'execution',
      publicClient = testPublicClient,
    ) =>
      analytics.startTransaction(
        stage,
        transactionCount,
        testIntent(signer.address),
        signer.signer,
        { id, publicClient },
      ),
  }
}

const holdReceipt = (status: 'success' | 'reverted' = 'success') => {
  let finish = () => {}
  const receipt = new Promise<
    Awaited<ReturnType<typeof testPublicClient.waitForTransactionReceipt>>
  >((resolve) => {
    finish = async () =>
      resolve({
        ...(await testPublicClient.waitForTransactionReceipt({
          hash: TEST_TX_HASH,
        })),
        status,
      })
  })
  return {
    receipt,
    finish: () => finish(),
    publicClient: {
      ...testPublicClient,
      waitForTransactionReceipt: () => receipt,
    },
  }
}

const waitForPending = async (id: string) => {
  const actor = transactionManager.getTransaction(id)
  if (!actor) throw new Error('Missing renewal actor')
  await waitFor(actor, (snapshot) => snapshot.matches('pending'))
  return actor
}

describe('renewal analytics', () => {
  it('ignores the old receipt when an id is reused during recovery', async () => {
    const run = makeRun()
    const old = holdReceipt('reverted')
    const id = run.start('replacement-renewal', 'execution', old.publicClient)
    await waitForPending(id)
    transactionManager.clear()
    run.start(id)
    await waitForTransaction(id)
    expect(run.calls('flow_complete')).toHaveLength(1)
    old.finish()
    await old.receipt
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(run.calls('flow_complete')).toHaveLength(1)
    expect(run.calls('transaction_confirm')).toHaveLength(1)
    expect(run.calls('stage_fail')).toEqual([])
    expect(run.signer.walletRequests()).toBe(2)
  })

  it.each([200, 500])(
    'observes a submitted bundle reporting status %s after its actor stops',
    async (status) => {
      const run = makeRun()
      const sendCalls = vi.fn(() => ({ id: '0xab' }))
      let finishStatus = () => {}
      const statusReady = new Promise<void>((resolve) => {
        finishStatus = resolve
      })
      const owner = run.signer.address
      const receiptStatus = status === 200 ? '0x1' : '0x0'
      const walletClient = createWalletClient({
        account: owner,
        chain: sepolia,
        transport: custom({
          request: async ({ method }) => {
            if (method === 'eth_chainId') return toHex(sepolia.id)
            if (method === 'wallet_getCapabilities')
              return {
                [toHex(sepolia.id)]: { atomic: { status: 'supported' } },
              }
            if (method === 'wallet_sendCalls') return sendCalls()
            if (method === 'wallet_getCallsStatus') {
              await statusReady
              return {
                version: '2.0.0',
                id: '0xab',
                chainId: toHex(sepolia.id),
                atomic: true,
                status,
                receipts: [
                  {
                    logs: [],
                    status: receiptStatus,
                    blockHash: TEST_TX_HASH,
                    blockNumber: '0x1',
                    gasUsed: '0x5208',
                    transactionHash: TEST_TX_HASH,
                  },
                ],
              }
            }
            throw new Error(`Unexpected RPC method ${method}`)
          },
        }),
      })
      const id = run.analytics.startTransaction(
        'execution',
        1,
        {
          type: 'eoa-batch',
          from: owner,
          chainId: sepolia.id,
          calls: [{ to: owner, data: '0x', value: 0n }],
        },
        { type: 'eoa', walletClient },
        { id: 'clear-bundle', publicClient: testPublicClient },
      )
      const actor = await waitForPending(id)
      expect(actor.getSnapshot().context.callsId).toBe('0xab')
      expect(actor.getSnapshot().context.hash).toBeUndefined()
      transactionManager.clear()
      finishStatus()
      await vi.waitFor(() =>
        expect(
          run.calls(status === 200 ? 'flow_complete' : 'stage_fail'),
        ).toHaveLength(1),
      )
      expect(sendCalls).toHaveBeenCalledTimes(1)
    },
  )

  it.each(['success', 'reverted'] as const)(
    'observes a known-hash %s receipt after a global manager clear',
    async (status) => {
      const run = makeRun()
      const receipt = holdReceipt(status)
      const id = run.start('clear-pending', 'execution', receipt.publicClient)
      await waitForPending(id)
      transactionManager.clear()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(run.calls('stage_fail')).toEqual([])
      receipt.finish()
      await vi.waitFor(() =>
        expect(
          run.calls(status === 'success' ? 'flow_complete' : 'stage_fail'),
        ).toHaveLength(1),
      )
      expect(run.calls('flow_complete')).toHaveLength(
        status === 'success' ? 1 : 0,
      )
      expect(run.signer.walletRequests()).toBe(1)
    },
  )

  it.each(['cancel', 'clear'] as const)(
    'handles %s before the wallet returns a hash',
    async (cleanup) => {
      const run = makeRun()
      const hold = run.signer.hold()
      const id = run.start('pending-wallet')
      await vi.waitFor(() => expect(run.signer.walletRequests()).toBe(1))
      if (cleanup === 'cancel') transactionManager.cancelTransaction(id)
      else transactionManager.clear()
      hold.release()
      if (cleanup === 'cancel') {
        await vi.waitFor(() =>
          expect(run.calls('flow_complete')).toHaveLength(1),
        )
        expect(run.calls('stage_fail')).toEqual([])
      } else {
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(run.capture.mock.calls.map(([name]) => name)).toEqual([
          'renewal:flow_start',
          'renewal:stage_enter',
        ])
      }
      expect(run.signer.walletRequests()).toBe(1)
    },
  )

  it('still renews when analytics correlation is unavailable', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementationOnce(() => {
      throw new Error('crypto unavailable')
    })
    const run = makeRun()
    const result = await waitForTransaction(run.start('without-analytics'))
    expect(result.receipt?.status).toBe('success')
    expect(run.capture).not.toHaveBeenCalled()
  })

  it('deduplicates starts and retries while counting partial batch progress once', async () => {
    const run = makeRun(3, 3)
    const hold = run.signer.hold()
    run.start('approval', 'approval')
    run.start('approval', 'approval')
    hold.release()
    await waitForTransaction('approval')
    run.start('v1')
    await waitForTransaction('v1')
    expect(run.calls('flow_complete')).toEqual([])
    run.start('v2', 'execution', {
      ...testPublicClient,
      waitForTransactionReceipt: async () =>
        Promise.reject(new Error('RPC unavailable')),
    })
    await expect(waitForTransaction('v2')).rejects.toThrow()
    expect(run.calls('flow_complete')).toEqual([])
    expect(run.calls('stage_fail')).toEqual([
      [
        'renewal:stage_fail',
        expect.objectContaining({ stage: 'execution', is_retryable: true }),
      ],
    ])
    run.start('v2')
    await waitForTransaction('v2')
    expect(run.calls('flow_retry')).toHaveLength(1)
    expect(run.calls('transaction_confirm')).toHaveLength(3)
    expect(run.calls('flow_complete')).toEqual([
      [
        'renewal:flow_complete',
        {
          flow_id: run.capture.mock.calls[0]?.[1].flow_id,
          chain_id: sepolia.id,
          item_count: 3,
        },
      ],
    ])
    expect(run.signer.walletRequests()).toBe(4)
    expect(
      transactionManager.getTransaction('approval')?.getSnapshot().value,
    ).toBe('success')
  })
})

it.each([
  {
    names: [{ isV2: false }],
    isBulk: false,
    expected: { is_bulk: false, protocol_version: 'v1' },
  },
  {
    names: [{ isV2: true }],
    isBulk: false,
    expected: { is_bulk: false, protocol_version: 'v2' },
  },
  {
    names: [{ isV2: false }, { isV2: true }, { isV2: true }],
    isBulk: true,
    expected: {
      is_bulk: true,
      protocol_version: 'mixed',
      v1_item_count: 1,
      v2_item_count: 2,
    },
  },
])(
  'classifies actual renewal targets as $expected.protocol_version',
  ({ names, isBulk, expected }) => {
    expect(getRenewalProtocolProperties(names, isBulk)).toEqual(expected)
  },
)

it('keeps the preview flow and mixed protocol counts through receipt-backed completion', async () => {
  const capture = vi.fn()
  const signer = createCountingWallet(
    '0x1111111111111111111111111111111111111111',
  )
  const properties = {
    flow_id: 'preview-flow',
    ...getRenewalProtocolProperties([{ isV2: false }, { isV2: true }], true),
  }
  const analytics = createRenewalAnalytics(
    2,
    sepolia.id,
    { capture },
    properties,
  )
  const id = analytics.startTransaction(
    'execution',
    1,
    testIntent(signer.address),
    signer.signer,
    { id: 'mixed-protocol-analytics', publicClient: testPublicClient },
  )
  await waitForTransaction(id)
  expect(capture.mock.calls[0]).toEqual([
    'renewal:flow_start',
    { ...properties, chain_id: sepolia.id },
  ])
  expect(
    capture.mock.calls.filter(([name]) => name === 'renewal:flow_complete'),
  ).toEqual([
    [
      'renewal:flow_complete',
      { ...properties, chain_id: sepolia.id, item_count: 2 },
    ],
  ])
})
