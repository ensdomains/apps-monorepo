import { getDestinationContracts } from '@ens-apps/smart-account'
import {
  ensL1Contracts,
  extendChainWithEns,
  supportedL1Chains,
} from '@ensdomains/ensjs/chain'
import {
  ethRegistrarCommitmentsSnippet,
  ethRegistrarRegisterSnippet,
} from '@ensdomains/ensjs-abi/v2/ethRegistrar'
import {
  permissionedRegistryGetResolverSnippet,
  permissionedRegistryGetSubregistrySnippet,
} from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import type { Address, Hash, Hex, PublicClient, WalletClient } from 'viem'
import {
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeFunctionResult,
  getChainContractAddress,
  isAddressEqual,
  labelhash,
  multicall3Abi,
  parseAbi,
  zeroAddress,
} from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'
import { SignerAddressMismatchError } from '../../errors/transaction.errors'
import type {
  EOASigner,
  RhinestoneSigner,
  Signer,
} from '../../types/signer.types'
import { type Call, getPrimaryCall } from '../../types/transaction.types'
import {
  createTransactionRequest,
  getSignerAddress,
  resolvePaymentTokenAddress,
  submitRegistrationActor,
  verifyRegistrationActor,
} from './registration.actors'

const mocks = vi.hoisted(() => ({
  startTransaction: vi.fn(
    (_intent: { readonly request: { readonly data: Hex } }) => 'tx-register',
  ),
}))

vi.mock('../../providers/transactionManager', () => ({
  transactionManager: { startTransaction: mocks.startTransaction },
}))

// The oracle's token whitelist is a chain read, outside the token choice.
vi.mock('../../contracts/paymentToken', () => ({
  assertPaymentTokenSupported: vi.fn(async () => {}),
}))

const FROM = '0xF00000000000000000000000000000000000000F' as Address
const eoaSigner = { type: 'eoa' } as unknown as Signer
const rhinestoneSigner = { type: 'rhinestone' } as unknown as Signer

const permitCall: Call = {
  to: '0x1111111111111111111111111111111111111111' as Address,
  data: '0xd505accf' as Hex,
  value: 0n,
}
const registerCall: Call = {
  to: '0x2222222222222222222222222222222222222222' as Address,
  data: '0x12345678' as Hex,
  value: 7n,
}

const HCA = '0x1111111111111111111111111111111111111111' as Address
const HCA_OTHER = '0x2222222222222222222222222222222222222222' as Address

function rhinestoneSignerWith(opts: {
  liveAddress: Address
  configAddress?: Address
}): RhinestoneSigner {
  return {
    type: 'rhinestone',
    account: {
      getAddress: () => opts.liveAddress,
    } as unknown as RhinestoneSigner['account'],
    config: {
      // biome-ignore lint/suspicious/noExplicitAny: minimal chain stub for the test
      chain: {} as any,
      rhinestoneApiKey: 'test-key',
      ...(opts.configAddress ? { accountAddress: opts.configAddress } : {}),
    },
  }
}

describe('getSignerAddress', () => {
  it('returns the connected EOA account address', () => {
    const signer = {
      type: 'eoa',
      walletClient: { account: { address: FROM } } as unknown as WalletClient,
    } as Signer
    expect(getSignerAddress(signer)).toBe(FROM)
  })

  it('throws when an EOA wallet has no connected account', () => {
    const signer = {
      type: 'eoa',
      walletClient: { account: undefined } as unknown as WalletClient,
    } as Signer
    expect(() => getSignerAddress(signer)).toThrow(/no account connected/i)
  })

  it('returns the verified rhinestone smart-account address', () => {
    const signer = rhinestoneSignerWith({
      liveAddress: HCA,
      configAddress: HCA,
    })
    expect(getSignerAddress(signer)).toBe(HCA)
  })

  it('throws SignerAddressMismatchError when the cached HCA address diverges', () => {
    const signer = rhinestoneSignerWith({
      liveAddress: HCA_OTHER,
      configAddress: HCA,
    })
    expect(() => getSignerAddress(signer)).toThrow(SignerAddressMismatchError)
  })
})

describe('createTransactionRequest', () => {
  it('derives EOA top-level fields from the single call', () => {
    const request = createTransactionRequest({
      signer: eoaSigner,
      from: FROM,
      chainId: 11155111,
      calls: [registerCall],
    })

    expect(request.type).toBe('eoa')
    if (request.type !== 'eoa') throw new Error('expected eoa request')
    // Top-level call data is exactly the (only) call — no divergent copy.
    expect(request.to).toBe(registerCall.to)
    expect(request.data).toBe(registerCall.data)
    expect(request.value).toBe(registerCall.value)
  })

  it('stores calls verbatim for a rhinestone intent with no top-level copy', () => {
    const calls = [permitCall, registerCall]
    const request = createTransactionRequest({
      signer: rhinestoneSigner,
      from: FROM,
      chainId: 11155111,
      calls,
    })

    expect(request.type).toBe('rhinestone-intent')
    if (request.type !== 'rhinestone-intent') {
      throw new Error('expected rhinestone-intent request')
    }
    // calls is the single source of truth.
    expect(request.rhinestoneParams.calls).toEqual(calls)
    // There is no top-level call data that could diverge from calls.
    expect('to' in request).toBe(false)
    expect('data' in request).toBe(false)
    expect('value' in request).toBe(false)
    // getPrimaryCall resolves the representative call from calls[0].
    expect(getPrimaryCall(request)).toEqual({
      to: permitCall.to,
      data: permitCall.data,
      value: permitCall.value,
    })
  })

  it('rejects a multi-call batch for an EOA signer', () => {
    expect(() =>
      createTransactionRequest({
        signer: eoaSigner,
        from: FROM,
        chainId: 11155111,
        calls: [permitCall, registerCall],
      }),
    ).toThrow(/single call/i)
  })

  it('rejects an empty calls array', () => {
    expect(() =>
      createTransactionRequest({
        signer: rhinestoneSigner,
        from: FROM,
        chainId: 11155111,
        calls: [],
      }),
    ).toThrow(/at least one call/i)
  })
})

