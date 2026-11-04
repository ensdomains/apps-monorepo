import {
  type Call,
  getSmartAccountAddress,
  type HcaDisplayedDebit,
  type HcaFundingApprovalCapability,
  type HcaFundingPrompt,
  hcaMaxIntentFeeUsdcFor,
  type L2FundingSource,
  type PermitPurpose,
  planHcaIntentFunding,
  quoteHcaIntentFeeUsdc,
  type RhinestoneSigner,
  type RhinestoneTransactionRequest,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { assertPaymentTokenSupported } from '@ens-apps/transaction-manager/contracts/paymentToken'
import { assertHcaFundingWallet } from '@ens-apps/transaction-manager/helpers/hca-funding-approval'
import {
  authorizedPaymentAmount,
  encodeRenewBatchData,
  encodeRenewData,
} from '@ens-apps/transaction-manager/machines/registration/registration.actors'
import {
  awaitL2BridgeActor,
  L2_BRIDGE_CLAIMABLE_MS,
  readHcaUsdcBalanceActor,
  readHcaUsdcBalanceAtLeastActor,
  submitL2BridgeActor,
} from '@ens-apps/transaction-manager/machines/registration/registration.hca.actors'
import { ResultFn } from '@ens-apps/utils/neverthrow'
import { err, fromPromise, ok, ResultAsync } from 'neverthrow'
import type { Address, PublicClient, WalletClient } from 'viem'
import { encodeFunctionData, erc20Abi, isAddressEqual } from 'viem'
import {
  clearPendingL2Bridge,
  readPendingL2Bridge,
  savePendingL2Bridge,
} from '@/features/register-v2/service/pendingL2Bridge'
import { buildIntentStatusFetcher } from '@/lib/smart-account/rhinestone'
import { type RENEWAL_TOKEN, TOKENS } from '@/lib/tokens'
import { getRenewPrice } from '../data/queries/renewPricing.query'
import { getL2RenewalAmountOut } from '../utils/l2RenewalAmount'
import { checkRenewalFees, RenewalFeeUnpricedError } from '../utils/renewalFees'
import {
  decideRenewalPayment,
  getPromptWalletDebit,
} from '../utils/renewalFunding'
import type { RenewalProtocol } from '../utils/renewalProtocol'

/**
 * Declared gas limit for a renewal intent, and the marginal cost of each extra
 * name in a batch.
 *
 * The rail prices the quote on the DECLARED limit, so an under-declared batch
 * quotes a fee that cannot pay for its own fill (registration's `register` leg
 * learned this the expensive way). Measured on a Sepolia fork against the v2
 * registrar: `renew` alone costs ~91k gas and each extra `renewBatch` entry
 * ~24-35k, on top of the executor's own overhead — the commit leg, a comparable
 * `permit + transferFrom + one call` batch, BILLS ~385k. 600k base plus 100k
 * per extra name therefore covers the whole shape with room to spare, and the
 * overshoot is not wasted: whatever the fill does not spend stays in the HCA.
 */
export const HCA_RENEWAL_INTENT_GAS_LIMIT_BASE = 600_000n
export const HCA_RENEWAL_INTENT_GAS_LIMIT_PER_ITEM = 100_000n

/** Room for a second permit + `transferFrom` pair when the price is not in USDC. */
export const HCA_RENEWAL_INTENT_TOKEN_FUNDING_GAS = 150_000n

/**
 * Most names one intent may carry.
 *
 * A batch is atomic and priced as one unit: its permit has to cover every name
 * in it, and its gas limit grows with the count. Chunking keeps each intent's
 * fee, funding and gas bounded — and each chunk still replaces what used to be
 * one wallet transaction per name.
 */
export const HCA_RENEWAL_INTENT_MAX_ITEMS = 25

/** How the funding permit's errors describe a renewal. */
const RENEWAL_PERMIT_PURPOSE: PermitPurpose = {
  subject: 'the renewal',
  shownAt: 'when you started the renewal',
  costNote:
    'The amount covers the renewal price with its 10% buffer, and in USDC ' +
    'the network fee, less what the smart account already holds.',
}

/** Gas limit a renewal batch of `itemCount` names is quoted against. */
export const hcaRenewalIntentGasLimit = (itemCount: number): bigint =>
  HCA_RENEWAL_INTENT_GAS_LIMIT_BASE +
  HCA_RENEWAL_INTENT_GAS_LIMIT_PER_ITEM * BigInt(Math.max(itemCount - 1, 0))

export interface HcaRenewalItem {
  readonly label: string
  /** Duration in SECONDS. */
  readonly duration: bigint
  readonly referrer?: `0x${string}`
}

export interface HcaRenewalResult {
  /** The transaction-manager id, trackable via `transactionManager.getTransaction`. */
  readonly txId: string
  /** USDC (6dp) the orchestrator quoted for this intent. */
  readonly quotedFeeUsdc: bigint
  /** USDC (6dp) the funding moved into the HCA, if any was needed. */
  readonly incomingUsdc?: bigint
}

/** Pays a USDC renewal from the wallet's USDC on an L2. */
export interface HcaRenewalL2Funding {
  readonly source: L2FundingSource
  /** USDC (6dp) checkout showed the L2 being charged, fee included. */
  readonly displayedCharge?: bigint
}

export interface SubmitHcaRenewalParams {
  /** The names to renew. One renews directly; several go in one `renewBatch`. */
  readonly items: readonly HcaRenewalItem[]
  /** Canonical renewer the names renew against (v2 registrar or the v1 renewer). */
  readonly renewerAddress: Address
  /** Which renewer that is — selects the live price read. */
  readonly protocol: RenewalProtocol
  /** What the price is paid in. The intent's fee is always USDC. */
  readonly token: RENEWAL_TOKEN
  /** The smart-account signer from the account context. */
  readonly signer: RhinestoneSigner
  /** The owner EOA the HCA belongs to. Funds the shortfall, signs the intent. */
  readonly ownerAddress: Address
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly chainId: number
  /** Called with the transaction-manager id as soon as the record exists, so the UI can track it. */
  readonly onTxId?: (txId: string) => void
  /**
   * Called once the owner has signed and the orchestrator holds the intent,
   * before the fill: nothing is left to approve, so a payment dialog can hand
   * over to progress.
   */
  readonly onSubmitted?: (txId: string) => void
  /**
   * Show the USDC the funding permit will authorize and wait for the user to
   * accept it. Called only when the HCA cannot cover the renewal out of its own
   * balance, and always before the wallet is asked to sign anything.
   */
  readonly approvalFallback?: HcaFundingApprovalCapability
  readonly signal?: AbortSignal
  /**
   * What the payment screen showed the wallet would pay. The funding is checked
   * against it instead of asking `confirmFunding`.
   */
  readonly displayedDebit?: HcaDisplayedDebit
  readonly confirmFunding?: (
    prompt: HcaFundingPrompt,
  ) => Promise<boolean> | boolean
  /**
   * Asked, before any signature, only when the re-quoted wallet debit is above
   * `displayedDebit`. Accepting signs for exactly the prompt's amounts; a same
   * or lower debit signs without asking.
   */
  readonly confirmIncreasedPayment?: (
    prompt: HcaFundingPrompt,
  ) => Promise<boolean>
  /**
   * Bridge what the HCA is short in from an L2 before the renewal, so the
   * renewal pays from the HCA with no permit.
   */
  readonly l2Funding?: HcaRenewalL2Funding
}

/**
 * Price the batch and apply the renewal allowance policy, as one Result.
 *
 * Priced NOW, not from the screen the user saw: the price the renewer pulls is
 * computed at execution, so both the approval and the funding are sized from
 * the freshest read available. The 10% headroom `authorizedPaymentAmount` adds
 * absorbs feed drift between this read and the fill — the same allowance policy
 * the direct-wallet route uses.
 */
const readAuthorizedRent = ResultFn(async function* (
  items: readonly HcaRenewalItem[],
  token: RENEWAL_TOKEN,
  protocol: RenewalProtocol,
) {
  const prices = yield* ResultAsync.combine(
    items.map((item) =>
      getRenewPrice(item.label, item.duration, token, protocol),
    ),
  )
  return ok(
    authorizedPaymentAmount(
      prices.reduce((sum, price) => sum + price.amount, 0n),
    ),
  )
})

type RenewalIntent = {
  readonly tokenAddress: Address
  /** The price with its approval headroom, in token units. */
  readonly rentTotal: bigint
  readonly actionCalls: readonly Call[]
  readonly gasLimit: bigint
}

/** The calls a renewal intent runs and the limit it is quoted against; shared by the quote and the submit. */
const buildRenewalIntent = async (params: {
  readonly items: readonly HcaRenewalItem[]
  readonly renewerAddress: Address
  readonly protocol: RenewalProtocol
  readonly token: RENEWAL_TOKEN
  readonly hca: Address
  readonly publicClient: PublicClient
}): Promise<RenewalIntent> => {
  const { items, renewerAddress, protocol, token, hca, publicClient } = params
  const [first, ...rest] = items
  if (!first) {
    throw new Error('A renewal intent needs at least one name.')
  }
  const single = rest.length === 0 ? first : undefined
  const tokenAddress = TOKENS[token].address

  // Unwrapped at this promise boundary: the service reports failures by
  // rejecting, and the reads themselves are composed as one Result.
  const rentTotal = (await readAuthorizedRent(items, token, protocol)).match(
    (value) => value,
    (error) => {
      throw error
    },
  )

  await assertPaymentTokenSupported(publicClient, renewerAddress, tokenAddress)

  // Skip the approval when the HCA's standing allowance to the renewer already
  // covers it, e.g. a bulk chunk's leftover headroom. Registration's
  // `approve(price)` is pulled in full by `register`, so this usually adds one.
  const standingAllowance = await publicClient.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [hca, renewerAddress],
  })

  const actionCalls: Call[] = [
    ...(standingAllowance < rentTotal
      ? [
          {
            to: tokenAddress,
            value: 0n,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: 'approve',
              args: [renewerAddress, rentTotal],
            }),
          },
        ]
      : []),
    {
      to: renewerAddress,
      value: 0n,
      data: single
        ? encodeRenewData(
            single.label,
            single.duration,
            tokenAddress,
            single.referrer,
          )
        : encodeRenewBatchData(items, tokenAddress),
    },
  ]

  const gasLimit =
    hcaRenewalIntentGasLimit(items.length) +
    (token === 'USDC' ? 0n : HCA_RENEWAL_INTENT_TOKEN_FUNDING_GAS)

  return { tokenAddress, rentTotal, actionCalls, gasLimit }
}

