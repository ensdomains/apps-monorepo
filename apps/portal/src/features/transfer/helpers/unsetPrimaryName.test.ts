import type { Address, PublicClient, WalletClient } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { setReverseResolution } = vi.hoisted(() => ({
  setReverseResolution: vi.fn(),
}))

vi.mock('@ens-apps/transaction-manager', () => ({
  ENS_SEPOLIA_CONTRACTS: {
    DefaultReverseRegistrar:
      '0xeb8269fb39290f31c4c29cec548807ca2133abb4' as Address,
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
          address: ENS_SEPOLIA_CONTRACTS.DefaultReverseRegistrar,
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
})
