import { permissionedRegistrySetResolverSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import {
  type Address,
  encodeFunctionData,
  labelhash,
  type PublicClient,
} from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@ens-apps/transaction-manager', () => ({
  ENS_SEPOLIA_CONTRACTS: {
    ETHRegistry: '0x0000000000000000000000000000000000009999',
  },
  getSmartAccountAddress: (signer: { config: { accountAddress: Address } }) =>
    signer.config.accountAddress,
  transactionManager: { startTransaction: vi.fn(() => 'tx-mock') },
}))

import { type Signer, transactionManager } from '@ens-apps/transaction-manager'
import { changeResolver } from './changeResolver'

const ETH_REGISTRY = '0x0000000000000000000000000000000000009999' as Address
const ACCOUNT = '0x1111111111111111111111111111111111111111' as Address
const SMART_ACCOUNT = '0x2222222222222222222222222222222222222222' as Address
const NEW_RESOLVER = '0x3333333333333333333333333333333333333333' as Address
const CHAIN_ID = 11155111
const publicClient = {} as PublicClient

const start = vi.mocked(transactionManager.startTransaction)

const expectedSetResolverData = (name: string) =>
  encodeFunctionData({
    abi: permissionedRegistrySetResolverSnippet,
    functionName: 'setResolver',
    args: [BigInt(labelhash(name.replace('.eth', ''))), NEW_RESOLVER],
  })

afterEach(() => {
  vi.clearAllMocks()
})

describe('changeResolver', () => {
  it('submits an EOA setResolver transaction tagged for history', () => {
    const signer: Signer = { type: 'eoa', walletClient: {} as never }

    const txId = changeResolver({
      name: 'leon.eth',
      newResolver: NEW_RESOLVER,
      signer,
      accountAddress: ACCOUNT,
      publicClient,
      chainId: CHAIN_ID,
    })

    expect(txId).toBe('tx-mock')
    expect(start).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledWith(
      {
        type: 'custom',
        request: {
          type: 'eoa',
          from: ACCOUNT,
          to: ETH_REGISTRY,
          data: expectedSetResolverData('leon.eth'),
          value: 0n,
          chainId: CHAIN_ID,
        },
      },
      signer,
      {
        description: 'Update resolver for leon.eth',
        publicClient,
        chainId: CHAIN_ID,
        operation: 'set-resolver',
        name: 'leon.eth',
      },
    )
  })

  it.each([
    'leon',
    'leon.eth',
  ])('describes the transaction with exactly one .eth suffix for %s', (name) => {
    const signer: Signer = { type: 'eoa', walletClient: {} as never }

    changeResolver({
      name,
      newResolver: NEW_RESOLVER,
      signer,
      accountAddress: ACCOUNT,
      publicClient,
      chainId: CHAIN_ID,
    })

    const options = start.mock.calls[0]?.[2]
    expect(options?.description).toBe('Update resolver for leon.eth')
  })

  it('submits a non-session rhinestone intent for smart accounts', () => {
    const signer: Signer = {
      type: 'rhinestone',
      account: {} as never,
      config: { accountAddress: SMART_ACCOUNT, rhinestoneApiKey: 'k' },
    }

    changeResolver({
      name: 'leon',
      newResolver: NEW_RESOLVER,
      signer,
      accountAddress: ACCOUNT,
      publicClient,
      chainId: CHAIN_ID,
    })

    const [intentOrRequest] = start.mock.calls[0] ?? []
    expect(intentOrRequest).toEqual({
      type: 'custom',
      request: {
        type: 'rhinestone-intent',
        from: SMART_ACCOUNT,
        chainId: CHAIN_ID,
        rhinestoneParams: {
          calls: [
            {
              to: ETH_REGISTRY,
              data: expectedSetResolverData('leon'),
              value: 0n,
            },
          ],
          feeAsset: 'USDC',
        },
      },
    })
  })
})