export type QuoteHcaRenewalFeeParams = Pick<
  SubmitHcaRenewalParams,
  | 'items'
  | 'renewerAddress'
  | 'protocol'
  | 'token'
  | 'signer'
  | 'ownerAddress'
  | 'publicClient'
  | 'chainId'
>

/**
 * The USDC (6dp) fee the rail quotes for this renewal intent, over the same
 * batch `submitHcaRenewal` sends. Nothing is signed. `null` when it cannot be
 * priced; the submit re-quotes and shows the final figure before any signature.
 */
export async function quoteHcaRenewalFee(
  params: QuoteHcaRenewalFeeParams,
): Promise<bigint | null> {
  const {
    items,
    renewerAddress,
    protocol,
    token,
    signer,
    ownerAddress,
    publicClient,
    chainId,
  } = params
  const hca = getSmartAccountAddress(signer)
  const { tokenAddress, rentTotal, actionCalls, gasLimit } =
    await buildRenewalIntent({
      items,
      renewerAddress,
      protocol,
      token,
      hca,
      publicClient,
    })

  return quoteHcaIntentFeeUsdc({
    signer: { ...signer, session: undefined },
    ownerAddress,
    publicClient,
    chainId,
    calls: actionCalls,
    tokenSpend: {
      token: tokenAddress,
      symbol: TOKENS[token].symbol,
      decimals: TOKENS[token].decimals,
      permitKind: TOKENS[token].permitKind,
      amount: rentTotal,
    },
    gasLimit,
  })
}

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error))

