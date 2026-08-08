import type { Address, Hex, PublicClient, WalletClient } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@ens-apps/transaction-manager', () => ({
  ENS_SEPOLIA_CONTRACTS: {
    DefaultReverseRegistrar: '0x00000000000000000000000000000000000000d0',
    ReverseRegistrar: '0x00000000000000000000000000000000000000e0',
    LegacyRegistry: '0x00000000000000000000000000000000000000f0',
    DefaultReverseRegistrarAdapter:
      '0x00000000000000000000000000000000000000d1',
    ReverseRegistrarAdapter: '0x00000000000000000000000000000000000000e1',
  },
  getSmartAccountAddress: vi.fn(
    () => '0x1111111111111111111111111111111111111111',
  ),
  transactionManager: { startTransaction: vi.fn() },
  waitForTransaction: vi.fn(async () => ({ hash: '0xhash' as Hex })),
}))

import {
  type RhinestoneSigner,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { encodeFunctionData, parseAbi, zeroAddress } from 'viem'
import {
  addrReverseNode,
  setPrimaryName,
  setPrimaryNameWithHca,
} from './setPrimaryName'

const DEFAULT_REVERSE = '0x00000000000000000000000000000000000000d0'
const REVERSE = '0x00000000000000000000000000000000000000e0'
const LEGACY_REGISTRY = '0x00000000000000000000000000000000000000f0'
const DEFAULT_ADAPTER = '0x00000000000000000000000000000000000000d1'
const REVERSE_ADAPTER = '0x00000000000000000000000000000000000000e1'
const HCA_ADDRESS = '0x1111111111111111111111111111111111111111' as Address
const EOA_OWNER = '0x3333333333333333333333333333333333333333' as Address
const CHAIN_ID = 11155111
const publicClient = {} as PublicClient

const adapterAbi = parseAbi([
  'function setNameWithHCA(address addr, string name)',
  'function claimWithHCA(address addr, address resolver) returns (bytes32)',
])

const hcaSigner = {
  type: 'rhinestone',
  account: {},
  config: { accountAddress: HCA_ADDRESS },
  session: { session: {} },
} as unknown as RhinestoneSigner

const hcaPublicClient = (staleResolver: Address) =>
  ({
    readContract: vi.fn(async () => staleResolver),
  }) as unknown as PublicClient

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

describe('addrReverseNode', () => {
  it('matches the node the deployed adapter derives on-chain', () => {
    // Golden value from a Sepolia eth_call of ReverseRegistrarAdapter
    // .claimWithHCA for this owner.
    expect(
      addrReverseNode('0x371a3307cF36f4B0961D7E96E7B6EcD3FD84d9ec' as Address),
    ).toBe('0x4b166c188adba45114c6f6821d0238653daca895078045f6f8d7f47cf3bdf8ec')
  })
})

describe('setPrimaryNameWithHca', () => {
  it('submits one owner-signed intent writing default.reverse', async () => {
    start.mockReturnValueOnce('tx-intent')
    const onTxId = vi.fn()
    const client = hcaPublicClient(zeroAddress)

    await setPrimaryNameWithHca({
      name: 'leon',
      signer: hcaSigner,
      ownerAddress: EOA_OWNER,
      publicClient: client,
      chainId: CHAIN_ID,
      onTxId,
    })

    expect(start).toHaveBeenCalledTimes(1)
    expect(wait).toHaveBeenCalledWith('tx-intent')
    expect(onTxId).toHaveBeenCalledWith('tx-intent')

    const [intent, signer, opts] = start.mock.calls[0] ?? []
    expect(intent).toMatchObject({
      type: 'custom',
      request: {
        type: 'rhinestone-intent',
        from: HCA_ADDRESS,
        chainId: CHAIN_ID,
        rhinestoneParams: { sponsored: true },
      },
    })
    expect(opts).toMatchObject({ operation: 'set-primary-name' })

    // Owner-signed: the session must be stripped from the signer.
    expect((signer as RhinestoneSigner).session).toBeUndefined()

    const calls = (
      intent as unknown as {
        request: { rhinestoneParams: { calls: { to: string; data: Hex }[] } }
      }
    ).request.rhinestoneParams.calls
    expect(calls).toHaveLength(1)
    expect(calls[0]?.to).toBe(DEFAULT_ADAPTER)
    expect(calls[0]?.data).toBe(
      encodeFunctionData({
        abi: adapterAbi,
        functionName: 'setNameWithHCA',
        args: [EOA_OWNER, 'leon.eth'],
      }),
    )
  })

  it('clears a live addr.reverse entry that would shadow the default', async () => {
    start.mockReturnValueOnce('tx-intent')
    const client = hcaPublicClient(
      '0x00000000000000000000000000000000000000aa' as Address,
    )

    await setPrimaryNameWithHca({
      name: 'leon.eth',
      signer: hcaSigner,
      ownerAddress: EOA_OWNER,
      publicClient: client,
      chainId: CHAIN_ID,
    })

    expect(client.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: LEGACY_REGISTRY,
        functionName: 'resolver',
        args: [addrReverseNode(EOA_OWNER)],
      }),
    )

    const calls = (
      start.mock.calls[0]?.[0] as unknown as {
        request: { rhinestoneParams: { calls: { to: string; data: Hex }[] } }
      }
    ).request.rhinestoneParams.calls
    expect(calls).toHaveLength(2)
    expect(calls[1]?.to).toBe(REVERSE_ADAPTER)
    expect(calls[1]?.data).toBe(
      encodeFunctionData({
        abi: adapterAbi,
        functionName: 'claimWithHCA',
        args: [EOA_OWNER, zeroAddress],
      }),
    )
  })
})
