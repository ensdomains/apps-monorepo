import { getDestinationContracts } from '@ens-apps/smart-account'
import type { Address, Hex, PublicClient } from 'viem'
import { decodeFunctionData, parseAbi } from 'viem'
import { sepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RhinestoneSigner, Signer } from '../types/signer.types'
import type { Call } from '../types/transaction.types'
import {
  HCA_MAX_STANDALONE_INTENT_FEE_USDC,
  HCA_STANDALONE_INTENT_GAS_LIMIT,
  HcaFundingDeclinedError,
  type HcaFundingPrompt,
  planHcaIntentFunding,
} from './hca-intent-funding'

const readContract = vi.fn()
vi.mock('viem/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/actions')>()),
  readContract: (...args: unknown[]) => readContract(...args),
}))

const signFundingPermit = vi.fn()
vi.mock('../machines/registration/registration.hca.actors', async (orig) => ({
  ...(await orig<
    typeof import('../machines/registration/registration.hca.actors')
  >()),
  signFundingPermitActor: (...args: unknown[]) => signFundingPermit(...args),
}))

const C = getDestinationContracts(sepolia.id)

const HCA = '0xaaaa000000000000000000000000000000000001' as Address
const OWNER = '0x3333333333333333333333333333333333333333' as Address
const ACTION_TARGET = '0x00000000000000000000000000000000000000d1' as Address

const erc2612Abi = parseAbi([
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
])

/** The decoded function name of a call, without a non-null assertion. */
const fnNameOf = (call: Call | undefined) =>
  decodeFunctionData({ abi: erc2612Abi, data: call?.data as Hex }).functionName

const actionCalls: Call[] = [
  { to: ACTION_TARGET, value: 0n, data: '0xdeadbeef' as Hex },
]

const prepareTransaction = vi.fn()

const signer = {
  type: 'rhinestone',
  account: {
    getAddress: () => HCA,
    prepareTransaction: (...args: unknown[]) => prepareTransaction(...args),
  },
} as unknown as RhinestoneSigner

const publicClient = { chain: sepolia } as unknown as PublicClient
const approvalSigner = { type: 'eoa' } as unknown as Signer

/** A quote the orchestrator priced at `fee` USDC (6dp). */
const quoteOf = (fee: bigint) => ({
  intentRoute: {
    intentCost: {
      tokensSpent: {
        [String(sepolia.id)]: {
          [C.usdc.toLowerCase()]: { locked: '0', unlocked: String(fee) },
        },
      },
    },
  },
})

const params = {
  signer,
  ownerAddress: OWNER,
  approvalSigner,
  publicClient,
  chainId: sepolia.id,
  calls: actionCalls,
}

beforeEach(() => {
  vi.clearAllMocks()
  readContract.mockReset()
  prepareTransaction.mockResolvedValue(quoteOf(900_000n))
  signFundingPermit.mockReturnValue({
    match: (ok: (v: unknown) => unknown) =>
      ok({
        owner: OWNER,
        spender: HCA,
        value: 900_000n,
        deadline: 1_800_000_000n,
        v: 27,
        r: `0x${'11'.repeat(32)}` as Hex,
        s: `0x${'22'.repeat(32)}` as Hex,
      }),
  })
})