/**
 * Wait for a read that shows the HCA holding `atLeast`. One still below it when
 * the wait runs out is an error: the caller keeps the bridge pending rather
 * than funding the renewal a second time.
 */
const awaitHcaBalance = ResultFn(async function* (params: {
  readonly hca: Address
  readonly publicClient: PublicClient
  readonly chainId: number
  readonly atLeast: bigint
}) {
  const balance = yield* readHcaUsdcBalanceAtLeastActor(params)
  return balance >= params.atLeast
    ? ok(undefined)
    : err(
        new Error(
          "The L2 payment hasn't shown up in your account yet, so nothing more was paid. Try again in a few minutes.",
        ),
      )
})

/**
 * Settle a bridge an earlier attempt (or a registration) sent into this HCA
 * before paying again: wait for its verdict and, once it landed, give the read
 * time to show it. One still unsettled after the wait is an error, not a reason
 * to pay a second time. A landed one is cleared whatever the read shows, as
 * registration does: its USDC may have been spent since, and waiting on it
 * would block every later payment.
 */
const settlePendingL2Bridge = ResultFn(async function* (params: {
  readonly hca: Address
  readonly publicClient: PublicClient
  readonly chainId: number
}) {
  const { hca, publicClient, chainId } = params
  const pending = readPendingL2Bridge(chainId, hca)
  if (!pending) return ok(undefined)

  const verdict = yield* awaitL2BridgeActor({
    intentId: pending.intentId,
    claimableUntil: pending.claimableUntil,
    fetchIntentStatus: buildIntentStatusFetcher(),
  })
  if (verdict === 'landed') {
    yield* readHcaUsdcBalanceAtLeastActor({
      hca,
      publicClient,
      chainId,
      atLeast: pending.fundsHcaTo,
    })
  }
  clearPendingL2Bridge(chainId, hca)
  return ok(undefined)
})

