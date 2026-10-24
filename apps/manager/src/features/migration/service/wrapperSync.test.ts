import {
  type Address,
  decodeFunctionData,
  namehash,
  type PublicClient,
  parseAbi,
  type WalletClient,
} from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { envConfig } from '@/config'
import { makeClassified, OTHER, OWNER } from './_fixtures'
import { FUSES } from './classifyNames'
import { syncMigrationWrappers } from './wrapperSync'

const mocks = vi.hoisted(() => ({
  startTransaction: vi.fn(),
  waitForTransaction: vi.fn(),
}))

vi.mock('@ens-apps/transaction-manager', () => ({
  transactionManager: { startTransaction: mocks.startTransaction },
  waitForTransaction: mocks.waitForTransaction,
}))

const NOW = 2_000_000_000n
const GRACE = 90n * 86_400n
const LEASE = NOW + 365n * 86_400n
const WRAPPER = '0x0635513f179D50A207757E05759CbD106d7dFcE8'
const SYNC_ABI = parseAbi(['function syncWrapper(string[] labels)'])

type Chain = {
  readonly wrapperExpiry: Map<bigint, bigint>
  readonly wrappedOwner: Address
}

const setup = (state: Chain) => {
  const publicClient = {
    chain: envConfig.chain,
    getBlock: vi.fn(async () => ({ number: 10n, timestamp: NOW })),
    readContract: vi.fn(
      async ({
        functionName,
        args,
      }: {
        readonly functionName: string
        readonly args: readonly [bigint]
      }) => {
        if (functionName === 'nameExpires') return LEASE
        if (functionName === 'ownerOf') return WRAPPER
        return [
          state.wrappedOwner,
          Number(FUSES.IS_DOT_ETH),
          state.wrapperExpiry.get(args[0]) ?? 0n,
        ]
      },
    ),
    simulateContract: vi.fn(async () => ({})),
    waitForTransactionReceipt: vi.fn(),
  } as unknown as PublicClient
  const walletClient = {
    getChainId: vi.fn(async () => envConfig.chain.id),
    getAddresses: vi.fn(async () => [OWNER]),
  } as unknown as WalletClient
  return { publicClient, walletClient }
}

const name = (label: string) =>
  makeClassified({
    id: `0x${label}`,
    label,
    name: `${label}.eth`,
    tokenType: 'unlocked',
  })
const node = (label: string) => BigInt(namehash(`${label}.eth`))

beforeEach(() => {
  mocks.startTransaction.mockReset().mockReturnValue('tx-1')
  mocks.waitForTransaction.mockReset()
})

describe('syncMigrationWrappers', () => {
  it('syncs only the stale wrappers in one transaction and confirms the new expiry', async () => {
    const state: Chain = {
      wrappedOwner: OWNER,
      wrapperExpiry: new Map([
        [node('stale'), NOW + 3600n],
        [node('fresh'), LEASE + GRACE],
      ]),
    }
    const { publicClient, walletClient } = setup(state)
    mocks.waitForTransaction.mockImplementation(async () => {
      state.wrapperExpiry.set(node('stale'), LEASE + GRACE)
      return { hash: '0x01', receipt: { status: 'success', blockNumber: 11n } }
    })

    await syncMigrationWrappers({
      names: [name('stale'), name('fresh')],
      owner: OWNER,
      walletClient,
      publicClient,
    })

    expect(mocks.startTransaction).toHaveBeenCalledOnce()
    const [{ request }] = mocks.startTransaction.mock.calls[0] ?? []
    expect(request.to).toBe(envConfig.chain.contracts.ensEthRenewerV1.address)
    expect(
      decodeFunctionData({ abi: SYNC_ABI, data: request.data }).args,
    ).toEqual([['stale']])
  })

  it('refuses before any transaction when the wrapped name changed hands', async () => {
    const { publicClient, walletClient } = setup({
      wrappedOwner: OTHER,
      wrapperExpiry: new Map([[node('stale'), NOW + 3600n]]),
    })

    await expect(
      syncMigrationWrappers({
        names: [name('stale')],
        owner: OWNER,
        walletClient,
        publicClient,
      }),
    ).rejects.toThrow('no longer available to sync')
    expect(mocks.startTransaction).not.toHaveBeenCalled()
  })

  it('fails when the wrapper is still stale after the sync lands', async () => {
    const { publicClient, walletClient } = setup({
      wrappedOwner: OWNER,
      wrapperExpiry: new Map([[node('stale'), NOW + 3600n]]),
    })
    mocks.waitForTransaction.mockResolvedValue({
      hash: '0x01',
      receipt: { status: 'success', blockNumber: 11n },
    })

    await expect(
      syncMigrationWrappers({
        names: [name('stale')],
        owner: OWNER,
        walletClient,
        publicClient,
      }),
    ).rejects.toThrow('Could not confirm the updated expiry')
  })
})
