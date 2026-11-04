import { LEGACY_REFUND_CAPS } from '@ens-apps/smart-account'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { err, ok, ResultAsync } from 'neverthrow'
import type { Address, PublicClient } from 'viem'
import { encodeFunctionData, erc20Abi, isAddressEqual, parseAbi } from 'viem'
import {
  type ApproveHcaFundingParams,
  approveHcaFunding,
  assertHcaFundingWallet,
  recoverHcaFundingApproval,
} from '../../helpers/hca-funding-approval'
import {
  isCanonicalHcaUsdc,
  validateHcaUsdcPermit,
} from '../../helpers/hca-usdc-permit'
import type { Signer } from '../../types/signer.types'
import type { Call, SessionEnableData } from '../../types/transaction.types'
import type { PermitSignature } from './registration.actors'

const PERMIT_ABI = parseAbi([
  'function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)',
])

export class RegistrationFundingError extends TaggedError(
  'RegistrationFundingError',
)<{ readonly cause: unknown }> {
  constructor(input: { readonly cause: unknown }) {
    super({
      ...input,
      message:
        input.cause instanceof Error
          ? input.cause.message
          : String(input.cause),
    })
  }
}

export type RegistrationFundingApproval = Pick<
  ApproveHcaFundingParams,
  | 'walletClient'
  | 'confirmApproval'
  | 'confirmApprovalRecovery'
  | 'onState'
  | 'environment'
> & { readonly targetBalance: bigint }

type Funding =
  | { readonly kind: 'funded' }
  | { readonly kind: 'permit'; readonly permit: PermitSignature }
  | { readonly kind: 'allowance'; readonly value: bigint }

const fundingError = (cause: unknown) => new RegistrationFundingError({ cause })
const boundary = <T>(promise: Promise<T>) =>
  ResultAsync.fromPromise(promise, fundingError)

/** Preserve the fee ceilings even though the setup itself uses the owner validator. */
export const getRegistrationOwnerIntentLimits = (input: {
  readonly refundToken: Address
  readonly enableData: SessionEnableData | undefined
  readonly signer: Signer
}) => {
  const config =
    input.enableData?.hcaSessionConfig ??
    (input.signer.type === 'rhinestone'
      ? input.signer.session?.enableData?.hcaSessionConfig
      : undefined)
  return {
    refundToken: config?.refundToken ?? input.refundToken,
    refundCaps: config
      ? {
          maxRefundExchangeRate: BigInt(config.maxRefundExchangeRate),
          maxRefundGasOverhead: BigInt(config.maxRefundGasOverhead),
          maxRefundAmount: BigInt(config.maxRefundAmount),
        }
      : LEGACY_REFUND_CAPS,
  }
}

export const getRegistrationCommitSigner = (input: {
  readonly authority: 'session' | 'owner'
  readonly signer: Signer
}) => {
  if (input.authority === 'session') return ok(input.signer)
  return input.signer.type === 'rhinestone'
    ? ok({ ...input.signer, session: undefined })
    : err(
        fundingError(
          'An approved HCA funding pull requires the owner intent signer.',
        ),
      )
}

const requireExactFundingAmount = (amount: bigint, allowance: bigint) =>
  amount === 0n || amount === allowance
    ? ok(amount)
    : err(
        fundingError(
          'The USDC allowance or smart-account balance changed. Review a fresh registration quote before continuing.',
        ),
      )

/** A fresh balance can reduce the reviewed debit, but cannot expand it. */
export const getRegistrationFundingAmount = (input: {
  readonly targetBalance: bigint
  readonly balance: bigint
  readonly consented: bigint
}) => {
  const shortfall = input.targetBalance - input.balance
  const amount = shortfall > 0n ? shortfall : 0n
  return amount <= input.consented
    ? ok(amount)
    : err(
        fundingError(
          'The required funding increased. Review a fresh registration quote before continuing.',
        ),
      )
}

/** Release a consent wait on cancellation; an already-sent approval remains durably tracked. */
const confirmUnlessAborted =
  <T>(
    confirm: (prompt: T) => Promise<boolean> | boolean,
    signal: AbortSignal | undefined,
  ) =>
  (prompt: T): Promise<boolean> => {
    if (!signal) return Promise.resolve().then(() => confirm(prompt))
    if (signal.aborted) return Promise.resolve(false)
    return new Promise<boolean>((resolve, reject) => {
      const decline = () => resolve(false)
      signal.addEventListener('abort', decline, { once: true })
      void Promise.resolve()
        .then(() => (signal.aborted ? false : confirm(prompt)))
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', decline))
    })
  }