/**
 * Bridge what the HCA is short of `intents` in from an L2 as one payment, then
 * wait for a read that shows it, so each renewal pays from the HCA with no
 * permit. The bridge is recorded once accepted and cleared once it shows, so a
 * retry waits for it rather than paying twice.
 */
const fundRenewalsFromL2 = ResultFn(async function* (params: {
  readonly l2Funding: HcaRenewalL2Funding
  readonly intents: readonly RenewalIntent[]
  readonly token: RENEWAL_TOKEN
  readonly signer: RhinestoneSigner
  readonly ownerAddress: Address
  readonly publicClient: PublicClient
  readonly chainId: number
}) {
  const { l2Funding, intents, signer, publicClient, chainId } = params
  const { source } = l2Funding
  if (params.token !== 'USDC') {
    return err(
      new Error(`Paying from ${source.chain.name} renews in USDC only.`),
    )
  }

  const hca = getSmartAccountAddress(signer)
  yield* settlePendingL2Bridge({ hca, publicClient, chainId })

  const fees = yield* ResultAsync.combine(
    intents.map((intent) =>
      fromPromise(
        quoteHcaIntentFeeUsdc({
          signer,
          ownerAddress: params.ownerAddress,
          publicClient,
          chainId,
          calls: intent.actionCalls,
          requiredUsdc: intent.rentTotal,
          gasLimit: intent.gasLimit,
        }),
        toError,
      ),
    ),
  )
  const quotedFeeUsdc = yield* checkRenewalFees(
    intents.map((intent, index) => ({
      fee: fees[index] ?? null,
      maxFee: hcaMaxIntentFeeUsdcFor(intent.gasLimit),
    })),
  ).mapErr((error) =>
    error instanceof RenewalFeeUnpricedError
      ? new Error(
          `Could not quote the renewal, so the payment from ${source.chain.name} cannot be sized.`,
        )
      : error,
  )

  const hcaBalance = yield* readHcaUsdcBalanceActor({
    hca,
    publicClient,
    chainId,
  })
  const amount = getL2RenewalAmountOut({
    rentTotal: intents.reduce((sum, intent) => sum + intent.rentTotal, 0n),
    quotedFeeUsdc,
    hcaBalance,
  })
  if (amount === 0n) return ok(hcaBalance)

  const fundsHcaTo = hcaBalance + amount
  const txId = yield* submitL2BridgeActor({
    hca,
    payment: { source, amount, displayedCharge: l2Funding.displayedCharge },
    signer,
    publicClient,
    onIntentSubmitted: (intentId) => {
      savePendingL2Bridge(chainId, hca, {
        intentId,
        claimableUntil: Date.now() + L2_BRIDGE_CLAIMABLE_MS,
        fundsHcaTo,
      })
    },
  })
  yield* fromPromise(waitForTransaction(txId), toError)
  // A lagging read would otherwise ask the wallet to fund it all over again.
  yield* awaitHcaBalance({ hca, publicClient, chainId, atLeast: fundsHcaTo })
  clearPendingL2Bridge(chainId, hca)
  return ok(fundsHcaTo)
})

