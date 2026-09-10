import type { Address, PublicClient, WalletClient } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { setForwardResolution, createSetForwardResolutionRequest } = vi.hoisted(
  () => ({
    setForwardResolution: vi.fn(),
    createSetForwardResolutionRequest: vi.fn(() => ({
      address: '0x2222222222222222222222222222222222222222',
      abi: [],
      functionName: 'setAddr',
      args: [],
    })),
  }),
)

vi.mock('@ens-apps/l2-primary/utils', () => ({
  createSetForwardResolutionRequest,
}))

vi.mock('@/features/reverse-resolution/helpers/setForwardResolution', () => ({
  setForwardResolution,
}))

import type { Signer } from '@ens-apps/transaction-manager'
import { MAINNET_COIN_TYPE } from '@/lib/coinType'
import { setEthAddress } from './setEthAddress'

const RECIPIENT = '0x3333333333333333333333333333333333333333' as Address
const OWN_RESOLVER = '0x2222222222222222222222222222222222222222' as Address

const walletClient = {} as WalletClient
const publicClient = {} as PublicClient
const signer: Signer = { type: 'eoa', walletClient: {} as WalletClient }

afterEach(() => {
  vi.clearAllMocks()
})

describe('setEthAddress', () => {
  it('submits the ETH forward record for the recipient on the resolver it was given', async () => {
    setForwardResolution.mockResolvedValueOnce({ txId: 'tx-1', hash: '0x1' })

    const result = await setEthAddress({
      name: 'alice.eth',
      resolverAddress: OWN_RESOLVER,
      recipient: RECIPIENT,
      walletClient,
      publicClient,
      signer,
      chainId: 11155111,
      id: 'transfer-alice.eth-set-eth-addr',
    })

    expect(createSetForwardResolutionRequest).toHaveBeenCalledWith({
      name: 'alice.eth',
      coinType: MAINNET_COIN_TYPE,
      resolverAddress: OWN_RESOLVER,
      targetAddress: RECIPIENT,
    })
    expect(setForwardResolution).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'transfer-alice.eth-set-eth-addr' }),
    )
    expect(result).toEqual({ txId: 'tx-1', hash: '0x1' })
  })

  // The regression this file's rewrite guards: the helper used to resolve the
  // resolver itself via the UniversalResolver, which for a subname hands back
  // an *ancestor's* resolver. Writing `sub.parent.eth`'s addr(60) there targets
  // a contract the sender doesn't own. It must use only what the caller passes.
  it('never falls back to the name’s inherited resolver for a subname', async () => {
    setForwardResolution.mockResolvedValueOnce({ txId: 'tx-2', hash: '0x2' })

    await setEthAddress({
      name: 'sub.alice.eth',
      resolverAddress: OWN_RESOLVER,
      recipient: RECIPIENT,
      walletClient,
      publicClient,
      signer,
      chainId: 11155111,
      id: 'transfer-sub.alice.eth-set-eth-addr',
    })

    expect(createSetForwardResolutionRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'sub.alice.eth',
        resolverAddress: OWN_RESOLVER,
      }),
    )
  })
})