const buildFundingCalls = (input: {
  readonly token: Address
  readonly wallet: Address
  readonly hca: Address
  readonly funding: Funding
}): {
  readonly authority: 'session' | 'owner'
  readonly calls: readonly Call[]
  readonly incomingUsdc: bigint
} => {
  const { token, wallet, hca, funding } = input
  if (funding.kind === 'funded')
    return { authority: 'session', calls: [], incomingUsdc: 0n }
  const value = funding.kind === 'permit' ? funding.permit.value : funding.value
  if (value === 0n) return { authority: 'session', calls: [], incomingUsdc: 0n }
  const permitCalls: readonly Call[] =
    funding.kind === 'permit'
      ? [
          {
            to: token,
            value: 0n,
            data: encodeFunctionData({
              abi: PERMIT_ABI,
              functionName: 'permit',
              args: [
                wallet,
                hca,
                value,
                funding.permit.deadline,
                funding.permit.v,
                funding.permit.r,
                funding.permit.s,
              ],
            }),
          },
        ]
      : []
  return {
    // The deployed session policy only permits a pull immediately after a permit.
    authority: funding.kind === 'allowance' ? 'owner' : 'session',
    calls: [
      ...permitCalls,
      {
        to: token,
        value: 0n,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: 'transferFrom',
          args: [wallet, hca, value],
        }),
      },
    ],
    incomingUsdc: value,
  }
}

export const prepareRegistrationFunding = ResultFn(async function* (input: {
  readonly wallet: Address
  readonly hca: Address
  readonly token: Address
  readonly chainId: number
  readonly publicClient: PublicClient
  readonly permit: PermitSignature | undefined
  readonly approvalFallback: RegistrationFundingApproval | undefined
  readonly signal: AbortSignal | undefined
}) {
  const { permit, approvalFallback, publicClient, token, signal } = input
  const build = (funding: Funding) => buildFundingCalls({ ...input, funding })
  if (!permit) return ok(build({ kind: 'funded' }))
  if (
    !isAddressEqual(permit.owner, input.wallet) ||
    !isAddressEqual(permit.spender, input.hca)
  )
    return err(
      fundingError(
        'The funding permit does not match this registration wallet and smart account.',
      ),
    )
  if (!approvalFallback || !isCanonicalHcaUsdc(input.chainId, token))
    return ok(build({ kind: 'permit', permit }))

  const approval: ApproveHcaFundingParams = {
    ...approvalFallback,
    publicClient,
    chainId: input.chainId,
    owner: input.wallet,
    token,
    spender: input.hca,
    amount: permit.value,
    operation: 'registration',
    allowanceMode: 'exact',
    signal,
    confirmApproval: confirmUnlessAborted(
      approvalFallback.confirmApproval,
      signal,
    ),
    ...(approvalFallback.confirmApprovalRecovery
      ? {
          confirmApprovalRecovery: confirmUnlessAborted(
            approvalFallback.confirmApprovalRecovery,
            signal,
          ),
        }
      : {}),
  }
  // Preflight is only evidence for offering an approval. When inconclusive,
  // the original permit still goes through the token's on-chain validation.
  const validation = yield* validateHcaUsdcPermit({
    publicClient,
    chainId: input.chainId,
    token,
    permit,
  }).orElse(() => ok('permit' as const))
  // A compatible permit needs neither durable approval storage nor browser locks.
  if (validation === 'permit') return ok(build({ kind: 'permit', permit }))
  yield* assertHcaFundingWallet(approval)
  const recovered = yield* recoverHcaFundingApproval(approval)
  const consented =
    recovered.kind === 'covered' && recovered.maxAmount < permit.value
      ? recovered.maxAmount
      : permit.value
  const refreshAmount = (maximum: bigint) =>
    boundary(
      publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [input.hca],
      }),
    ).andThen((balance) =>
      getRegistrationFundingAmount({
        targetBalance: approvalFallback.targetBalance,
        balance,
        consented: maximum,
      }),
    )
  const amount =
    recovered.kind === 'none' ? permit.value : yield* refreshAmount(consented)
  const allowance = yield* boundary(
    publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [input.wallet, input.hca],
    }),
  )
  if (allowance !== amount) {
    const approvalAmount = yield* refreshAmount(consented)
    if (approvalAmount > 0n)
      yield* approveHcaFunding({ ...approval, amount: approvalAmount })
    const fundedAmount = yield* refreshAmount(approvalAmount)
    yield* requireExactFundingAmount(fundedAmount, approvalAmount)
    yield* assertHcaFundingWallet(approval)
    return ok(build({ kind: 'allowance', value: fundedAmount }))
  }
  const fundedAmount = yield* refreshAmount(consented)
  yield* requireExactFundingAmount(fundedAmount, allowance)
  yield* assertHcaFundingWallet(approval)
  return ok(build({ kind: 'allowance', value: fundedAmount }))
})
