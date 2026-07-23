import type { Address, Hex, PublicClient, WalletClient } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@ens-apps/transaction-manager', () => ({
  ENS_SEPOLIA_CONTRACTS: {
    DefaultReverseRegistrar: '0x00000000000000000000000000000000000000d0',
    ReverseRegistrar: '0x00000000000000000000000000000000000000e0',
  },
  transactionManager: { startTransaction: vi.fn() },
  waitForTransaction: vi.fn(async () => ({ hash: '0xhash' as Hex })),
}))

import {
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { setPrimaryName } from './setPrimaryName'

const DEFAULT_REVERSE = '0x00000000000000000000000000000000000000d0'
const REVERSE = '0x00000000000000000000000000000000000000e0'
const EOA_OWNER = '0x3333333333333333333333333333333333333333' as Address
const CHAIN_ID = 11155111
const publicClient = {} as PublicClient

const start = vi.mocked(transactionManager.startTransaction)
const wait = vi.mocked(waitForTransaction)

afterEach(() => {
  vi.clearAllMocks()
})

describe('setPrimaryName', () => {
  it('submits two sequential EOA transactions from the owner (forward then reverse)', async () => {
    start.mockReturnValueOnce('tx-forward').mockReturnValueOnce('tx-reverse')
    const onTxId = vi.fn()
    const walletClient = {
      account: { address: EOA_OWNER },
    } as unknown as WalletClient

    await setPrimaryName({
      name: 'leon',
      ownerAddress: EOA_OWNER,
      walletClient,
      publicClient,
      chainId: CHAIN_ID,
      onTxId,
    })

    expect(start).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledTimes(2)
    expect(onTxId.mock.calls).toEqual([['tx-forward'], ['tx-reverse']])

    // Both legs are plain EOA transactions sent by the owner: the reverse
    // registrars key setName on msg.sender, so a smart account must never be
    // the sender.
    const [forwardIntent, forwardSigner, forwardOpts] =
      start.mock.calls[0] ?? []
    expect(forwardIntent).toMatchObject({
      type: 'custom',
      request: {
        type: 'eoa',
        from: EOA_OWNER,
        to: DEFAULT_REVERSE,
        value: 0n,
      },
    })
    expect(forwardSigner).toEqual({ type: 'eoa', walletClient })
    expect(forwardOpts).toMatchObject({ operation: 'set-primary-name' })

    const [reverseIntent, reverseSigner] = start.mock.calls[1] ?? []
    expect(reverseIntent).toMatchObject({
      type: 'custom',
      request: { type: 'eoa', from: EOA_OWNER, to: REVERSE, value: 0n },
    })
    expect(reverseSigner).toEqual({ type: 'eoa', walletClient })
  })

  it('rejects when the wallet client controls a different account', async () => {
    const walletClient = {
      account: { address: '0x4444444444444444444444444444444444444444' },
    } as unknown as WalletClient

    await expect(
      setPrimaryName({
        name: 'leon',
        ownerAddress: EOA_OWNER,
        walletClient,
        publicClient,
        chainId: CHAIN_ID,
      }),
    ).rejects.toThrow(/does not control the owner address/)

    expect(start).not.toHaveBeenCalled()
  })

  it('waits for the forward leg before submitting the reverse leg', async () => {
    const order: string[] = []
    start.mockImplementation((() => {
      order.push(`start-${start.mock.calls.length}`)
      return `tx-${start.mock.calls.length}`
    }) as never)
    wait.mockImplementation((async (txId: string) => {
      order.push(`wait-${txId}`)
      return { hash: '0xhash' as Hex }
    }) as never)

    await setPrimaryName({
      name: 'leon.eth',
      ownerAddress: EOA_OWNER,
      walletClient: {
        account: { address: EOA_OWNER },
      } as unknown as WalletClient,
      publicClient,
      chainId: CHAIN_ID,
    })

    expect(order).toEqual(['start-1', 'wait-tx-1', 'start-2', 'wait-tx-2'])
  })

  it('rejects when the wallet client has no bound account', async () => {
    await expect(
      setPrimaryName({
        name: 'leon',
        ownerAddress: EOA_OWNER,
        walletClient: {} as WalletClient,
        publicClient,
        chainId: CHAIN_ID,
      }),
    ).rejects.toThrow(/does not control the owner address/)

    expect(start).not.toHaveBeenCalled()
  })
})
