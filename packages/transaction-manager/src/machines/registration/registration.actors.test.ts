import { getDestinationContracts } from '@ens-apps/smart-account'
import {
  ensL1Contracts,
  extendChainWithEns,
  supportedL1Chains,
} from '@ensdomains/ensjs/chain'
import { ethRegistrarRegisterSnippet } from '@ensdomains/ensjs-abi/v2/ethRegistrar'
import type { Address, Hash, Hex, PublicClient, WalletClient } from 'viem'
import { decodeFunctionData, getChainContractAddress } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  submitRegistrationActor,
} from './registration.actors'

const mocks = vi.hoisted(() => ({
  startTransaction: vi.fn(
    (_intent: { readonly request: { readonly data: Hex } }) => 'tx-register',
  ),
}))

vi.mock('../../providers/transactionManager', () => ({
  transactionManager: { startTransaction: mocks.startTransaction },
}))

// The registrar's price oracle is a chain read; the token rule under test is
// decided before it.
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

describe('submitRegistrationActor payment token', () => {
  const OWNER = '0x1111111111111111111111111111111111111111' as Address
  const chain = extendChainWithEns(sepolia)
  const mockUsdc = getChainContractAddress({ chain, contract: 'usdc' })
  const signer = {
    type: 'eoa',
    walletClient: { account: { address: OWNER } } as WalletClient,
  } satisfies EOASigner

  const registerToken = async (paymentTokenAddress?: Address) => {
    await submitRegistrationActor({
      name: 'alice',
      commitment: {
        commitment: `0x${'44'.repeat(32)}` as Hash,
        secret: `0x${'55'.repeat(32)}` as Hex,
      },
      signer,
      duration: 31_536_000n,
      selectedToken: 'USDC',
      paymentTokenAddress,
      owner: OWNER,
      publicClient: { chain } as PublicClient,
      resolverAddress: OWNER,
    })
    const [intent] = mocks.startTransaction.mock.calls[0] ?? []
    if (!intent) throw new Error('register was never submitted')
    const { args } = decodeFunctionData({
      abi: ethRegistrarRegisterSnippet,
      data: intent.request.data,
    })
    return args?.[6]
  }

  beforeEach(() => {
    mocks.startTransaction.mockClear()
  })

  it('pays in the token the caller showed', async () => {
    expect(await registerToken(mockUsdc)).toBe(mockUsdc)
  })

  it("pays in the manifest's USDC when the caller names none", async () => {
    expect(await registerToken()).toBe(getDestinationContracts(sepolia.id).usdc)
  })

  // Why the explorer's explicit token cannot change a mainnet registration:
  // there the manifest's USDC is ensjs' USDC, the token the explorer shows.
  it('resolves to the same USDC either way on mainnet', () => {
    expect(getDestinationContracts(mainnet.id).usdc).toBe(
      ensL1Contracts[supportedL1Chains.mainnet].usdc.address,
    )
  })
})
