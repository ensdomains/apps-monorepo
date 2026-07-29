import type { Address, PublicClient, WalletClient } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { setReverseResolution } = vi.hoisted(() => ({
  setReverseResolution: vi.fn(),
}))

vi.mock('@ens-apps/transaction-manager', () => ({
  ENS_SEPOLIA_CONTRACTS: {
    ReverseRegistrar: '0xA0a1AbcDAe1a2a4A2EF8e9113Ff0e02DD81DC0C6' as Address,
  },
}))

vi.mock('@/features/reverse-resolution/helpers/setReverseResolution', () => ({
  setReverseResolution,
}))

import {
  ENS_SEPOLIA_CONTRACTS,
  type Signer,
} from '@ens-apps/transaction-manager'
import { DEFAULT_REVERSE_REGISTRAR_ADDRESS } from '@/features/reverse-resolution/config'
import { unsetPrimaryName } from './unsetPrimaryName'

const OWNER = '0x1111111111111111111111111111111111111111' as Address
const walletClient = { account: { address: OWNER } } as WalletClient
const publicClient = {} as PublicClient
const signer: Signer = { type: 'eoa', walletClient: {} as WalletClient }

afterEach(() => {
  vi.clearAllMocks()
})

describe('unsetPrimaryName', () => {
  it('clears DefaultReverseRegistrar then ReverseRegistrar with setName("")', async () => {
    setReverseResolution
      .mockResolvedValueOnce({ txId: 'tx-default', hash: '0x1' })
      .mockResolvedValueOnce({ txId: 'tx-reverse', hash: '0x2' })

    const result = await unsetPrimaryName({
      name: 'alice.eth',
      owner: OWNER,
      walletClient,
      publicClient,
      signer,
      chainId: 11155111,
      id: 'transfer-alice.eth-unset-primary',
    })

    expect(setReverseResolution.mock.calls.map((call) => call[0])).toEqual([
      expect.objectContaining({
        id: 'transfer-alice.eth-unset-primary-default',
        request: expect.objectContaining({
          address: DEFAULT_REVERSE_REGISTRAR_ADDRESS,
          functionName: 'setName',
          args: [''],
        }),
      }),
      expect.objectContaining({
        id: 'transfer-alice.eth-unset-primary',
        request: expect.objectContaining({
          address: ENS_SEPOLIA_CONTRACTS.ReverseRegistrar,
          functionName: 'setName',
          args: [''],
        }),
      }),
    ])
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
        name: 'alice.eth',
        owner: OWNER,
        walletClient: otherWallet,
        publicClient,
        signer,
        chainId: 11155111,
        id: 'transfer-alice.eth-unset-primary',
      }),
    ).rejects.toThrow(
      'Connected wallet must match the owner whose primary name is being cleared',
    )
    expect(setReverseResolution).not.toHaveBeenCalled()
  })
})
