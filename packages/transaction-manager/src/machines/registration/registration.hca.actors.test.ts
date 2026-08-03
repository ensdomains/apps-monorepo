// biome-ignore-all lint/suspicious/noExplicitAny: decoded ABI args need flexible typing in tests

import {
  computeResolverAddress,
  getDestinationContracts,
} from '@ens-apps/smart-account'
import type { Address, Hex, PublicClient } from 'viem'
import { decodeFunctionData, parseAbi } from 'viem'
import { sepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EOASigner, Signer } from '../../types/signer.types'
import type { RhinestoneTransactionRequest } from '../../types/transaction.types'
import type { PermitSignature } from './registration.actors'
import {
  readUsdcSpend,
  signFundingPermitActor,
  submitFundingAndCommitActor,
  verifyHcaRegistrationActor,
} from './registration.hca.actors'

const startTransaction = vi.fn(() => 'tx-1')
vi.mock('../../providers/transactionManager', () => ({
  transactionManager: {
    startTransaction: (...args: unknown[]) =>
      (startTransaction as unknown as (...a: unknown[]) => string)(...args),
  },
}))

const readContract = vi.fn()
const signTypedData = vi.fn()
const getEip712Domain = vi.fn()
vi.mock('viem/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/actions')>()),
  readContract: (...args: unknown[]) => readContract(...args),
  signTypedData: (...args: unknown[]) => signTypedData(...args),
  getEip712Domain: (...args: unknown[]) => getEip712Domain(...args),
}))

const C = getDestinationContracts(sepolia.id)

const WALLET = '0x1111111111111111111111111111111111111111' as Address
const HCA = '0xaaaa000000000000000000000000000000000001' as Address
const SESSION_KEY = '0x9999999999999999999999999999999999999999' as Address
const COMMITMENT = `0x${'cc'.repeat(32)}` as Hex

const erc20Abi = parseAbi([
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
])

const permit: PermitSignature = {
  owner: WALLET,
  spender: HCA,
  value: 15_000_000n,
  deadline: 1_800_000_000n,
  v: 27,
  r: `0x${'11'.repeat(32)}` as Hex,
  s: `0x${'22'.repeat(32)}` as Hex,
}

const sessionEnable = {
  enableData: { some: 'enable-data' } as never,
  permissionId: `0x${'ab'.repeat(32)}` as Hex,
  sessionKey: SESSION_KEY,
  validUntil: 1_800_000_000n,
}

/** `makeCommitment` is the only read `submitFundingAndCommitActor` makes. */
const commitClient = {
  chain: sepolia,
  readContract: vi.fn().mockResolvedValue(COMMITMENT),
} as unknown as PublicClient

const rhinestoneSigner = { type: 'rhinestone' } as unknown as Signer

const submittedRequest = (): RhinestoneTransactionRequest => {
  const [intent] = startTransaction.mock.calls[0] as unknown as [
    { request: RhinestoneTransactionRequest },
  ]
  return intent.request
}

beforeEach(() => {
  vi.clearAllMocks()
  // `mockClear` keeps queued `...Once` values, so reset the contract reads
  // explicitly — every test queues its own sequence.
  readContract.mockReset()
  getEip712Domain.mockReset()
})