describe('planHcaIntentFunding', () => {
  it('funds the shortfall when the HCA cannot cover the fee', async () => {
    // Registration leaves the HCA with ~nothing, so this is the normal case.
    readContract.mockResolvedValue(0n)

    const funding = await planHcaIntentFunding(params)

    expect(funding.quotedFeeUsdc).toBe(900_000n)
    expect(funding.incomingUsdc).toBe(900_000n)
    expect(funding.auxiliaryFunds).toEqual({
      [sepolia.id]: { [C.usdc]: 900_000n },
    })

    // permit -> transferFrom -> action, in that order.
    expect(funding.calls).toHaveLength(3)
    expect(fnNameOf(funding.calls[0])).toBe('permit')
    expect(fnNameOf(funding.calls[1])).toBe('transferFrom')
    expect(funding.calls[2]).toEqual(actionCalls[0])
  })

  it('permits only the shortfall, not the whole fee', async () => {
    // Double-charging a standing balance would move more of the user's USDC
    // into the HCA than the action needs.
    readContract.mockResolvedValue(400_000n)

    const funding = await planHcaIntentFunding(params)

    expect(funding.incomingUsdc).toBe(500_000n)
    expect(signFundingPermit.mock.calls[0]?.[0]).toMatchObject({
      wallet: OWNER,
      hca: HCA,
      value: 500_000n,
    })
  })

  it('skips funding entirely when the HCA already covers the fee', async () => {
    readContract.mockResolvedValue(5_000_000n)

    const funding = await planHcaIntentFunding(params)

    expect(funding.calls).toEqual(actionCalls)
    expect(funding.incomingUsdc).toBeUndefined()
    expect(funding.auxiliaryFunds).toBeUndefined()
    expect(signFundingPermit).not.toHaveBeenCalled()
  })

  it('quotes the FUNDED batch, so the permit is not sized against a smaller one', async () => {
    // The fee is charged for the batch that actually fills. Quoting the bare
    // action would under-size the permit by the funding pair's own cost — the
    // same class of bug as quoting a reveal without its primary-name call.
    readContract.mockResolvedValue(0n)

    await planHcaIntentFunding(params)

    const quoted = prepareTransaction.mock.calls[0]?.[0] as {
      calls: Call[]
      gasLimit: bigint
      sponsored: unknown
      feeAsset: string
    }

    expect(quoted.calls).toHaveLength(3)
    expect(fnNameOf(quoted.calls[0])).toBe('permit')
    expect(quoted.gasLimit).toBe(HCA_STANDALONE_INTENT_GAS_LIMIT)
    // Never sponsored — this route is user-paid in USDC.
    expect(quoted.sponsored).toEqual({
      gas: false,
      bridging: false,
      swaps: false,
    })
    expect(quoted.feeAsset).toBe('USDC')
  })

  it('declares a first-pass inflow so an empty HCA can be priced at all', async () => {
    // The planner credits only balances it can already see and refuses to
    // quote an account below the fee, so an empty HCA needs the declaration.
    readContract.mockResolvedValue(0n)

    await planHcaIntentFunding(params)

    const quoted = prepareTransaction.mock.calls[0]?.[0] as {
      auxiliaryFunds?: Record<number, Record<Address, bigint>>
    }
    expect(quoted.auxiliaryFunds?.[sepolia.id]?.[C.usdc]).toBeGreaterThan(0n)
  })

  it('declares an inflow for a dust balance too, not just an empty one', async () => {
    // 0.3 USDC against a 0.9 fee is exactly as unpriceable to the planner as
    // an empty account — and it is where a settled registration leaves the
    // HCA. Keying the declaration on "exactly zero" made this band throw.
    readContract.mockResolvedValue(300_000n)

    const funding = await planHcaIntentFunding(params)

    const quoted = prepareTransaction.mock.calls[0]?.[0] as {
      auxiliaryFunds?: Record<number, Record<Address, bigint>>
    }
    expect(quoted.auxiliaryFunds?.[sepolia.id]?.[C.usdc]).toBeGreaterThan(0n)
    // And the permit still covers only what the HCA is actually short.
    expect(funding.incomingUsdc).toBe(600_000n)
  })

  it('throws rather than guessing when the quote cannot be priced', async () => {
    // A wrong permit either under-funds (the fill reverts) or moves more of
    // the user's USDC than the action needed.
    readContract.mockResolvedValue(0n)
    prepareTransaction.mockResolvedValue({ intentRoute: {} })

    await expect(planHcaIntentFunding(params)).rejects.toThrow(
      /cannot be sized/,
    )
    expect(signFundingPermit).not.toHaveBeenCalled()
  })

  it('throws rather than treating an unreadable balance as empty', async () => {
    // An unread balance is unknown, not zero. Defaulting it to zero sizes the
    // permit for the whole fee and pulls USDC out of the owner's wallet that
    // the HCA may already have been holding.
    readContract.mockRejectedValue(new Error('rpc down'))

    await expect(planHcaIntentFunding(params)).rejects.toThrow()
    expect(signFundingPermit).not.toHaveBeenCalled()
  })

  it('requests no signature for a fee above the expected maximum', async () => {
    // The fee is parsed out of an orchestrator HTTP response and becomes the
    // value of an EIP-2612 permit. A response that names an absurd figure must
    // stop here, not reach the wallet.
    readContract.mockResolvedValue(0n)
    prepareTransaction.mockResolvedValue(
      quoteOf(HCA_MAX_STANDALONE_INTENT_FEE_USDC + 1n),
    )

    await expect(planHcaIntentFunding(params)).rejects.toThrow(
      /above the expected maximum/,
    )
    expect(signFundingPermit).not.toHaveBeenCalled()
  })

  it('shows the amount before asking for the signature', async () => {
    readContract.mockResolvedValue(400_000n)
    const order: string[] = []
    const confirmFunding = vi.fn((prompt: HcaFundingPrompt) => {
      order.push('confirm')
      return prompt.permitValue > 0n
    })
    signFundingPermit.mockImplementation(() => {
      order.push('sign')
      return {
        match: (ok: (v: unknown) => unknown) =>
          ok({
            owner: OWNER,
            spender: HCA,
            value: 500_000n,
            deadline: 1_800_000_000n,
            v: 27,
            r: `0x${'11'.repeat(32)}` as Hex,
            s: `0x${'22'.repeat(32)}` as Hex,
          }),
      }
    })

    await planHcaIntentFunding({ ...params, confirmFunding })

    // Shown first, and shown the EXACT value the permit authorizes — not the
    // fee, which the standing balance partly covers.
    expect(order).toEqual(['confirm', 'sign'])
    expect(confirmFunding).toHaveBeenCalledWith({
      permitValue: 500_000n,
      quotedFeeUsdc: 900_000n,
      hcaBalanceUsdc: 400_000n,
    })
  })

  it('requests no signature when the user declines the amount', async () => {
    readContract.mockResolvedValue(0n)

    await expect(
      planHcaIntentFunding({ ...params, confirmFunding: () => false }),
    ).rejects.toThrow(HcaFundingDeclinedError)
    expect(signFundingPermit).not.toHaveBeenCalled()
  })

  it('does not prompt when no funding is needed', async () => {
    // Nothing is being permitted, so there is nothing to consent to.
    readContract.mockResolvedValue(5_000_000n)
    const confirmFunding = vi.fn(() => true)

    await planHcaIntentFunding({ ...params, confirmFunding })

    expect(confirmFunding).not.toHaveBeenCalled()
  })

  it('bounds the permit it asks for against the standalone ceiling', async () => {
    readContract.mockResolvedValue(400_000n)

    await planHcaIntentFunding(params)

    // The actor re-checks the value it is handed, so the ceiling travels with
    // the request rather than living only in this function.
    expect(signFundingPermit.mock.calls[0]?.[0]).toMatchObject({
      value: 500_000n,
      bounds: {
        expectedMaximum: HCA_MAX_STANDALONE_INTENT_FEE_USDC - 400_000n,
        displayedValue: 500_000n,
      },
    })
  })
})