/**
 * Bridge what the HCA is short of every batch in from an L2, as one payment, so
 * a bulk renewal's intents then each pay from the HCA. Shares the single
 * renewal's sizing, bounds and pending-bridge record.
 */
export async function fundHcaRenewalsFromL2(
  params: Omit<
    SubmitHcaRenewalParams,
    | 'items'
    | 'walletClient'
    | 'onTxId'
    | 'onSubmitted'
    | 'approvalFallback'
    | 'signal'
    | 'displayedDebit'
    | 'confirmFunding'
    | 'confirmIncreasedPayment'
    | 'l2Funding'
  > & {
    readonly batches: readonly (readonly HcaRenewalItem[])[]
    readonly l2Funding: HcaRenewalL2Funding
  },
): Promise<void> {
  const { batches, signer, publicClient, ...rest } = params
  const hca = getSmartAccountAddress(signer)
  const intents = await Promise.all(
    batches.map((items) =>
      buildRenewalIntent({ ...rest, items, hca, publicClient }),
    ),
  )
  // Unwrapped at this promise boundary, like the price read.
  ;(
    await fundRenewalsFromL2({
      ...rest,
      intents,
      signer: { ...signer, session: undefined },
      publicClient,
    })
  ).match(
    () => undefined,
    (error) => {
      throw error
    },
  )
}

/**
 * How the user agrees to the funding the intent re-quotes: by the debit the
 * payment screen showed (asking again only when it went up), else by a prompt
 * before any signature.
 */
const fundingConsent = ({
  displayedDebit,
  confirmFunding,
  confirmIncreasedPayment,
  l2Funding,
}: Pick<
  SubmitHcaRenewalParams,
  'displayedDebit' | 'confirmFunding' | 'confirmIncreasedPayment' | 'l2Funding'
>) => {
  // The bridge pays it all, so the screen showed nothing from the wallet: anything left is refused, never asked.
  if (l2Funding) return { displayedDebit: { usdc: 0n, token: 0n } }
  if (confirmIncreasedPayment)
    return {
      confirmFunding: (prompt: HcaFundingPrompt) =>
        decideRenewalPayment({
          confirmed: displayedDebit,
          requoted: getPromptWalletDebit(prompt),
        }) === 'proceed' || confirmIncreasedPayment(prompt),
    }
  if (displayedDebit) return { displayedDebit }
  if (confirmFunding) return { confirmFunding }
  return {}
}

/**
 * Renew one or more names as a single owner-signed HCA intent, with the price in
 * the chosen stable and the intent's fee in USDC.
 *
 * The wallet normally signs typed data for funding and the intent. A proven
 * delegated-wallet USDC incompatibility can instead use a separately consented,
 * bounded approval transaction, paid in ETH, before the owner signs the intent.
 *
 * `renew` charges `msg.sender`, so the payer is the HCA, and the intent is
 * owner-signed — `HCAOwnerAndSessionValidator` allowlists only `commit` and
 * `register` for sessions, so a session-signed renewal reverts
 * `ActionNotAllowed`, and the owner's 65-byte branch applies no action policy.
 *
 * Resolves once the intent has filled, not merely been submitted.
 */