describe('submitFundingAndCommitActor', () => {
  const input = {
    name: 'myname.eth',
    wallet: WALLET,
    hca: HCA,
    duration: 31_536_000n,
    signer: rhinestoneSigner,
    publicClient: commitClient,
  }

  it('bundles funding, session enablement and the commit into one user-paid request', async () => {
    const result = await submitFundingAndCommitActor({
      ...input,
      permit,
      sessionEnable,
    })

    expect(result.isOk()).toBe(true)
    const request = submittedRequest()
    const calls = request.rhinestoneParams.calls

    // permit → transferFrom → enableSessionWithRefund → commit, in this order.
    expect(calls.map((c) => c.to.toLowerCase())).toEqual([
      C.usdc.toLowerCase(),
      C.usdc.toLowerCase(),
      C.hcaOwnerAndSessionValidator.toLowerCase(),
      C.ethRegistrar.toLowerCase(),
    ])

    // The permit pulls exactly the permitted budget into the HCA.
    const transfer = decodeFunctionData({ abi: erc20Abi, data: calls[1].data })
    expect(transfer.functionName).toBe('transferFrom')
    expect((transfer.args as any)[0].toLowerCase()).toBe(WALLET.toLowerCase())
    expect((transfer.args as any)[1].toLowerCase()).toBe(HCA.toLowerCase())
    expect((transfer.args as any)[2]).toBe(permit.value)

    // Paid by the HCA in USDC — no sponsorship on this route.
    expect(request.from.toLowerCase()).toBe(HCA.toLowerCase())
    expect(request.rhinestoneParams.sponsored).toEqual({
      gas: false,
      bridging: false,
      swaps: false,
    })
    expect(request.rhinestoneParams.feeAsset).toBe('USDC')
    // First-use mode: enableData rides along with the intent.
    expect(request.rhinestoneParams.sessionEnableData).toBe(
      sessionEnable.enableData,
    )
  })

  it('declares the permit inflow as auxiliary funds so the intent can be planned', async () => {
    // The HCA's USDC arrives DURING the intent (permit → transferFrom), so the
    // planner cannot see it when it decides whether a route exists. Left
    // undeclared it rejects the intent outright with NO_PLAN_AVAILABLE /
    // SAME_CHAIN_INTENT_NOT_APPLICABLE.
    const result = await submitFundingAndCommitActor({
      ...input,
      permit,
      sessionEnable,
    })

    expect(result.isOk()).toBe(true)
    expect(submittedRequest().rhinestoneParams.auxiliaryFunds).toEqual({
      [sepolia.id]: { [C.usdc]: permit.value },
    })
  })

  it('submits the commit alone once the HCA is funded and the session is enabled', async () => {
    const result = await submitFundingAndCommitActor(input)

    expect(result.isOk()).toBe(true)
    const request = submittedRequest()
    expect(request.rhinestoneParams.calls).toHaveLength(1)
    expect(request.rhinestoneParams.calls[0].to.toLowerCase()).toBe(
      C.ethRegistrar.toLowerCase(),
    )
    expect(request.rhinestoneParams.sessionEnableData).toBeUndefined()
    // Nothing flows in on this path, so there is nothing to declare —
    // over-declaring would inflate the planner's view and the quote with it.
    expect(request.rhinestoneParams.auxiliaryFunds).toBeUndefined()
  })

  it('returns the commitment so the reveal can rebind to the same secret', async () => {
    const result = await submitFundingAndCommitActor(input)

    expect(result._unsafeUnwrap().commitment.commitment).toBe(COMMITMENT)
    // A fresh 32-byte secret per attempt.
    expect(result._unsafeUnwrap().commitment.secret).toMatch(/^0x[0-9a-f]{64}$/)
  })
})

describe('verifyHcaRegistrationActor', () => {
  const publicClient = { chain: sepolia } as unknown as PublicClient
  const hcaResolver = computeResolverAddress({ chainId: sepolia.id, hca: HCA })

  const registeredState = (latestOwner: Address) => ({
    status: 2, // IPermissionedRegistry.Status.REGISTERED
    expiry: 0n,
    latestOwner,
    tokenId: 0n,
    resource: 0n,
  })

  /** `getState` then `getResolver`, in the order the actor reads them. */
  const mockRegistry = (state: unknown, resolver: Address) => {
    readContract
      .mockResolvedValueOnce(state)
      .mockResolvedValueOnce(resolver as unknown)
  }

  const verify = () =>
    verifyHcaRegistrationActor({
      name: 'myname.eth',
      wallet: WALLET,
      hca: HCA,
      publicClient,
    })

  it('verifies a name owned by the wallet and resolved by the HCA resolver', async () => {
    mockRegistry(registeredState(WALLET), hcaResolver)

    expect((await verify())._unsafeUnwrap().verified).toBe(true)
  })

  it('rejects a name whose owner is the HCA instead of the wallet', async () => {
    // The registrar always assigns the name to the wallet; the HCA holding it
    // means the reveal batch registered the wrong owner.
    mockRegistry(registeredState(HCA), hcaResolver)

    expect((await verify())._unsafeUnwrap().verified).toBe(false)
  })

  it('rejects a name pointed at some other resolver', async () => {
    mockRegistry(registeredState(WALLET), WALLET)

    expect((await verify())._unsafeUnwrap().verified).toBe(false)
  })
})