describe('resolvePaymentTokenAddress', () => {
  const sepoliaChain = extendChainWithEns(sepolia)
  const mainnetChain = extendChainWithEns(mainnet)
  const mockUsdc = getChainContractAddress({
    chain: sepoliaChain,
    contract: 'usdc',
  })

  it('pays in the token the caller showed', () => {
    expect(
      resolvePaymentTokenAddress(
        { selectedToken: 'USDC', paymentTokenAddress: mockUsdc },
        sepoliaChain,
      ),
    ).toBe(mockUsdc)
  })

  it("falls back to the manifest's USDC when the caller names none", () => {
    expect(
      resolvePaymentTokenAddress({ selectedToken: 'USDC' }, sepoliaChain),
    ).toBe(getDestinationContracts(sepolia.id).usdc)
  })

  // Why the explorer's explicit token cannot change a mainnet registration:
  // the fallback there is ensjs' USDC, the token the explorer shows.
  it('resolves to the same USDC either way on mainnet', () => {
    const shown = ensL1Contracts[supportedL1Chains.mainnet].usdc.address
    expect(
      resolvePaymentTokenAddress({ selectedToken: 'USDC' }, mainnetChain),
    ).toBe(shown)
  })
})

describe('submitRegistrationActor', () => {
  it('registers paying in the token the caller showed', async () => {
    const owner = '0x1111111111111111111111111111111111111111' as Address
    const chain = extendChainWithEns(sepolia)
    const mockUsdc = getChainContractAddress({ chain, contract: 'usdc' })

    await submitRegistrationActor({
      name: 'alice',
      commitment: {
        commitment: `0x${'44'.repeat(32)}` as Hash,
        secret: `0x${'55'.repeat(32)}` as Hex,
      },
      signer: {
        type: 'eoa',
        walletClient: { account: { address: owner } } as WalletClient,
      } satisfies EOASigner,
      duration: 31_536_000n,
      selectedToken: 'USDC',
      paymentTokenAddress: mockUsdc,
      owner,
      publicClient: { chain } as PublicClient,
      resolverAddress: owner,
    })

    const [intent] = mocks.startTransaction.mock.calls[0] ?? []
    const { args } = decodeFunctionData({
      abi: ethRegistrarRegisterSnippet,
      data: intent?.request.data ?? '0x',
    })
    expect(args?.[6]).toBe(mockUsdc)
  })
})

describe('verifyRegistrationActor', () => {
  const chain = extendChainWithEns(sepolia)
  const registrar = getChainContractAddress({
    chain,
    contract: 'ensEthRegistrar',
  })
  const registry = getChainContractAddress({ chain, contract: 'ensRegistry' })
  const owner = '0x1111111111111111111111111111111111111111' as Address
  const resolverAddress =
    '0x3333333333333333333333333333333333333333' as Address
  const registryAbi = [
    ...permissionedRegistryGetResolverSnippet,
    ...permissionedRegistryGetSubregistrySnippet,
    ...parseAbi(['function getOwner(uint256 anyId) view returns (address)']),
  ]

  // The deployed registry and registrar: a call they don't define reverts, as on chain.
  const answer = (to: Address, data: Hex): Hex => {
    if (isAddressEqual(to, registrar)) {
      decodeFunctionData({ abi: ethRegistrarCommitmentsSnippet, data })
      return encodeFunctionResult({
        abi: ethRegistrarCommitmentsSnippet,
        functionName: 'commitmentAt',
        result: 0n,
      })
    }
    if (!isAddressEqual(to, registry)) {
      throw new Error(`execution reverted: no contract at ${to}`)
    }
    const { functionName, args } = decodeFunctionData({
      abi: registryAbi,
      data,
    })
    const results = {
      getResolver: resolverAddress,
      getSubregistry: zeroAddress,
      getOwner: args[0] === BigInt(labelhash('myname')) ? owner : zeroAddress,
    }
    return encodeFunctionResult({
      abi: registryAbi,
      functionName,
      result: results[functionName],
    })
  }

  const publicClient = createPublicClient({
    chain,
    transport: custom(
      {
        request: async ({
          method,
          params: [{ to, data }],
        }: {
          method: string
          params: readonly [{ to: Address; data: Hex }]
        }) => {
          if (method !== 'eth_call') throw new Error(`Unexpected ${method}`)
          if (!isAddressEqual(to, chain.contracts.multicall3.address)) {
            return answer(to, data)
          }
          const {
            args: [calls],
          } = decodeFunctionData({ abi: multicall3Abi, data })
          return encodeFunctionResult({
            abi: multicall3Abi,
            functionName: 'aggregate3',
            result: calls.map(({ target, callData }) => ({
              success: true,
              returnData: answer(target, callData),
            })),
          })
        },
      },
      { retryCount: 0 },
    ),
  })

  it('confirms a registration our reveal made on the deployed registry', async () => {
    const result = await verifyRegistrationActor({
      name: 'myname.eth',
      owner,
      resolverAddress,
      publicClient,
      commitment: `0x${'cc'.repeat(32)}`,
      graceWindowMs: 0,
    })

    expect(result._unsafeUnwrap()).toEqual({
      verified: true,
      registeredToOther: false,
      isUnregistered: false,
    })
  })
})
