import {
  type Call,
  getSmartAccountAddress,
  type HcaFundingPrompt,
  hcaMaxIntentFeeUsdcFor,
  planHcaIntentFunding,
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
import { type SUPPORTED_TOKEN, TOKENS } from '@/lib/tokens'
import { getRenewPrice } from '../data/queries/renewPricing.query'
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

/**
 * Most names one intent may carry.
 *
 * A batch is atomic and priced as one unit: its permit has to cover every name
 * in it, and its gas limit grows with the count. Chunking keeps each intent's
 * fee, funding and gas bounded — and each chunk still replaces what used to be
 * one wallet transaction per name.
 */
export const HCA_RENEWAL_INTENT_MAX_ITEMS = 25

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
  readonly token: SUPPORTED_TOKEN
  /** The smart-account signer from the account context. */
  readonly signer: RhinestoneSigner
  /** The owner EOA the HCA belongs to. Funds the shortfall, signs the intent. */
  readonly ownerAddress: Address
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly chainId: number
  /** Called with the submitted txId so the UI can track it. */
  readonly onTxId?: (txId: string) => void
  /**
   * Show the USDC the funding permit will authorize and wait for the user to
   * accept it. Called only when the HCA cannot cover the renewal out of its own
   * balance, and always before the wallet is asked to sign anything.
   */
  readonly confirmFunding?: (
    prompt: HcaFundingPrompt,
  ) => Promise<boolean> | boolean
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
  token: SUPPORTED_TOKEN,
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

/**
 * Renew one or more names as a single owner-signed HCA intent, paid in USDC.
 *
 * There is no plain transaction and no gas token on this route: the wallet
 * signs typed data (the intent, plus a funding permit only when the HCA is
 * short), and the HCA executes the calls out of its own USDC balance.
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
    confirmFunding,
  } = params

  const [first, ...rest] = items
  if (!first) {
    throw new Error('A renewal intent needs at least one name.')
  }
  const single = rest.length === 0 ? first : undefined

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

  const tokenAddress = TOKENS[token].address
  const hca = getSmartAccountAddress(signer)

  // Unwrapped at this promise boundary: the service reports failures by
  // rejecting, and the reads themselves are composed as one Result.
  const rentTotal = (await readAuthorizedRent(items, token, protocol)).match(
    (value) => value,
    (error) => {
      throw error
    },
  )

  await assertPaymentTokenSupported(publicClient, renewerAddress, tokenAddress)

  // A renewal the HCA already holds an allowance for needs no approval; a
  // settled registration leaves nothing standing (its permit is consumed to
  // zero), so this normally does add one — cheaply, and inside the same intent.
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

  const gasLimit = hcaRenewalIntentGasLimit(items.length)

  // Owner-signed on purpose: `renew` is not one of the calls
  // `HCAOwnerAndSessionValidator` allows a session to make, so the intent has
  // to come from the owner key — which is also what makes the funding permit
  // legal in the same batch.
  const ownerSigner: RhinestoneSigner = { ...signer, session: undefined }

  const funding = await planHcaIntentFunding({
    signer: ownerSigner,
    ownerAddress,
    approvalSigner: { type: 'eoa', walletClient },
    publicClient,
    chainId,
    calls: actionCalls,
    // The rent the calls pull, on top of the fee: both come from the HCA.
    requiredUsdc: rentTotal,
    gasLimit,
    maxFeeUsdc: hcaMaxIntentFeeUsdcFor(gasLimit),
    // The amounts are quoted here, not on any earlier screen, so this is the
    // only place they can be shown before a signature is requested.
    ...(confirmFunding ? { confirmFunding } : {}),
  })

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
    },
  }

  const description = single
    ? `Renew ${single.label}.eth`
    : `Renew ${items.length} names`

  const txId = transactionManager.startTransaction(
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