describe('signFundingPermitActor', () => {
  const publicClient = { chain: sepolia } as unknown as PublicClient

  const eoaSigner = (address: Address): Signer =>
    ({
      type: 'eoa',
      walletClient: { account: { address } },
    }) as unknown as EOASigner

  it('refuses to sign with anything but the wallet EOA', async () => {
    const result = await signFundingPermitActor({
      wallet: WALLET,
      hca: HCA,
      value: 15_000_000n,
      approvalSigner: rhinestoneSigner,
      publicClient,
      chainId: sepolia.id,
    })

    expect(result._unsafeUnwrapErr().message).toMatch(/requires an EOA signer/i)
  })

  it('refuses to sign when the connected account is not the permit owner', async () => {
    const result = await signFundingPermitActor({
      wallet: WALLET,
      hca: HCA,
      value: 15_000_000n,
      approvalSigner: eoaSigner(
        '0xdead00000000000000000000000000000000dead' as Address,
      ),
      publicClient,
      chainId: sepolia.id,
    })

    expect(result._unsafeUnwrapErr().message).toMatch(/does not match/i)
  })

  it('reads the token’s EIP-712 version when eip712Domain() is unavailable', async () => {
    // Circle's Sepolia USDC (FiatTokenV2_2) reverts on ERC-5267 and signs its
    // permits over domain version "2" — assuming "1" produced an invalid
    // signature that reverted the funding leg.
    getEip712Domain.mockRejectedValue(new Error('execution reverted'))
    readContract
      .mockResolvedValueOnce(7n) // nonces(wallet)
      .mockResolvedValueOnce('USDC') // name()
      .mockResolvedValueOnce('2') // version()
    signTypedData.mockResolvedValue(`0x${'11'.repeat(32)}${'22'.repeat(32)}1b`)

    const result = await signFundingPermitActor({
      wallet: WALLET,
      hca: HCA,
      value: 15_000_000n,
      approvalSigner: eoaSigner(WALLET),
      publicClient,
      chainId: sepolia.id,
    })

    expect(result.isOk()).toBe(true)
    const [, typedData] = signTypedData.mock.calls[0] as unknown as [
      unknown,
      { domain: { name: string; version: string }; message: any },
    ]
    expect(typedData.domain.version).toBe('2')
    expect(typedData.domain.name).toBe('USDC')
    // Spender is the HCA (it pays the registrar itself), never the registrar.
    expect(typedData.message.spender.toLowerCase()).toBe(HCA.toLowerCase())
    expect(typedData.message.value).toBe(15_000_000n)
    expect(typedData.message.nonce).toBe(7n)
  })
})

describe('readUsdcSpend', () => {
  const usdc = C.usdc

  it('reads the cost from tokensSpent, which is where it actually lives', () => {
    // Captured verbatim from the live orchestrator for a commit-only
    // same-chain intent (gasCost.totalUSD was 0.9065, matching 905736 6dp).
    const cost = {
      tokensSpent: {
        '11155111': {
          '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238': {
            locked: '0',
            unlocked: '905736',
          },
        },
      },
    }

    expect(readUsdcSpend(cost, sepolia.id)).toBe(905_736n)
  })

  it('matches the token address case-insensitively', () => {
    // The orchestrator echoes addresses lowercased while our contract
    // constants are checksummed. An exact-key lookup misses and silently
    // degrades the budget to the gas fallback.
    expect(usdc).not.toBe(usdc.toLowerCase())

    const cost = {
      tokensSpent: {
        '11155111': {
          [usdc.toLowerCase()]: { locked: '0', unlocked: '12345' },
        },
      },
    }

    expect(readUsdcSpend(cost, sepolia.id)).toBe(12_345n)
  })

  it('sums locked and unlocked, since the account spends both', () => {
    const cost = {
      tokensSpent: {
        '11155111': {
          [usdc.toLowerCase()]: { locked: '1000', unlocked: '2000' },
        },
      },
    }

    expect(readUsdcSpend(cost, sepolia.id)).toBe(3_000n)
  })

  it('returns null rather than 0 when the quote carries no cost for the chain', () => {
    // 0 would be indistinguishable from a free intent and would size a permit
    // at exactly the registration price, leaving nothing for fees.
    expect(readUsdcSpend({ tokensSpent: {} }, sepolia.id)).toBeNull()
    expect(readUsdcSpend(undefined, sepolia.id)).toBeNull()
    expect(
      readUsdcSpend(
        { tokensSpent: { '11155111': { '0xother': { unlocked: '5' } } } },
        sepolia.id,
      ),
    ).toBeNull()
  })
})
