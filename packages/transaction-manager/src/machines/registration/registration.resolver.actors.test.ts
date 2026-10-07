import {
  computeResolverAddress,
  computeResolverSalt,
} from '@ens-apps/smart-account'
import { ensL1Contracts, extendChainWithEns } from '@ensdomains/ensjs/chain'
import type { Address, PublicClient, WalletClient } from 'viem'
import { decodeFunctionData } from 'viem'
import { sepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VERIFIABLE_FACTORY_ABI } from '../../contracts/abis/VerifiableFactory.abi'
import type { EOASigner } from '../../types/signer.types'
import type { EoaTransactionRequest } from '../../types/transaction.types'
import {
  checkResolverDeploymentActor,
  computeDedicatedResolverAddress,
  submitResolverDeploymentActor,
} from './registration.actors'

const mocks = vi.hoisted(() => ({
  startTransaction: vi.fn(() => 'tx-1'),
}))

vi.mock('../../providers/transactionManager', () => ({
  transactionManager: {
    startTransaction: mocks.startTransaction,
  },
}))

const WALLET = '0x1111111111111111111111111111111111111111' as Address
const OTHER_WALLET = '0x2222222222222222222222222222222222222222' as Address
const CONTRACTS = ensL1Contracts[sepolia.id]
const signer = {
  type: 'eoa',
  walletClient: { account: { address: WALLET } } as WalletClient,
} satisfies EOASigner

const publicClientWithCode = (code: string | undefined) => {
  const getCode = vi.fn(async () => code)
  return {
    getCode,
    publicClient: {
      chain: extendChainWithEns(sepolia),
      getCode,
    } as unknown as PublicClient,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('computeDedicatedResolverAddress', () => {
  it("lands on the same address as manager's resolver for that account", () => {
    expect(
      computeDedicatedResolverAddress({
        chainId: sepolia.id,
        deployer: WALLET,
        owner: WALLET,
      }),
    ).toBe(computeResolverAddress({ chainId: sepolia.id, hca: WALLET }))
  })

  it('gives each wallet its own resolver', () => {
    expect(
      computeDedicatedResolverAddress({
        chainId: sepolia.id,
        deployer: WALLET,
        owner: WALLET,
      }),
    ).not.toBe(
      computeDedicatedResolverAddress({
        chainId: sepolia.id,
        deployer: OTHER_WALLET,
        owner: OTHER_WALLET,
      }),
    )
  })
})

describe('checkResolverDeploymentActor', () => {
  const expected = computeDedicatedResolverAddress({
    chainId: sepolia.id,
    deployer: WALLET,
    owner: WALLET,
  })

  it('reports the resolver as deployed when it has code', async () => {
    const { getCode, publicClient } = publicClientWithCode('0x6080')

    const result = await checkResolverDeploymentActor({
      owner: WALLET,
      signer,
      publicClient,
    })

    expect(result._unsafeUnwrap()).toEqual({
      resolverAddress: expected,
      deployed: true,
    })
    expect(getCode).toHaveBeenCalledWith({ address: expected })
  })

  it('reports the resolver as missing when it has no code', async () => {
    const { publicClient } = publicClientWithCode(undefined)

    const result = await checkResolverDeploymentActor({
      owner: WALLET,
      signer,
      publicClient,
    })

    expect(result._unsafeUnwrap()).toEqual({
      resolverAddress: expected,
      deployed: false,
    })
  })

  it('fails when the code read fails', async () => {
    const publicClient = {
      chain: extendChainWithEns(sepolia),
      getCode: vi.fn(async () => {
        throw new Error('rpc down')
      }),
    } as unknown as PublicClient

    const result = await checkResolverDeploymentActor({
      owner: WALLET,
      signer,
      publicClient,
    })

    expect(result._unsafeUnwrapErr().message).toMatch(/rpc down/)
  })
})

describe('submitResolverDeploymentActor', () => {
  it("deploys with the owner's fixed salt", async () => {
    const { publicClient } = publicClientWithCode(undefined)

    const result = await submitResolverDeploymentActor({
      name: 'leon',
      owner: WALLET,
      signer,
      publicClient,
    })

    const salt = computeResolverSalt(WALLET)
    expect(result._unsafeUnwrap()).toEqual({ txId: 'tx-1', salt })

    const [intent] = mocks.startTransaction.mock.calls.at(-1) as unknown as [
      { request: EoaTransactionRequest },
    ]
    expect(intent.request.to).toBe(CONTRACTS.ensVerifiableFactory.address)
    const { functionName, args } = decodeFunctionData({
      abi: VERIFIABLE_FACTORY_ABI,
      data: intent.request.data,
    })
    expect(functionName).toBe('deployProxy')
    expect(args?.[0]).toBe(CONTRACTS.ensPermissionedResolverImpl.address)
    expect(args?.[1]).toBe(salt)
  })
})