export async function submitHcaRenewal(
  params: SubmitHcaRenewalParams,
): Promise<HcaRenewalResult> {
  const {
    items,
    renewerAddress,
    protocol,
    token,
    signer,
    ownerAddress,
    walletClient,
    publicClient,
    chainId,
    onTxId,
    onSubmitted,
    l2Funding,
  } = params

  const single = items.length === 1 ? items[0] : undefined

  // The wallet client and the owner address come from the account context
  // separately and can momentarily diverge while the wallet reconnects or the
  // user switches accounts. The intent and the funding permit are both signed
  // by this wallet, so require it to actually control the owner address.
  if (
    !walletClient.account ||
    !isAddressEqual(walletClient.account.address, ownerAddress)
  ) {
    throw new Error(
      'Cannot renew - the connected wallet does not control the owner address.',
    )
  }

  const hca = getSmartAccountAddress(signer)
  const { tokenAddress, rentTotal, actionCalls, gasLimit } =
    await buildRenewalIntent({
      items,
      renewerAddress,
      protocol,
      token,
      hca,
      publicClient,
    })

  // Owner-signed on purpose: `renew` is not one of the calls
  // `HCAOwnerAndSessionValidator` allows a session to make, so the intent has
  // to come from the owner key — which is also what makes the funding permit
  // legal in the same batch.
  const ownerSigner: RhinestoneSigner = { ...signer, session: undefined }

  // What the HCA was read holding once funded from an L2. Funding is planned
  // no lower: another node can still read the balance from before the bridge,
  // and would ask the wallet for USDC the account already holds.
  const hcaBalanceAtLeast = l2Funding
    ? // Unwrapped at this promise boundary, like the price read.
      (
        await fundRenewalsFromL2({
          l2Funding,
          intents: [{ tokenAddress, rentTotal, actionCalls, gasLimit }],
          token,
          signer: ownerSigner,
          ownerAddress,
          publicClient,
          chainId,
        })
      ).match(
        (balance) => balance,
        (error) => {
          throw error
        },
      )
    : undefined

  const funding = await planHcaIntentFunding({
    signer: ownerSigner,
    ownerAddress,
    approvalSigner: { type: 'eoa', walletClient },
    publicClient,
    chainId,
    calls: actionCalls,
    // The price the calls pull, on top of the fee: both come from the HCA. In
    // USDC it shares the fee's funding; in any other stable it is its own leg.
    tokenSpend: {
      token: tokenAddress,
      symbol: TOKENS[token].symbol,
      decimals: TOKENS[token].decimals,
      permitKind: TOKENS[token].permitKind,
      amount: rentTotal,
    },
    gasLimit,
    ...(hcaBalanceAtLeast === undefined ? {} : { hcaBalanceAtLeast }),
    maxFeeUsdc: hcaMaxIntentFeeUsdcFor(gasLimit),
    ...fundingConsent(params),
    purpose: RENEWAL_PERMIT_PURPOSE,
    ...(params.approvalFallback
      ? { approvalFallback: params.approvalFallback }
      : {}),
    ...(params.signal ? { signal: params.signal } : {}),
  })

  // Cancellation never undoes an approval, but it must stop a detached screen from starting an intent.
  if (params.signal?.aborted)
    return Promise.reject(
      new Error('The renewal screen was closed before submission.'),
    )
  if (params.approvalFallback) {
    const identity = await assertHcaFundingWallet({
      walletClient,
      publicClient,
      owner: ownerAddress,
      chainId,
      ...(params.signal ? { signal: params.signal } : {}),
    })
    if (identity.isErr()) return Promise.reject(identity.error)
  }

  // Assigned by `startTransaction` below; the transport reports the submitted
  // intent only after that returns.
  let txId: string | undefined
  const request: RhinestoneTransactionRequest = {
    type: 'rhinestone-intent',
    from: hca,
    chainId,
    rhinestoneParams: {
      calls: funding.calls,
      // User-paid in USDC, like every intent on this route.
      feeAsset: 'USDC',
      ...(funding.auxiliaryFunds
        ? { auxiliaryFunds: funding.auxiliaryFunds }
        : {}),
      // Fires once the owner has signed and the orchestrator holds the
      // intent, before the fill: nothing is left to approve from here.
      onIntentSubmitted: () => {
        if (txId) onSubmitted?.(txId)
      },
    },
  }

  const description = single
    ? `Renew ${single.label}.eth`
    : `Renew ${items.length} names`

  params.signal?.throwIfAborted()
  txId = transactionManager.startTransaction(
    { type: 'custom', request },
    ownerSigner,
    {
      description,
      publicClient,
      chainId,
      operation: 'renew-name',
      // An accepted intent can still fill after its status request fails.
      retryCount: 0,
    },
  )
  onTxId?.(txId)

  // The transport resolves the tx once the intent has FILLED, so awaiting here
  // means callers can treat a resolved promise as "renewed", not "submitted".
  await waitForTransaction(txId)

  return {
    txId,
    quotedFeeUsdc: funding.quotedFeeUsdc,
    ...(funding.incomingUsdc === undefined
      ? {}
      : { incomingUsdc: funding.incomingUsdc }),
  }
}
