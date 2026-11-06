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
import { createRenewalAnalytics } from './renewalAnalytics'

afterEach(resetTransactionManager)

const wallet = () =>
  createCountingWallet('0x1111111111111111111111111111111111111111')

const completionCalls = (capture: ReturnType<typeof vi.fn>) =>
  capture.mock.calls.filter(([name]) => name === 'renewal:flow_complete')

describe('renewal analytics', () => {
  it('observes a replacement actor while the stopped actor with its id is still recovering', async () => {
    const capture = vi.fn()
    const signer = wallet()
    const analytics = createRenewalAnalytics(1, sepolia.id, { capture })
    let finishOldReceipt = () => {}
    const oldReceipt = new Promise<
      Awaited<ReturnType<typeof testPublicClient.waitForTransactionReceipt>>
    >((resolve) => {
      finishOldReceipt = async () =>
        resolve({
          ...(await testPublicClient.waitForTransactionReceipt({
            hash: TEST_TX_HASH,
          })),
          status: 'reverted',
        })
    })
    const start = (publicClient = testPublicClient) =>
      analytics.startTransaction(
        'execution',
        1,
        testIntent(signer.address),
        signer.signer,
        { id: 'replacement-renewal', publicClient },
      )
    const id = start({
      ...testPublicClient,
      waitForTransactionReceipt: () => oldReceipt,
    })
    const oldActor = transactionManager.getTransaction(id)
    if (!oldActor) throw new Error('Missing original renewal actor')
    await waitFor(oldActor, (snapshot) => snapshot.matches('pending'))
    transactionManager.clear()
    start()
    await waitForTransaction(id)
    expect(completionCalls(capture)).toHaveLength(1)
    finishOldReceipt()
    await oldReceipt
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(completionCalls(capture)).toHaveLength(1)
    expect(
      capture.mock.calls.filter(
        ([name]) => name === 'renewal:transaction_confirm',
      ),
    ).toHaveLength(1)
    expect(
      capture.mock.calls.filter(([name]) => name === 'renewal:stage_fail'),
    ).toEqual([])
    expect(signer.walletRequests()).toBe(2)
  })

  it.each([200, 500])(
    'observes a submitted bundle reporting status %s after its actor stops',
    async (status) => {
      const capture = vi.fn()
      const sendCalls = vi.fn(() => ({ id: '0xab' }))
      let finishStatus = () => {}
      const statusReady = new Promise<void>((resolve) => {
        finishStatus = resolve
      })
      const owner = wallet().address
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
      const analytics = createRenewalAnalytics(1, sepolia.id, { capture })
      const id = analytics.startTransaction(
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
      const actor = transactionManager.getTransaction(id)
      if (!actor) throw new Error('Missing bundle actor')
      await waitFor(actor, (snapshot) => snapshot.matches('pending'))
      expect(actor.getSnapshot().context.callsId).toBe('0xab')
      expect(actor.getSnapshot().context.hash).toBeUndefined()
      transactionManager.clear()
      finishStatus()
      await vi.waitFor(() =>
        expect(
          capture.mock.calls.filter(
            ([name]) =>
              name ===
              (status === 200 ? 'renewal:flow_complete' : 'renewal:stage_fail'),
          ),
        ).toHaveLength(1),
      )
      expect(sendCalls).toHaveBeenCalledTimes(1)
    },
  )

  it.each(['success', 'reverted'] as const)(
    'observes a known-hash %s receipt after a global manager clear',
    async (status) => {
      const capture = vi.fn()
      const signer = wallet()
      let finishReceipt = () => {}
      const receipt = new Promise<
        Awaited<ReturnType<typeof testPublicClient.waitForTransactionReceipt>>
      >((resolve) => {
        finishReceipt = async () =>
          resolve({
            ...(await testPublicClient.waitForTransactionReceipt({
              hash: '0xab',
            })),
            status,
          })
      })
      const analytics = createRenewalAnalytics(1, 11155111, { capture })
      const id = analytics.startTransaction(
        'execution',
        1,
        testIntent(signer.address),
        signer.signer,
        {
          id: 'clear-pending',
          publicClient: {
            ...testPublicClient,
            waitForTransactionReceipt: () => receipt,
          },
        },
      )
      const actor = transactionManager.getTransaction(id)
      if (!actor) throw new Error('Missing renewal actor')
      await waitFor(actor, (snapshot) => snapshot.matches('pending'))
      transactionManager.clear()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(
        capture.mock.calls.filter(([name]) => name === 'renewal:stage_fail'),
      ).toEqual([])
      finishReceipt()
      await vi.waitFor(() =>
        expect(
          capture.mock.calls.filter(
            ([name]) =>
              name ===
              (status === 'success'
                ? 'renewal:flow_complete'
                : 'renewal:stage_fail'),
          ),
        ).toHaveLength(1),
      )
      expect(completionCalls(capture)).toHaveLength(
        status === 'success' ? 1 : 0,
      )
      expect(signer.walletRequests()).toBe(1)
    },
  )

  it('retains the wallet result after cancellation removes an actor before its hash is known', async () => {
    const capture = vi.fn()
    const signer = wallet()
    const hold = signer.hold()
    const analytics = createRenewalAnalytics(1, 11155111, { capture })
    const id = analytics.startTransaction(
      'execution',
      1,
      testIntent(signer.address),
      signer.signer,
      { id: 'cancel-wallet', publicClient: testPublicClient },
    )
    await vi.waitFor(() => expect(signer.walletRequests()).toBe(1))
    transactionManager.cancelTransaction(id)
    hold.release()
    await vi.waitFor(() => expect(completionCalls(capture)).toHaveLength(1))
    expect(
      capture.mock.calls.filter(([name]) => name === 'renewal:stage_fail'),
    ).toEqual([])
    expect(signer.walletRequests()).toBe(1)
  })

  it('does not label cleanup before the wallet returns a hash as an execution failure', async () => {
    const capture = vi.fn()
    const signer = wallet()
    const hold = signer.hold()
    const analytics = createRenewalAnalytics(1, 11155111, { capture })
    analytics.startTransaction(
      'execution',
      1,
      testIntent(signer.address),
      signer.signer,
      { id: 'clear-wallet', publicClient: testPublicClient },
    )
    await vi.waitFor(() => expect(signer.walletRequests()).toBe(1))
    transactionManager.clear()
    hold.release()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(capture.mock.calls.map(([name]) => name)).toEqual([
      'renewal:flow_start',
      'renewal:stage_enter',
    ])
  })

  it('still starts and confirms the renewal when analytics correlation is unavailable', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementationOnce(() => {
      throw new Error('crypto unavailable')
    })
    const capture = vi.fn()
    const analytics = createRenewalAnalytics(1, 11155111, { capture })
    const signer = wallet()
    const id = analytics.startTransaction(
      'execution',
      1,
      testIntent(signer.address),
      signer.signer,
      { id: 'without-analytics', publicClient: testPublicClient },
    )
    const result = await waitForTransaction(id)
    expect(result.receipt?.status).toBe('success')
    expect(capture).not.toHaveBeenCalled()
  })
  it('completes from the actual receipt without a modal Done callback', async () => {
    const capture = vi.fn()
    const analytics = createRenewalAnalytics(1, 11155111, { capture })
    const signer = wallet()
    const hold = signer.hold()
    const id = analytics.startTransaction(
      'execution',
      1,
      testIntent(signer.address),
      signer.signer,
      { id: 'renewal-receipt', publicClient: testPublicClient },
    )
    expect(completionCalls(capture)).toEqual([])
    hold.release()
    await waitForTransaction(id)
    expect(completionCalls(capture)).toHaveLength(1)
  })

  it('deduplicates pending starts and completes only after all batch receipts', async () => {
    const capture = vi.fn()
    const analytics = createRenewalAnalytics(3, 11155111, { capture })
    const signer = wallet()
    const hold = signer.hold()
    const start = (id: string, stage: 'approval' | 'execution') =>
      analytics.startTransaction(
        stage,
        3,
        testIntent(signer.address),
        signer.signer,
        { id, publicClient: testPublicClient },
      )
    start('approval', 'approval')
    start('approval', 'approval')
    hold.release()
    await waitForTransaction('approval')
    start('v1', 'execution')
    await waitForTransaction('v1')
    expect(completionCalls(capture)).toEqual([])
    start('v2', 'execution')
    await waitForTransaction('v2')
    expect(
      capture.mock.calls.filter(
        ([name]) => name === 'renewal:transaction_confirm',
      ),
    ).toHaveLength(3)
    expect(completionCalls(capture)).toEqual([
      [
        'renewal:flow_complete',
        {
          flow_id: capture.mock.calls[0]?.[1].flow_id,
          chain_id: 11155111,
          item_count: 3,
        },
      ],
    ])
    expect(signer.walletRequests()).toBe(3)
  })

  it('reports a failed stage and retries it without counting earlier progress twice', async () => {
    const capture = vi.fn()
    const analytics = createRenewalAnalytics(1, 11155111, { capture })
    const signer = wallet()
    const start = (
      id: string,
      stage: 'approval' | 'execution',
      publicClient = testPublicClient,
    ) =>
      analytics.startTransaction(
        stage,
        2,
        testIntent(signer.address),
        signer.signer,
        { id, publicClient },
      )
    start('approval', 'approval')
    await waitForTransaction('approval')
    start('renew', 'execution', {
      ...testPublicClient,
      waitForTransactionReceipt: async () =>
        Promise.reject(new Error('RPC unavailable')),
    })
    await expect(waitForTransaction('renew')).rejects.toThrow()
    expect(completionCalls(capture)).toEqual([])
    expect(
      capture.mock.calls.filter(([name]) => name === 'renewal:stage_fail'),
    ).toEqual([
      [
        'renewal:stage_fail',
        expect.objectContaining({ stage: 'execution', is_retryable: true }),
      ],
    ])
    start('renew', 'execution')
    await waitForTransaction('renew')
    expect(
      capture.mock.calls.filter(([name]) => name === 'renewal:flow_retry'),
    ).toHaveLength(1)
    expect(completionCalls(capture)).toHaveLength(1)
    expect(
      transactionManager.getTransaction('approval')?.getSnapshot().value,
    ).toBe('success')
  })
})
