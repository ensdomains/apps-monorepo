import {
  type Call,
  getSmartAccountAddress,
  HcaFundingDeclinedError,
  type HcaFundingPrompt,
  hcaMaxIntentFeeUsdcFor,
  type PermitPurpose,
  planHcaIntentFunding,
  quoteHcaIntentFeeUsdc,
  type RhinestoneSigner,
  type RhinestoneTransactionRequest,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { assertPaymentTokenSupported } from '@ens-apps/transaction-manager/contracts/paymentToken'
import {
  authorizedPaymentAmount,
  encodeRenewBatchData,
  encodeRenewData,
} from '@ens-apps/transaction-manager/machines/registration/registration.actors'
import { ResultFn } from '@ens-apps/utils/neverthrow'
import { ok, ResultAsync } from 'neverthrow'
import type { Address, PublicClient, WalletClient } from 'viem'
import { encodeFunctionData, erc20Abi, isAddressEqual } from 'viem'
import { type RENEWAL_TOKEN, TOKENS } from '@/lib/tokens'
import { getRenewPrice } from '../data/queries/renewPricing.query'
import { isRenewalFundingWithinConsent } from '../utils/renewalPaymentConsent'
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

/** Room for a second permit + `transferFrom` pair when the rent is not in USDC. */
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
  shownAt: 'in the renewal payment prompt',
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
}

export interface HcaRenewalResult {
  /** The transaction-manager id, trackable via `transactionManager.getTransaction`. */
  readonly txId: string
  /** USDC (6dp) the orchestrator quoted for this intent. */
  readonly quotedFeeUsdc: bigint
  /** USDC (6dp) the funding moved into the HCA, if any was needed. */
  readonly incomingUsdc?: bigint
}

export interface SubmitHcaRenewalParams {
  /** The names to renew. One renews directly; several go in one `renewBatch`. */
  readonly items: readonly HcaRenewalItem[]
  /** Canonical renewer the names renew against (v2 registrar or the v1 renewer). */
  readonly renewerAddress: Address
  /** Which renewer that is — selects the live price read. */
  readonly protocol: RenewalProtocol
  /** What the rent is paid in. The intent's fee is always USDC. */
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
  readonly onSigningRequested?: () => void
  /** Maximum USDC debit the user confirmed in the payment modal, in raw units. */
  readonly displayedWalletDebitUsdc?: bigint
  /**
   * Request consent before signing when the wallet debit increased or no prior
   * maximum was provided. Existing bulk/legacy callers retain explicit review.
   */
  readonly confirmFunding?: (
    prompt: HcaFundingPrompt,
  ) => Promise<boolean> | boolean
  /** An abandoned attempt declines every prompt, confirmed maximum or not. */
  readonly signal?: AbortSignal
}

/**
 * Price the batch and apply the renewal allowance policy, as one Result.
 *
 * Priced NOW, not from the screen the user saw: the rent the renewer pulls is
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
  /** The rent with its approval headroom, in token units. */
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
        ? encodeRenewData(single.label, single.duration, tokenAddress)
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
 * priced; submission re-quotes and asks again only above the confirmed maximum.
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

/**
 * Renew one or more names as a single owner-signed HCA intent, with the rent in
 * the chosen stable and the intent's fee in USDC.
 *
 * There is no plain transaction and no gas token on this route: the wallet
 * signs typed data (the intent, plus a funding permit per token the HCA is
 * short of), and the HCA executes the calls out of its own balances.
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
    onSigningRequested,
    confirmFunding,
    displayedWalletDebitUsdc,
    signal,
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

  // The first signature can be the permit or the intent; report it once.
  let hasRequestedSigning = false
  const requestSigning = () => {
    if (hasRequestedSigning) return
    hasRequestedSigning = true
    onSigningRequested?.()
  }

  const funding = await planHcaIntentFunding({
    signer: ownerSigner,
    ownerAddress,
    approvalSigner: { type: 'eoa', walletClient },
    publicClient,
    chainId,
    calls: actionCalls,
    // The rent the calls pull, on top of the fee: both come from the HCA. In
    // USDC it shares the fee's funding; in any other stable it is its own leg.
    tokenSpend: {
      token: tokenAddress,
      symbol: TOKENS[token].symbol,
      decimals: TOKENS[token].decimals,
      permitKind: TOKENS[token].permitKind,
      amount: rentTotal,
    },
    gasLimit,
    maxFeeUsdc: hcaMaxIntentFeeUsdcFor(gasLimit),
    // The rail invokes this before signing or pulling funds, even with a
    // standing allowance. Only amounts already confirmed may skip the UI.
    ...(confirmFunding
      ? {
          confirmFunding: async (prompt: HcaFundingPrompt) => {
            if (signal?.aborted) return false
            if (
              isRenewalFundingWithinConsent(
                prompt,
                displayedWalletDebitUsdc,
                token,
              )
            ) {
              requestSigning()
              return true
            }
            const approved = await confirmFunding(prompt)
            if (approved) requestSigning()
            return approved
          },
        }
      : {}),
    purpose: RENEWAL_PERMIT_PURPOSE,
  })

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

  // A fully covered renewal never prompts, so the abort has to be read here too.
  if (signal?.aborted) throw new HcaFundingDeclinedError()
  requestSigning()
  txId = transactionManager.startTransaction(
    { type: 'custom', request },
    ownerSigner,
    {
      description,
      publicClient,
      chainId,
      operation: 'renew-name',
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
