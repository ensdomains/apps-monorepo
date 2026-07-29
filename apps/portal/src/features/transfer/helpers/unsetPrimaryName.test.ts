import { ok } from 'neverthrow'
import type { Address, PublicClient, WalletClient } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  setReverseResolution,
  getName,
  getReverseRecordFromRegistry,
  normalize,
} = vi.hoisted(() => ({
  setReverseResolution: vi.fn(),
  getName: vi.fn(),
  getReverseRecordFromRegistry: vi.fn(),
  normalize: vi.fn((value: string) => value.toLowerCase()),
}))

vi.mock('@ens-apps/transaction-manager', () => ({
  ENS_SEPOLIA_CONTRACTS: {
    ReverseRegistrar: '0xA0a1AbcDAe1a2a4A2EF8e9113Ff0e02DD81DC0C6' as Address,
  },
}))

vi.mock('@/features/reverse-resolution/helpers/setReverseResolution', () => ({
  setReverseResolution,
}))

vi.mock('@ensdomains/ensjs/public', () => ({
  getName,
  getReverseRecordFromRegistry,
}))

vi.mock('viem/ens', () => ({
  normalize,
}))

const mockClient = { chain: { id: 11155111 } }
vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok(mockClient),
}))

import {
  ENS_SEPOLIA_CONTRACTS,
  type Signer,
} from '@ens-apps/transaction-manager'
import { DEFAULT_REVERSE_REGISTRAR_ADDRESS } from '@/features/reverse-resolution/config'
import { DEFAULT_EVM_COIN_TYPE, MAINNET_COIN_TYPE } from '@/lib/coinType'
import { getUnsetPrimaryTargets, unsetPrimaryName } from './unsetPrimaryName'

const OWNER = '0x1111111111111111111111111111111111111111' as Address
const walletClient = { account: { address: OWNER } } as WalletClient
const publicClient = {} as PublicClient
const signer: Signer = { type: 'eoa', walletClient: {} as WalletClient }

const baseParams = {
  name: 'alice.eth',
  owner: OWNER,
  walletClient,
  publicClient,
  signer,
  chainId: 11155111,
  id: 'transfer-alice.eth-unset-default-reverse',
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('getUnsetPrimaryTargets', () => {
  const nameResult = (name: string) => ({
    name,
    match: true,
    normalized: true,
    reverseResolverAddress: null,
    resolverAddress: null,
  })

  it('flags both registrars when both hold this name', async () => {
    getName
      .mockResolvedValueOnce(nameResult('alice.eth'))
      .mockResolvedValueOnce(nameResult('alice.eth'))

    await expect(
      getUnsetPrimaryTargets({ owner: OWNER, name: 'alice.eth' }),
    ).resolves.toEqual({ clearDefault: true, clearReverse: true })

    expect(getName).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({
        address: OWNER,
        coinType: DEFAULT_EVM_COIN_TYPE,
        allowMismatch: true,
      }),
    )
    expect(getName).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({
        address: OWNER,
        coinType: MAINNET_COIN_TYPE,
        allowMismatch: true,
      }),
    )
    expect(getReverseRecordFromRegistry).not.toHaveBeenCalled()
  })

  it('uses registry fallback when getName returns no addr.reverse name', async () => {
    getName
      .mockResolvedValueOnce(nameResult('alice.eth'))
      .mockResolvedValueOnce(null)
    getReverseRecordFromRegistry.mockResolvedValueOnce({
      name: 'alice.eth',
      reverseResolverAddress: '0x3333333333333333333333333333333333333333',
    })

    await expect(
      getUnsetPrimaryTargets({ owner: OWNER, name: 'alice.eth' }),
    ).resolves.toEqual({ clearDefault: true, clearReverse: true })
  })

  it('returns false for both when neither matches', async () => {
    getName
      .mockResolvedValueOnce(nameResult('other.eth'))
      .mockResolvedValueOnce(null)
    getReverseRecordFromRegistry.mockResolvedValueOnce({
      name: 'still-other.eth',
      reverseResolverAddress: '0x3333333333333333333333333333333333333333',
    })

    await expect(
      getUnsetPrimaryTargets({ owner: OWNER, name: 'alice.eth' }),
    ).resolves.toEqual({ clearDefault: false, clearReverse: false })
  })

  it('matches names via normalize', async () => {
    getName
      .mockResolvedValueOnce(nameResult('Alice.ETH'))
      .mockResolvedValueOnce(nameResult('ALICE.eth'))

    await expect(
      getUnsetPrimaryTargets({ owner: OWNER, name: 'alice.eth' }),
    ).resolves.toEqual({ clearDefault: true, clearReverse: true })
    expect(normalize).toHaveBeenCalled()
  })
})

describe('unsetPrimaryName', () => {
  it('clears DefaultReverseRegistrar when target is default', async () => {
    setReverseResolution.mockResolvedValueOnce({
      txId: 'tx-default',
      hash: '0x1',
    })

    const result = await unsetPrimaryName({ ...baseParams, target: 'default' })

    expect(setReverseResolution).toHaveBeenCalledTimes(1)
    expect(setReverseResolution).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'transfer-alice.eth-unset-default-reverse',
        request: expect.objectContaining({
          address: DEFAULT_REVERSE_REGISTRAR_ADDRESS,
          functionName: 'setName',
          args: [''],
        }),
      }),
    )
    expect(result).toEqual({ txId: 'tx-default', hash: '0x1' })
  })

  it('clears ReverseRegistrar when target is addr', async () => {
    setReverseResolution.mockResolvedValueOnce({
      txId: 'tx-reverse',
      hash: '0x2',
    })

    const result = await unsetPrimaryName({
      ...baseParams,
      target: 'addr',
      id: 'transfer-alice.eth-unset-addr-reverse',
    })

    expect(setReverseResolution).toHaveBeenCalledTimes(1)
    expect(setReverseResolution).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'transfer-alice.eth-unset-addr-reverse',
        request: expect.objectContaining({
          address: ENS_SEPOLIA_CONTRACTS.ReverseRegistrar,
          functionName: 'setName',
          args: [''],
        }),
      }),
    )
    expect(result).toEqual({ txId: 'tx-reverse', hash: '0x2' })
  })

  it('throws when the connected wallet is not the owner', async () => {
    const otherWallet = {
      account: {
        address: '0x2222222222222222222222222222222222222222' as Address,
      },
    } as WalletClient

    await expect(
      unsetPrimaryName({
        ...baseParams,
        target: 'default',
        walletClient: otherWallet,
      }),
    ).rejects.toThrow(
      'Connected wallet must match the owner whose primary name is being cleared',
    )
    expect(setReverseResolution).not.toHaveBeenCalled()
  })
})
