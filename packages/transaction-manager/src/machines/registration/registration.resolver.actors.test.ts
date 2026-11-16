import {
  computeResolverAddress,
  computeResolverSalt,
} from '@ens-apps/smart-account'
import { ensL1Contracts, extendChainWithEns } from '@ensdomains/ensjs/chain'
import { publicResolverMultiAddrSnippet } from '@ensdomains/ensjs-abi/v1/publicResolver'
import {
  permissionedResolverResolveSnippet,
  permissionedResolverSetAddressSnippet,
} from '@ensdomains/ensjs-abi/v2/permissionedResolver'
import type { Address, Hex, PublicClient, WalletClient } from 'viem'
import {
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeFunctionResult,
} from 'viem'
import { sepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VERIFIABLE_FACTORY_ABI } from '../../contracts/abis/VerifiableFactory.abi'
import type { EOASigner } from '../../types/signer.types'
import type { EoaTransactionRequest } from '../../types/transaction.types'
import {
  checkResolverDeploymentActor,
  computeDedicatedResolverAddress,
  readEthAddressActor,
  submitEthAddressActor,
  submitResolverDeploymentActor,
} from './registration.actors'

const mocks = vi.hoisted(() => ({
  startTransaction: vi.fn(
    (
      _intent: { readonly request: EoaTransactionRequest },
      _signer: unknown,
      _options: { readonly id?: string },
    ) => 'tx-1',
  ),
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

describe('submitEthAddressActor', () => {
  it("points the name at its owner on the wallet's resolver", async () => {
    const { publicClient } = publicClientWithCode(undefined)
    const resolverAddress = computeDedicatedResolverAddress({
      chainId: sepolia.id,
      deployer: WALLET,
      owner: WALLET,
    })

    const result = await submitEthAddressActor({
      name: 'leon.eth',
      owner: WALLET,
      resolverAddress,
      signer,
      publicClient,
      id: 'tx-eth',
    })

    expect(result._unsafeUnwrap()).toBe('tx-1')
    const lastCall = mocks.startTransaction.mock.lastCall
    expect(lastCall?.[2].id).toBe('tx-eth')
    expect(lastCall?.[0].request.to).toBe(resolverAddress)
    const { functionName, args } = decodeFunctionData({
      abi: permissionedResolverSetAddressSnippet,
      data: lastCall?.[0].request.data ?? '0x',
    })
    expect(functionName).toBe('setAddress')
    // DNS wire format of leon.eth, ETH's coin type, the owner.
    expect(args).toEqual(['0x046c656f6e0365746800', 60n, WALLET])
  })
})

describe('readEthAddressActor', () => {
  const RESOLVER = '0xcccc000000000000000000000000000000000003' as Address

  /** A client whose resolver answers `addr(60)` with `stored`, recording each call. */
  const resolverHolding = (stored: Hex) => {
    const calls: { to: Address; data: Hex }[] = []
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: custom({
        request: async ({ method, params }) => {
          if (method !== 'eth_call') throw new Error(`unexpected ${method}`)
          const [call] = params as readonly [{ to: Address; data: Hex }]
          calls.push(call)
          return encodeFunctionResult({
            abi: permissionedResolverResolveSnippet,
            functionName: 'resolve',
            result: encodeFunctionResult({
              abi: publicResolverMultiAddrSnippet,
              functionName: 'addr',
              result: stored,
            }),
          })
        },
      }),
    })
    return { calls, publicClient }
  }

  it.each([
    ['points at the owner', WALLET, true],
    ['points elsewhere', OTHER_WALLET, false],
    ['is unset', '0x', false],
  ] as const)('reads whether the record %s', async (_, stored, isSet) => {
    const { calls, publicClient } = resolverHolding(stored)

    const result = await readEthAddressActor({
      name: 'leon.eth',
      owner: WALLET,
      resolverAddress: RESOLVER,
      publicClient,
    })

    expect(result._unsafeUnwrap()).toBe(isSet)
    const [call] = calls
    expect(call?.to.toLowerCase()).toBe(RESOLVER)
    const { args } = decodeFunctionData({
      abi: permissionedResolverResolveSnippet,
      data: call?.data ?? '0x',
    })
    // Through ENSIP-10 `resolve`, for leon.eth's DNS wire format.
    expect(args?.[0]).toBe('0x046c656f6e0365746800')
  })
})
