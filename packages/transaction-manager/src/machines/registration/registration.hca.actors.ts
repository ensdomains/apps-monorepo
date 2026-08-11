/**
 * Standalone-HCA registration actors (user-paid USDC route).
 *
 * These target the STANDALONE-HCA deployment (via `@ens-apps/smart-account`'s
 * manifest) — a different contract set from `ENS_SEPOLIA_CONTRACTS`, which the
 * pure-EOA path (portal) keeps using untouched.
 *
 * Route shape (per the "HCA: New" handoff doc; NO gas sponsorship):
 *   - Commit leg (first HCA action, session-signed, one request):
 *       USDC.permit(wallet, HCA, budget)        — only when funding is needed
 *       USDC.transferFrom(wallet, HCA, budget)  — only when funding is needed
 *       HCAOwnerAndSessionValidator.enableSessionWithRefund(...) — only until enabled
 *       ETHRegistrar.commit(commitment)
 *     The same request lazily deploys the HCA. `sponsored: { gas:false,
 *     bridging:false, swaps:false }`, `feeAsset: 'USDC'` — execution costs are
 *     refunded from the HCA's USDC.
 *   - Reveal leg (after cooldown, session-signed, no wallet prompt):
 *       price re-read immediately before; exact-ordered reveal batch from
 *       `buildRevealBatch` (deployProxy? → approve(price) → register(wallet) →
 *       setters → setNameWithHCA? → authorizeNameRoles).
 */

import {
  buildCommitCall,
  buildEnableSessionWithRefundCall,
  buildRevealBatch,
  computeResolverAddress,
  estimateHcaBudget,
  getDestinationContracts,
  getSourceContracts,
  HCA_LEG_GAS_LIMITS,
  type HcaBudgetBreakdown,
  type Call as HcaCall,
  type HcaLeg,
  type QuoteLegResult,
  readCommitment,
  readRegisterPrice,
  registerLegGasLimit,
} from '@ens-apps/smart-account'
import type { Session, Transaction } from '@rhinestone/sdk'
import { errAsync, fromPromise, type ResultAsync } from 'neverthrow'
import type { Address, Chain, Hash, Hex, PublicClient } from 'viem'
import {
  bytesToHex,
  encodeFunctionData,
  erc20Abi,
  isAddressEqual,
  keccak256,
  parseAbi,
  parseSignature,
  stringToHex,
} from 'viem'
import { getEip712Domain, readContract, signTypedData } from 'viem/actions'
import { sepolia } from 'viem/chains'
import { transactionManager } from '../../providers/transactionManager'
import type { RhinestoneSigner, Signer } from '../../types/signer.types'
import type {
  Call,
  RhinestoneTransactionRequest,
  SessionEnableData,
  SourceAssetAmount,
} from '../../types/transaction.types'
import type { PermitSignature } from './registration.actors'

type CommitmentData = {
  commitment: Hash
  secret: Hex
}

/** Session-enable payload threaded from the manager (absent once enabled). */
export interface HcaSessionEnableParams {
  readonly enableData: SessionEnableData
  readonly permissionId: Hex
  readonly sessionKey: Address
  readonly validUntil: bigint
}

// viem's `erc20Abi` already covers name/balanceOf/allowance/transferFrom. Only
// the ERC-2612 additions (`permit`, `nonces`) and the EIP-712 `version()`
// getter — none of which are part of ERC-20 — are declared here.
const erc2612Abi = [
  ...erc20Abi,
  ...parseAbi([
    'function nonces(address owner) view returns (uint256)',
    'function version() view returns (string)',
    'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  ]),
] as const

const permissionedRegistryAbi = parseAbi([
  'struct State { uint8 status; uint64 expiry; address latestOwner; uint256 tokenId; uint256 resource; }',
  'function getState(uint256 anyId) view returns (State state)',
  'function getResolver(string label) view returns (address)',
])

/** `IPermissionedRegistry.Status.REGISTERED` */
const STATUS_REGISTERED = 2

// Comfortably covers the commitment cooldown plus relayer latency. Permits are
// single-use (nonce-bound), so a generous deadline is not a replay risk.
const PERMIT_DEADLINE_SECONDS = 60 * 60

/**
 * NO explicit destination `gasLimit` is sent for cross-chain legs.
 *
 * `gasLimit` is a PRICE INPUT on this route, not a safety bound: the
 * orchestrator bills the destination fill on the limit it is given, so the
 * reference route's flat 1_200_000 cost ~12.5 USDC of "gas" for a batch that
 * uses a fraction of it — more than the leg was delivering, which is exactly
 * how this route earned `FEE_EXCEEDS_BALANCE`. Omitting it lets the
 * orchestrator size the fill from the actual destination calls, which is both
 * cheaper and self-correcting as the batch changes.
 */

/**
 * USDC (6dp) the REVEAL leg is over-funded by.
 *
 * The two legs fail differently when the delivery is short, so only one of them
 * needs padding:
 *
 *  - Commit: the planner rejects the route up front with
 *    `FEE_EXCEEDS_BALANCE`, and the transport retries with the fee the
 *    orchestrator just quoted. A tight floor costs one extra round-trip, not a
 *    failure — so the commit gets NO headroom.
 *  - Reveal: the delivery also has to pay the registrar. Underfund it and
 *    `register` reverts ON-CHAIN, mid-batch, after the commitment has been paid
 *    for. That is not a planning error, so the retry never sees it and cannot
 *    rescue it. This headroom is the margin that keeps it from happening.
 */
const CROSS_CHAIN_REVEAL_HEADROOM_USDC = 1_000_000n

/**
 * How much room the source cap leaves above the destination floor, as a
 * numerator/denominator pair, plus a flat bridging margin.
 *
 * This is the ceiling on what the transport may request — and therefore the
 * number the user sees in the permit prompt — so it has to cover the gap
 * between our floor and the orchestrator's real quote without being gratuitous.
 *
 * The margin is sized off measurement, not intuition: `originGas` on Base
 * Sepolia is ~0.02 USDC, so 0.25 is already an order of magnitude of slack. An
 * earlier flat 5-USDC-per-leg figure was pure invention and by itself doubled
 * the permit ask.
 */
const SOURCE_BRIDGING_MARGIN_USDC = 250_000n

/**
 * The orchestrator's fee allowance, as a multiple of the leg's same-chain
 * quote.
 *
 * The planner takes its fee OUT OF THE SOURCE and delivers what is left:
 *
 *     source = fee + delivered
 *
 * Measured Base Sepolia → Sepolia: a source of 8.89 USDC was billed a 4.35
 * fee, leaving 4.54 deliverable, against a same-chain commit quote of 3.45 —
 * so the fee runs ~1.26x the same-chain cost of the same batch. 1.75x is that
 * with room, since `estimateHcaBudget` can only ever quote the same-chain
 * shape (the cross-chain one needs a permit that does not exist until after
 * the budget has sized it).
 *
 * Getting this relationship backwards is what produced both planning failures:
 * inflating the DELIVERY to cover the fee (`FEE_EXCEEDS_BALANCE`), then
 * leaving the SOURCE too thin to pay it (`INSUFFICIENT_BALANCE`).
 */
const FEE_ALLOWANCE_NUMERATOR = 7n
const FEE_ALLOWANCE_DENOMINATOR = 4n

/** Source-side fee headroom for a leg quoted at `legCost` same-chain. */
export function bridgeFeeAllowance(legCost: bigint): bigint {
  return (legCost * FEE_ALLOWANCE_NUMERATOR) / FEE_ALLOWANCE_DENOMINATOR
}

/**
 * The source-chain budget cap needed to deliver `destinationAmount` on the
 * destination chain.
 *
 * The transport re-quotes the pull DOWN to exactly what the route claims before
 * signing, so a cap above the real cost is never actually pulled — it only
 * bounds the permit allowance and the adaptive fee retry.
 */
export function crossChainSourceCap(
  destinationAmount: bigint,
  legCost: bigint,
): bigint {
  if (destinationAmount <= 0n) return 0n
  // source = delivered + fee. Not a multiple of the delivery: the fee tracks
  // the batch's execution cost, which has nothing to do with how much USDC the
  // HCA needs on the far side.
  return (
    destinationAmount +
    bridgeFeeAllowance(legCost) +
    SOURCE_BRIDGING_MARGIN_USDC
  )
}

/**
 * USDC the commit leg must have DELIVERED to the HCA on the destination.
 *
 * This is what lands in the HCA, not what the route costs — the fee is charged
 * separately against the source (see `bridgeFeeAllowance`). It only has to seed
 * the HCA for `enableSessionWithRefund` to refund execution from, so the
 * same-chain leg quote is the right scale. Inflating it to cover the fee was
 * the bug: it raised the delivery the source had to fund AFTER the fee had
 * already been taken out of that same source.
 */
export function crossChainCommitTarget(budget: HcaBudgetBreakdown): bigint {
  return budget.commitCost
}

/**
 * USDC the reveal leg must have delivered: the register cost plus the price.
 *
 * `livePrice` overrides the budget's snapshot when it is higher. The price is
 * re-read immediately before the reveal and can have moved (premium decay runs
 * continuously), and the batch's own `approve` + `register` pay it from the
 * HCA — so a delivery sized on a stale, lower quote reverts the fill.
 */
export function crossChainRevealTarget(
  budget: HcaBudgetBreakdown,
  livePrice?: bigint,
): bigint {
  const price =
    livePrice !== undefined && livePrice > budget.registrationPrice
      ? livePrice
      : budget.registrationPrice
  // Delivered, not spent on fees: the registrar payment plus enough to refund
  // the batch's own execution.
  return budget.registerCost + price + CROSS_CHAIN_REVEAL_HEADROOM_USDC
}

/**
 * The total the wallet authorizes on the source chain — the permit value.
 *
 * Signed ONCE, for both legs. The commit leg's `transferFrom` consumes part of
 * the allowance and the reveal leg's consumes the rest, exactly as the
 * reference route splits `CROSS_CHAIN_SOURCE_AMOUNT`.
 */
export function crossChainTotalSourceCap(budget: HcaBudgetBreakdown): bigint {
  return (
    crossChainSourceCap(crossChainCommitTarget(budget), budget.commitCost) +
    crossChainSourceCap(crossChainRevealTarget(budget), budget.registerCost)
  )
}

/**
 * The source-chain pre-claim ops for a leg: the EIP-2612 permit (commit leg
 * only — the allowance it sets covers both) followed by the wallet→Nexus pull.
 *
 * `HCAFundingSessionValidator._validateFundingOperation` accepts nothing else
 * on `sourceToken`, and requires exactly one pull whose amount equals the
 * Permit2 claim — the transport rewrites `pullCap` to the quoted claim before
 * signing, so the amount here is only the upper bound.
 */
function buildSourceFundingCalls(params: {
  sourceUsdc: Address
  wallet: Address
  nexus: Address
  pullCap: bigint
  permit?: PermitSignature
}): Call[] {
  const calls: Call[] = []
  if (params.permit) {
    calls.push({
      to: params.sourceUsdc,
      value: 0n,
      data: encodeFunctionData({
        abi: erc2612Abi,
        functionName: 'permit',
        args: [
          params.permit.owner,
          params.permit.spender,
          params.permit.value,
          params.permit.deadline,
          params.permit.v,
          params.permit.r,
          params.permit.s,
        ],
      }),
    })
  }
  calls.push({
    to: params.sourceUsdc,
    value: 0n,
    data: encodeFunctionData({
      abi: erc2612Abi,
      functionName: 'transferFrom',
      args: [params.wallet, params.nexus, params.pullCap],
    }),
  })
  return calls
}

/** Read the wallet's remaining source-USDC allowance to the funding Nexus. */
function readNexusAllowance(params: {
  publicClient: PublicClient
  sourceUsdc: Address
  wallet: Address
  nexus: Address
}): Promise<bigint> {
  return readContract(params.publicClient, {
    address: params.sourceUsdc,
    abi: erc2612Abi,
    functionName: 'allowance',
    args: [params.wallet, params.nexus],
  })
}

/** Shared guard: a cross-chain leg is unbuildable without these. */
function requireCrossChainInputs(
  leg: 'commit' | 'reveal',
  params: { nexusAddress?: Address; budget?: HcaBudgetBreakdown },
): asserts params is { nexusAddress: Address; budget: HcaBudgetBreakdown } {
  if (params.nexusAddress && params.budget) return
  throw new Error(
    `Cross-chain ${leg} needs the source Nexus address and the live budget ` +
      'breakdown to size the wallet pull. Received: ' +
      `nexusAddress=${params.nexusAddress ?? 'MISSING'}, ` +
      `budget=${params.budget ? 'present' : 'MISSING'}`,
  )
}

/**
 * Commit leg: pull ONLY this leg's quoted cost.
 *
 * The registration price stays in the wallet until the reveal — the
 * deferred-funding rule from the standalone-HCA spec — so a commit that never
 * gets revealed strands only the commit's own cost.
 *
 * The permit rides along here (this is the leg that sets the allowance) and is
 * signed for BOTH legs; the reveal pulls from the remainder with no second
 * signature.
 */
function buildCommitCrossChainLeg(params: {
  sourceChainId?: number
  nexusAddress?: Address
  budget?: HcaBudgetBreakdown
  wallet: Address
  permit?: PermitSignature
}): CrossChainLegParams | undefined {
  const { sourceChainId } = params
  if (sourceChainId === undefined) return undefined
  requireCrossChainInputs('commit', params)

  const sourceUsdc = getSourceContracts(sourceChainId).usdc
  const destinationAmount = crossChainCommitTarget(params.budget)
  const sourceCap = crossChainSourceCap(
    destinationAmount,
    params.budget.commitCost,
  )
  return {
    sourceChainId,
    sourceUsdc,
    sourceCap,
    destinationAmount,
    sourceCalls: buildSourceFundingCalls({
      sourceUsdc,
      wallet: params.wallet,
      nexus: params.nexusAddress,
      pullCap: sourceCap,
      ...(params.permit ? { permit: params.permit } : {}),
    }),
  }
}

/**
 * Reveal leg: pull whatever the commit left behind.
 *
 * The budget is the residual allowance, read on-chain rather than threaded
 * through from the commit. The commit's pull was settled against the
 * orchestrator's quote at signing time, so its exact size is only knowable
 * after the fact — and reading it back here also survives a retried or resumed
 * reveal, where no in-memory figure would.
 */
async function buildRevealCrossChainLeg(params: {
  sourceChainId?: number
  nexusAddress?: Address
  budget?: HcaBudgetBreakdown
  wallet: Address
  livePrice: bigint
  publicClient: PublicClient
}): Promise<CrossChainLegParams | undefined> {
  const { sourceChainId } = params
  if (sourceChainId === undefined) return undefined
  requireCrossChainInputs('reveal', params)

  const sourceUsdc = getSourceContracts(sourceChainId).usdc
  const sourceCap = await readNexusAllowance({
    publicClient: params.publicClient,
    sourceUsdc,
    wallet: params.wallet,
    nexus: params.nexusAddress,
  })
  if (sourceCap === 0n) {
    throw new Error(
      'The funding Nexus has no remaining allowance on the source chain. The ' +
        'commit leg either consumed the whole permit or the permit expired; ' +
        're-run the funding permit before revealing.',
    )
  }
  return {
    sourceChainId,
    sourceUsdc,
    sourceCap,
    destinationAmount: crossChainRevealTarget(params.budget, params.livePrice),
    // No permit: the commit leg's covers both legs.
    sourceCalls: buildSourceFundingCalls({
      sourceUsdc,
      wallet: params.wallet,
      nexus: params.nexusAddress,
      pullCap: sourceCap,
    }),
  }
}

/** The standalone-HCA registrar for a chain (for the shared cooldown spine). */
export function hcaRegistrarAddress(chainId: number): Address {
  return getDestinationContracts(chainId).ethRegistrar
}

/**
 * Read the USDC (6dp) an intent will spend, from `intentCost.tokensSpent`.
 *
 * NOT `tokensReceived`: that array describes tokens the orchestrator delivers
 * TO the account to satisfy `tokenRequests`, so on this route -- same-chain,
 * nothing bridged in, `tokenRequests: []` -- it is ALWAYS `[]` and reading
 * `[0].amountSpent` always yielded `undefined`. Every budget therefore fell
 * back to the local gas model while reporting itself as a quote failure, which
 * is what the 3% buffer was quietly compensating for. Verified live: a
 * commit-only intent returns `tokensReceived: []` alongside
 * `tokensSpent: {11155111: {<usdc>: {locked: '0', unlocked: '905736'}}}` and
 * `gasCost.totalUSD: 0.9065`, i.e. `unlocked` IS the cost, in 6dp USDC.
 *
 * `locked` covers funds already committed to a resource lock; both are spent
 * by the account, so the cost is their sum.
 *
 * Returns `null` if the quote can't be read, `0n` if it prices the intent at
 * nothing (see `declaresZeroCost`).
 */
export function readUsdcSpend(
  cost: IntentCostShape | undefined,
  chainId: number,
): bigint | null {
  const perToken = cost?.tokensSpent?.[String(chainId)]

  // The orchestrator echoes token addresses LOWERCASED while our contract
  // constants are checksummed, so an exact key lookup silently misses and
  // degrades to the fallback -- the same class of bug this function fixes.
  const usdc = getDestinationContracts(chainId).usdc.toLowerCase()
  const entry = perToken
    ? Object.entries(perToken).find(
        ([token]) => token.toLowerCase() === usdc,
      )?.[1]
    : undefined

  if (!entry) return cost && declaresZeroCost(cost) ? 0n : null

  return BigInt(entry.locked ?? '0') + BigInt(entry.unlocked ?? '0')
}

/**
 * Whether the quote affirmatively prices the intent at nothing.
 *
 * Only consulted when `tokensSpent` carries no entry for our token, because an
 * empty `tokensSpent` is ambiguous: it means EITHER "this intent is free" OR
 * "this quote has no cost data". Treating both as unreadable is what breaks the
 * E2E orchestrator, which fills nothing in and settles every leg for free:
 *
 *   tokensSpent: {}, tokensReceived: [],
 *   gasCost: {destination: {chainId: 11155111, gasUSD: 0}, totalUSD: 0},
 *   feeBreakdownUSD: {..., totalFeeUSD: 0}
 *
 * A total of exactly $0 disambiguates it — the orchestrator has priced the
 * intent and the price is zero, so `0n` is the true spend rather than a guess.
 *
 * Deliberately requires an explicit numeric zero: a quote that simply OMITS its
 * totals stays `null` and still trips the no-fallback guard, so a real quote
 * that fails to price a leg can never be mistaken for a free one.
 */
function declaresZeroCost(cost: IntentCostShape): boolean {
  const totals = [
    cost.feeBreakdownUSD?.totalFeeUSD,
    cost.gasCost?.totalUSD,
  ].filter((total): total is number => typeof total === 'number')

  return totals.length > 0 && totals.every((total) => total === 0)
}

/**
 * Read the USDC (6dp) an intent will spend, straight from a Rhinestone
 * `prepareTransaction` quote. This is the amount the orchestrator actually
 * pulls, so it is immune to the caller's local gas-price reads.
 */
async function quoteIntentSpendUsdc(
  account: RhinestoneSigner['account'],
  chain: Chain,
  calls: Call[],
  gasLimit: bigint,
  signers?: Transaction['signers'],
  /**
   * USDC (6dp) the HCA will hold by fill time but does not hold yet. Without
   * it the planner refuses to price any leg while the HCA sits below the fee,
   * and the budget silently degrades to the gas-limit fallback.
   */
  incomingUsdc?: bigint,
): Promise<QuoteLegResult> {
  const prepared = (await account.prepareTransaction({
    sourceChains: [chain],
    targetChain: chain,
    calls: [...calls],
    sponsored: { gas: false, bridging: false, swaps: false },
    feeAsset: 'USDC',
    tokenRequests: [],
    gasLimit,
    ...(incomingUsdc !== undefined && incomingUsdc > 0n
      ? {
          auxiliaryFunds: {
            [chain.id]: {
              [getDestinationContracts(chain.id).usdc]: incomingUsdc,
            },
          } as Transaction['auxiliaryFunds'],
        }
      : {}),
    ...(signers ? { signers } : {}),
  } as Transaction)) as PreparedQuote

  const route = prepared.intentRoute
  const spend = readUsdcSpend(route?.intentCost, chain.id)

  // The same response carries the orchestrator's own ETH/USDC prices and the
  // destination gas price. Surface them so the fallback model never needs the
  // internal `/deposit-processor/prices` route, which has no CORS headers and
  // therefore always failed in the browser.
  const meta = route?.intentOp?.signedMetadata
  const ethUsd = meta?.tokenPrices?.ETH
  const usdcUsd = meta?.tokenPrices?.USDC
  const gasPriceRaw = meta?.gasPrices?.[String(chain.id)]
  const market =
    ethUsd && ethUsd > 0 && usdcUsd && usdcUsd > 0 && gasPriceRaw
      ? {
          ethUsd8: BigInt(Math.round(ethUsd * 1e8)),
          usdcUsd8: BigInt(Math.round(usdcUsd * 1e8)),
          gasPriceWei: BigInt(gasPriceRaw),
        }
      : undefined

  return {
    // `readUsdcSpend` already encodes readability: `null` means the quote could
    // not be priced, `0n` means it was priced at nothing. Re-testing `> 0n`
    // here would collapse that second case back into "unreadable" and drop the
    // budget to the fallback model, which the no-fallback guard then turns into
    // a hard registration failure -- exactly what breaks against an
    // orchestrator that settles for free.
    spendUsdc: spend,
    ...(market ? { market } : {}),
  }
}

/**
 * Compute the same-chain HCA funding budget at runtime:
 * `commitCost + registerCost + 3%·registerCost + registrationPrice`.
 *
 * Prefers Rhinestone's per-leg quote (`prepareTransaction` → `intentCost`),
 * which reflects the exact USDC the orchestrator pulls and is immune to
 * Sepolia gas-price spikes. Falls back to a clamped gas-limit model per leg
 * when the account/session isn't available or a quote fails.
 */
/**
 * The subset of `intentCost` this module reads, keyed chain -> token.
 *
 * Mirrors the SDK's `IntentCost['tokensSpent']`, but deliberately re-declared
 * as loose/optional: the SDK types the amounts as required and `tokensReceived`
 * as a 1-tuple, while the wire really returns an empty array and may omit
 * fields. Trusting the SDK's shape here is what hid the empty `tokensReceived`.
 */
type IntentCostShape = {
  tokensSpent?: Record<
    string,
    Record<string, { locked?: string; unlocked?: string }>
  >
  /** Aggregate of gas + bridge + protocol + swap + settlement fees. */
  feeBreakdownUSD?: { totalFeeUSD?: number }
  gasCost?: { totalUSD?: number }
}

/** The subset of `prepareTransaction`'s response this module reads. */
type PreparedQuote = {
  intentRoute?: {
    intentCost?: IntentCostShape
    intentOp?: {
      signedMetadata?: {
        tokenPrices?: Record<string, number>
        gasPrices?: Record<string, string>
      }
    }
  }
}

/** The session-signed variant of the SDK's `signers` union. */
type SessionSigners = Extract<
  NonNullable<Transaction['signers']>,
  { type: 'experimental_session' }
>

/** Session-signed `signers` for a quote, or `undefined` to quote owner-signed. */
function sessionSigners(
  activeSession: RhinestoneSigner['session'],
): SessionSigners | undefined {
  if (!activeSession) return undefined
  // Cross-chain: the signer already carries a PerChainSessionSignerSet with
  // per-session enable-data — pass it through unchanged.
  if ('sessions' in activeSession) {
    return activeSession as SessionSigners
  }
  return {
    type: 'experimental_session',
    // Same-chain: the signer carries a single session — wrap it.
    session: (activeSession as { session: Session }).session,
    verifyExecutions: true,
  }
}

/** Attach first-use `enableData`, but only to an existing session signer. */
function withEnableData(
  signers: SessionSigners | undefined,
  enableData: SessionEnableData | undefined,
): SessionSigners | undefined {
  return signers && enableData ? { ...signers, enableData } : signers
}

export function estimateHcaBudgetActor(input: {
  name: string
  duration: bigint
  publicClient: PublicClient
  chainId: number
  signer?: Signer
  sessionEnable?: HcaSessionEnableParams
  /**
   * The primary name the reveal batch will set, when the user opted in. Must
   * be the SAME value handed to `submitRevealBatchActor` — it changes the
   * batch, and this budget sizes the funding permit.
   */
  primaryName?: string
}): ResultAsync<HcaBudgetBreakdown, Error> {
  const label = cleanLabel(input.name)
  const chainId = input.chainId

  // Build a best-effort per-leg quoter whenever we have a Rhinestone account.
  //
  // An active session is NOT required. A first-time user has no session at
  // budget time (it is enabled by the commit leg itself), so gating the quoter
  // on one meant new users could never quote and always fell through to the
  // fallback model — which, because the price service is unreachable from the
  // browser (see `estimateHcaBudget`), degrades further to a flat per-leg fee
  // and massively over-funds the HCA. Without a session we still quote, just
  // owner-signed: the batch shape (and therefore its cost) is the same.
  const rhinestone =
    input.signer?.type === 'rhinestone' ? input.signer : undefined
  const chain = input.publicClient.chain
  const activeSession = rhinestone?.session

  const quoteLegCostUsdc =
    rhinestone && chain
      ? async (leg: HcaLeg, incomingUsdc?: bigint): Promise<QuoteLegResult> => {
          const hca = rhinestone.account.getAddress() as Address
          const resolver = computeResolverAddress({ chainId, hca })
          const baseSigners = sessionSigners(activeSession)
          if (leg === 'commit') {
            // Quote the SAME shape `submitFundingAndCommitActor` submits: when
            // the session still needs enabling, the commit intent carries
            // `enableData` (first-use mode 05) AND an `enableSessionWithRefund`
            // call — both materially change the gas. The funding
            // permit/transferFrom pair is two cheap ERC-20 calls on top; the
            // `HCA_LEG_GAS_LIMITS.commit` bound (a proven upper bound over the
            // measured ~393k first-commit fill, which the rail prices the quote
            // on) covers them, so a successful quote never underfunds the HCA.
            const commitSigners = withEnableData(
              baseSigners,
              input.sessionEnable?.enableData,
            )
            const calls: Call[] = []
            if (input.sessionEnable) {
              const enableCall = buildEnableSessionWithRefundCall({
                chainId,
                permissionId: input.sessionEnable.permissionId,
                sessionKey: input.sessionEnable.sessionKey,
                validUntil: input.sessionEnable.validUntil,
                resolver,
              })
              calls.push({
                to: enableCall.to,
                value: enableCall.value,
                data: enableCall.data,
              })
            }
            const commitCall = buildCommitCall({
              chainId,
              commitment: `0x${'11'.repeat(32)}` as Hex,
            })
            calls.push({
              to: commitCall.to,
              value: commitCall.value,
              data: commitCall.data,
            })
            return quoteIntentSpendUsdc(
              rhinestone.account,
              chain,
              calls,
              HCA_LEG_GAS_LIMITS.commit,
              commitSigners,
              incomingUsdc,
            )
          }
          // register leg: full reveal batch at the current price (the session
          // is enabled by the commit, so no enableData here).
          const price = await readRegisterPrice({
            publicClient: input.publicClient,
            chainId,
            label,
            duration: input.duration,
          })
          const resolverCode = await input.publicClient.getCode({
            address: resolver,
          })
          const revealCalls = buildRevealBatch({
            chainId,
            hca,
            resolver,
            resolverDeployed: Boolean(resolverCode && resolverCode !== '0x'),
            label,
            // The name recipient (wallet). A placeholder is fine for a gas/cost
            // quote — the orchestrator prices the intent by size, not by owner.
            wallet: hca,
            secret: `0x${'22'.repeat(32)}` as Hex,
            price,
            duration: input.duration,
            // Quote the SAME batch `submitRevealBatchActor` submits.
            //
            // This is for fidelity, NOT for pricing. Measured against the live
            // orchestrator: an identical request differing only in this call
            // prices to the same USDC unit (450k gas limit, 5 vs 6 executions
            // → 3277666 both times). The rail prices `/intents/route` purely
            // on `destinationGasUnits`, so what actually funds this call is
            // `registerLegGasLimit` below.
            ...(input.primaryName ? { setPrimaryName: input.primaryName } : {}),
          })
          return quoteIntentSpendUsdc(
            rhinestone.account,
            chain,
            toCalls(revealCalls),
            registerLegGasLimit(input.primaryName),
            baseSigners,
            incomingUsdc,
          )
        }
      : undefined

  return fromPromise(
    (async () => {
      // Read the HCA balance here rather than relying on `checkingHcaFunding`,
      // which runs AFTER this state — the auxiliary-funds declaration must not
      // include funds the HCA already holds.
      const hcaBalanceUsdc = rhinestone
        ? await readHcaUsdcBalanceActor({
            hca: rhinestone.account.getAddress() as Address,
            publicClient: input.publicClient,
            chainId,
          }).unwrapOr(0n)
        : 0n

      const breakdown = await estimateHcaBudget({
        publicClient: input.publicClient,
        chainId,
        label,
        duration: input.duration,
        hcaBalanceUsdc,
        ...(input.primaryName ? { primaryName: input.primaryName } : {}),
        ...(quoteLegCostUsdc ? { quoteLegCostUsdc } : {}),
      })

      // `source` tells you whether the leg costs came from Rhinestone's own
      // quote or from the clamped gas-limit fallback. Without it there is no
      // way to tell which model actually sized the permit at runtime — a
      // silent fallback just over-funds and looks identical to a good quote.
      console.log('🔧 [REGISTRATION] HCA budget:', {
        source: breakdown.source,
        total: breakdown.total,
        commitCost: breakdown.commitCost,
        registerCost: breakdown.registerCost,
        registrationPrice: breakdown.registrationPrice,
        hcaBalanceUsdc,
        ...(breakdown.fallbackReasons
          ? { fallbackReasons: breakdown.fallbackReasons }
          : {}),
      })

      // Fail loudly instead of funding off a guess.
      //
      // The budget carries no buffer any more — it is the sum of two real
      // quotes plus the price — so a fallback is not a slightly-worse estimate,
      // it is an unpriced guess that will over- or under-fund. Now that
      // auxiliary funds let the planner price a low-balance HCA, a fallback
      // means something genuinely broke and the reason is worth surfacing.
      if (breakdown.source !== 'quote') {
        throw new Error(
          `HCA budget could not be quoted (source: ${breakdown.source}). ` +
            `Refusing to size the funding permit from the fallback model. ` +
            `Reasons: ${breakdown.fallbackReasons?.join('; ') ?? 'unknown'}`,
        )
      }

      return breakdown
    })(),
    (error) => (error instanceof Error ? error : new Error(String(error))),
  )
}

const toCalls = (calls: readonly HcaCall[]): Call[] =>
  calls.map((c) => ({ to: c.to, data: c.data, value: c.value }))

const cleanLabel = (name: string): string => name.replace(/\.eth$/, '')

/**
 * Everything the cross-chain (L2-funded) shape adds on top of the same-chain
 * one. Present together or not at all.
 */
interface CrossChainLegParams {
  /** Source chain the wallet's USDC is pulled from (e.g. Base Sepolia). */
  sourceChainId: number
  /** USDC on the source chain. */
  sourceUsdc: Address
  /** Pre-claim ops: the permit (commit leg only) plus the wallet→Nexus pull. */
  sourceCalls: Call[]
  /** Upper bound on the source pull; the transport re-quotes down from it. */
  sourceCap: bigint
  /** USDC the orchestrator must deliver to the HCA on the destination chain. */
  destinationAmount: bigint
}

/** User-paid request shape shared by both legs. */
function buildUserPaidRequest(params: {
  from: Address
  chainId: number
  calls: Call[]
  sessionEnableData?: SessionEnableData
  /**
   * USDC (6dp) this intent will pull into the HCA before it spends anything —
   * i.e. the funding permit's value. Omit when the batch carries no funding
   * pair. See `auxiliaryFunds` on `RhinestoneIntentParams` for why the planner
   * needs telling.
   */
  incomingUsdc?: bigint
  crossChain?: CrossChainLegParams
}): RhinestoneTransactionRequest {
  const contracts = getDestinationContracts(params.chainId)
  const { crossChain } = params

  // Cross-chain declares its inflow on the SOURCE chain and token: the USDC
  // arrives on Base during the intent's own pre-claim ops, so the planner
  // cannot see it yet. Declaring it on the destination instead (as the
  // same-chain leg does) tells the planner about liquidity on a chain where
  // none of it exists.
  const sourceAssets: SourceAssetAmount[] | undefined = crossChain && [
    {
      chainId: crossChain.sourceChainId,
      address: crossChain.sourceUsdc,
      amount: crossChain.sourceCap,
    },
  ]

  return {
    type: 'rhinestone-intent',
    from: params.from,
    chainId: params.chainId,
    rhinestoneParams: {
      calls: params.calls,
      feeAsset: 'USDC',
      ...(params.sessionEnableData
        ? { sessionEnableData: params.sessionEnableData }
        : {}),
      ...(crossChain
        ? {
            sourceChainId: crossChain.sourceChainId,
            sourceCalls: { [crossChain.sourceChainId]: crossChain.sourceCalls },
            sourceAssets,
            // What must LAND on the destination. Without it the orchestrator
            // has nothing to bridge for, builds no source element, and drops
            // the pre-claim ops on the floor.
            tokenRequests: [
              { address: contracts.usdc, amount: crossChain.destinationAmount },
            ],
            auxiliaryFunds: {
              [crossChain.sourceChainId]: {
                [crossChain.sourceUsdc]: crossChain.sourceCap,
              },
            },
            // Deliberately no `gasLimit` — see the note above the constants.
          }
        : params.incomingUsdc !== undefined && params.incomingUsdc > 0n
          ? {
              auxiliaryFunds: {
                [params.chainId]: { [contracts.usdc]: params.incomingUsdc },
              },
            }
          : {}),
    },
  }
}

/**
 * Read the HCA's USDC balance (standalone-deployment USDC). Used to skip the
 * funding permit when the HCA already holds enough from a prior registration.
 */
export function readHcaUsdcBalanceActor(input: {
  hca: Address
  publicClient: PublicClient
  chainId: number
}): ResultAsync<bigint, Error> {
  const contracts = getDestinationContracts(input.chainId)
  return fromPromise(
    readContract(input.publicClient, {
      address: contracts.usdc,
      abi: erc2612Abi,
      functionName: 'balanceOf',
      args: [input.hca],
    }),
    (error) => (error instanceof Error ? error : new Error(String(error))),
  )
}

/**
 * Sign the HCA funding permit — the SECOND (and last) wallet prompt:
 * EIP-2612 permit with `owner = wallet`, `spender = HCA`, `value = budget`.
 *
 * Cross-chain: the permit is signed on the SOURCE chain (`sourceChainId`, e.g.
 * Base Sepolia) over the source USDC, with the funding NEXUS as spender. It is
 * signed once, for both legs: the commit leg carries it as a pre-claim op and
 * the allowance it leaves behind funds the reveal leg's pull. `validUntil`
 * clamps the deadline — `HCAFundingSessionValidator` rejects any permit whose
 * deadline outlives the session.
 *
 * NOT a registrar allowance: the registrar is paid by the HCA itself inside
 * the reveal batch (`approve(price)` from the HCA's own balance).
 */
export function signFundingPermitActor(input: {
  wallet: Address
  hca: Address
  value: bigint
  approvalSigner: Signer
  publicClient: PublicClient
  chainId: number
  /** Cross-chain: source chain ID (e.g. Base Sepolia). When set, the
   * permit is signed on the source chain with `nexusAddress` as spender
   * instead of on the destination chain with `hca` as spender. */
  sourceChainId?: number
  /** Cross-chain: Nexus address on the source chain. Required when
   * `sourceChainId` is set. */
  nexusAddress?: Address
  /** Cross-chain: public client for the source chain. Required when
   * `sourceChainId` is set. */
  sourcePublicClient?: PublicClient
  /** Cross-chain: the funding session's expiry; caps the permit deadline. */
  sessionValidUntil?: bigint
}): ResultAsync<PermitSignature, Error> {
  if (input.approvalSigner.type !== 'eoa') {
    return errAsync(
      new Error('Funding permit requires an EOA signer (the wallet).'),
    )
  }
  const walletClient = input.approvalSigner.walletClient
  const account = walletClient.account
  if (!account) {
    return errAsync(new Error('EOA wallet client has no account connected'))
  }
  if (!isAddressEqual(account.address, input.wallet)) {
    return errAsync(
      new Error(
        `Permit signer ${account.address} does not match the wallet ${input.wallet}`,
      ),
    )
  }

  // For cross-chain the permit is signed on the source chain, over the source
  // token, with the Nexus as spender.
  //
  // Source and destination contracts live in SEPARATE chain-keyed tables:
  // Sepolia has no source entry and Base Sepolia has no destination entry, so
  // each branch must look its token up in its own table. Reading
  // `getDestinationContracts(sourceChainId)` unconditionally — as this did —
  // threw before the cross-chain branch could ever use its own value.
  const sourceChainId = input.sourceChainId
  const isCrossChain = sourceChainId !== undefined
  const permitChainId = sourceChainId ?? input.chainId
  const permitPublicClient = isCrossChain
    ? (input.sourcePublicClient ?? input.publicClient)
    : input.publicClient
  const usdc = isCrossChain
    ? getSourceContracts(sourceChainId).usdc
    : getDestinationContracts(input.chainId).usdc

  if (isCrossChain && !input.nexusAddress) {
    return errAsync(
      new Error(
        'Cross-chain funding permit needs the source Nexus address as spender: ' +
          'the HCA cannot claim on the source chain, so a permit made out to it ' +
          'leaves the Nexus with no allowance to pull.',
      ),
    )
  }
  const spender = isCrossChain ? (input.nexusAddress as Address) : input.hca

  return fromPromise(
    (async () => {
      const nonce = await readContract(permitPublicClient, {
        address: usdc,
        abi: erc2612Abi,
        functionName: 'nonces',
        args: [input.wallet],
      })

      // Prefer ERC-5267 `eip712Domain()`; fall back to `name()` + `version()`.
      // Circle's Sepolia USDC (FiatTokenV2_2) does NOT implement ERC-5267 (it
      // reverts), and its EIP-712 domain version is "2" — so the fallback MUST
      // read the token's `version()` getter, not assume "1", or the permit
      // signature is computed over the wrong domain and reverts with
      // `EIP2612: invalid signature`.
      let domain: {
        name: string
        version: string
        chainId: number
        verifyingContract: Address
      }
      try {
        const resolved = await getEip712Domain(permitPublicClient, {
          address: usdc,
        })
        domain = {
          name: resolved.domain.name ?? '',
          version: resolved.domain.version ?? '1',
          chainId: Number(resolved.domain.chainId ?? permitChainId),
          verifyingContract:
            (resolved.domain.verifyingContract as Address) ?? usdc,
        }
      } catch {
        const [name, version] = await Promise.all([
          readContract(permitPublicClient, {
            address: usdc,
            abi: erc2612Abi,
            functionName: 'name',
          }),
          // `version()` is optional on ERC-2612 tokens; default to "1" only
          // when the token doesn't expose it.
          readContract(permitPublicClient, {
            address: usdc,
            abi: erc2612Abi,
            functionName: 'version',
          }).catch(() => '1'),
        ])
        domain = {
          name,
          version,
          chainId: permitChainId,
          verifyingContract: usdc,
        }
      }

      // Clamp to the session's expiry. `_validateFundingOperation` rejects a
      // permit whose deadline exceeds `SessionConfig.validUntil` (and one
      // already in the past), so an unclamped hour would fail the whole
      // funding batch whenever the session had less than an hour left.
      const requested = BigInt(
        Math.floor(Date.now() / 1000) + PERMIT_DEADLINE_SECONDS,
      )
      const deadline =
        input.sessionValidUntil !== undefined &&
        input.sessionValidUntil < requested
          ? input.sessionValidUntil
          : requested

      const signature = await signTypedData(walletClient, {
        account,
        domain,
        types: {
          Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        },
        primaryType: 'Permit',
        message: {
          owner: input.wallet,
          spender,
          value: input.value,
          nonce,
          deadline,
        },
      })

      const { r, s, v, yParity } = parseSignature(signature)

      return {
        owner: input.wallet,
        spender,
        value: input.value,
        deadline,
        v: Number(v ?? BigInt(yParity + 27)),
        r,
        s,
      } satisfies PermitSignature
    })(),
    (error) => (error instanceof Error ? error : new Error(String(error))),
  )
}

/**
 * Commit leg: fund the HCA (when needed), enable the session (when needed),
 * and submit the commitment — ONE session-signed, user-paid request. Deploys
 * the HCA lazily when absent. Generates the secret + commitment here so the
 * reveal binds to the exact same inputs.
 *
 * Cross-chain: the permit + `transferFrom` pair moves to `sourceCalls` — they
 * run on the SOURCE chain as the intent's pre-claim ops, moving the wallet's
 * Base USDC into the funding Nexus, which then claims and bridges. The
 * destination `calls` carry only `enableSession + commit`. This leg pulls just
 * its own quoted cost; the registration price stays in the wallet until the
 * reveal (the doc's deferred-funding rule).
 */
export function submitFundingAndCommitActor(input: {
  name: string
  wallet: Address
  hca: Address
  duration: bigint
  permit?: PermitSignature
  sessionEnable?: HcaSessionEnableParams
  signer: Signer
  publicClient: PublicClient
  id?: string
  /** Cross-chain funding source chain. When set, the permit + transferFrom
   * pair is emitted as source-chain pre-claim ops instead of destination
   * calls. */
  sourceChainId?: number
  /** Cross-chain: Nexus address on the source chain — the pull recipient and
   * the intent's sender. Required when `sourceChainId` is set. */
  nexusAddress?: Address
  /** Cross-chain: the live budget breakdown, which sizes both legs. Required
   * when `sourceChainId` is set. */
  budget?: HcaBudgetBreakdown
}): ResultAsync<
  { txId: string; resolverAddress: Address; commitment: CommitmentData },
  Error
> {
  return fromPromise(
    (async () => {
      // INVARIANT: a funding permit REQUIRES the session-enable proof in the
      // same batch.
      //
      // `HCAOwnerAndSessionValidator` only tolerates the `permit` +
      // `transferFrom` pair inside `_checkInitialRegistrationPolicy`, which is
      // reached by presenting the proof and which strips enable + permit +
      // transfer before applying the fixed policy. Without the proof the pair
      // falls through to `_checkRegistrationExecutions`, whose payment-token
      // branch allows ONLY `approve`:
      //
      //   if (selector != APPROVE_SELECTOR)
      //       revert ActionNotAllowed(execution.target, selector);
      //
      // That reverts `ActionNotAllowed(USDC, 0xd505accf)` (0xde1834f2), which
      // the emissary re-wraps as `InvalidSignature()` (0x8baa579f) — an error
      // that says nothing about the real cause. Fail here instead, where the
      // message can name it.
      // Check `enableData` itself, NOT just its wrapper.
      //
      // Testing `!input.sessionEnable` let a hollow object through: the enable
      // CALL is built from `.permissionId`/`.sessionKey`/`.validUntil` below,
      // while the PROOF is `.enableData`, so a payload carrying the first three
      // and not the fourth produced a batch that contained
      // `enableSessionWithRefund` yet signed without the proof. The SDK picks
      // the mode purely from `signers.enableData` being truthy
      // (`packStandaloneHcaFixedSessionSignature`: truthy -> 0x05 with proof,
      // falsy + gas refund -> 0x02), so an absent proof silently downgrades to
      // 0x02 and the validator then rejects `permit`. That is precisely the
      // failure this guard exists to prevent, and it walked straight past it.
      //
      // Cross-chain is exempt: there the permit is a SOURCE-chain pre-claim op
      // policed by `HCAFundingSessionValidator`, never a destination call, so
      // it never reaches the destination validator's registration policy and
      // needs no proof to be tolerated.
      const isCrossChain = input.sourceChainId !== undefined
      if (input.permit && !isCrossChain && !input.sessionEnable?.enableData) {
        throw new Error(
          'HCA funding permit requires the session-enable proof in the same ' +
            'batch: the validator rejects USDC.permit outside the initial ' +
            'registration policy path (ActionNotAllowed(USDC, permit), masked ' +
            'as InvalidSignature()). Attach `sessionEnable.enableData` ' +
            'whenever `permit` is set. Received: ' +
            `sessionEnable=${input.sessionEnable ? 'present' : 'MISSING'}, ` +
            `enableData=${input.sessionEnable?.enableData ? 'present' : 'MISSING'}, ` +
            `permissionId=${input.sessionEnable?.permissionId ?? 'MISSING'}`,
        )
      }

      const chainId = input.publicClient.chain?.id ?? sepolia.id
      const contracts = getDestinationContracts(chainId)
      const label = cleanLabel(input.name)

      const resolverAddress = computeResolverAddress({
        chainId,
        hca: input.hca,
      })

      // Fresh secret per attempt; the commitment binds label/wallet/secret/
      // resolver/duration — the reveal must reuse ALL of them.
      const secret = bytesToHex(
        crypto.getRandomValues(new Uint8Array(32)),
      ) as Hex
      const commitment = await readCommitment({
        publicClient: input.publicClient,
        chainId,
        label,
        wallet: input.wallet,
        secret,
        resolver: resolverAddress,
        duration: input.duration,
      })

      const calls: Call[] = []

      // Funding pair — same-chain only. Cross-chain emits the identical pair
      // as SOURCE-chain pre-claim ops instead (see `crossChainLeg` below):
      // the wallet's USDC sits on Base, so a destination-chain
      // `transferFrom` would move nothing.
      if (input.permit && !isCrossChain) {
        calls.push({
          to: contracts.usdc,
          value: 0n,
          data: encodeFunctionData({
            abi: erc2612Abi,
            functionName: 'permit',
            args: [
              input.permit.owner,
              input.permit.spender,
              input.permit.value,
              input.permit.deadline,
              input.permit.v,
              input.permit.r,
              input.permit.s,
            ],
          }),
        })
        calls.push({
          to: contracts.usdc,
          value: 0n,
          data: encodeFunctionData({
            abi: erc2612Abi,
            functionName: 'transferFrom',
            args: [input.permit.owner, input.hca, input.permit.value],
          }),
        })
      }

      // Session enablement — only until the on-chain enable lands.
      if (input.sessionEnable) {
        const enableCall = buildEnableSessionWithRefundCall({
          chainId,
          permissionId: input.sessionEnable.permissionId,
          sessionKey: input.sessionEnable.sessionKey,
          validUntil: input.sessionEnable.validUntil,
          resolver: resolverAddress,
        })
        calls.push({
          to: enableCall.to,
          value: enableCall.value,
          data: enableCall.data,
        })
      }

      const commitCall = buildCommitCall({
        chainId,
        commitment,
      })
      calls.push({
        to: commitCall.to,
        value: commitCall.value,
        data: commitCall.data,
      })

      const crossChainLeg = buildCommitCrossChainLeg({
        sourceChainId: input.sourceChainId,
        nexusAddress: input.nexusAddress,
        budget: input.budget,
        wallet: input.wallet,
        permit: input.permit,
      })

      const request = buildUserPaidRequest({
        from: input.hca,
        chainId,
        calls,
        sessionEnableData: input.sessionEnable?.enableData,
        ...(crossChainLeg ? { crossChain: crossChainLeg } : {}),
        // Exactly the permit's value — the amount this batch pulls in,
        // and nothing the HCA already holds. `signFundingPermitActor` is
        // signed for `budget - balance`, so the permit value IS the
        // inflow; declaring the whole budget would double-count the
        // standing balance.
        //
        // Cross-chain declares its inflow on the SOURCE chain instead
        // (inside `buildUserPaidRequest`) — nothing lands on the
        // destination until the fill.
        ...(input.permit && !isCrossChain
          ? { incomingUsdc: input.permit.value }
          : {}),
      })

      const txId = transactionManager.startTransaction(
        { type: 'custom', request },
        input.signer,
        {
          id: input.id,
          description: `Set up registration for ${label}.eth`,
          publicClient: input.publicClient,
          timeout: 120_000,
        },
      )

      return {
        txId,
        resolverAddress,
        commitment: { commitment, secret },
      }
    })(),
    (error) => (error instanceof Error ? error : new Error(String(error))),
  )
}

/**
 * Verify a standalone-HCA registration on the NEW registry: the label must be
 * REGISTERED, `latestOwner` must be the WALLET (the registrar always assigns
 * the name to the wallet, never the HCA), and the registry resolver must be
 * the HCA's PermissionedResolver proxy.
 */
export function verifyHcaRegistrationActor(input: {
  name: string
  wallet: Address
  hca: Address
  publicClient: PublicClient
}): ResultAsync<{ verified: boolean }, Error> {
  return fromPromise(
    (async () => {
      const chainId = input.publicClient.chain?.id ?? sepolia.id
      const contracts = getDestinationContracts(chainId)
      const label = cleanLabel(input.name)
      const expectedResolver = computeResolverAddress({
        chainId,
        hca: input.hca,
      })

      const [state, registryResolver] = await Promise.all([
        readContract(input.publicClient, {
          address: contracts.ethRegistry,
          abi: permissionedRegistryAbi,
          functionName: 'getState',
          args: [BigInt(keccak256(stringToHex(label)))],
        }),
        readContract(input.publicClient, {
          address: contracts.ethRegistry,
          abi: permissionedRegistryAbi,
          functionName: 'getResolver',
          args: [label],
        }),
      ])

      const verified =
        Number(state.status) === STATUS_REGISTERED &&
        isAddressEqual(state.latestOwner, input.wallet) &&
        isAddressEqual(registryResolver, expectedResolver)

      return { verified }
    })(),
    (error) => (error instanceof Error ? error : new Error(String(error))),
  )
}

/**
 * Reveal leg: re-read the CURRENT price, then submit the exact-ordered reveal
 * batch session-signed (no wallet prompt, no enable data — the session was
 * enabled by the commit leg).
 *
 * Cross-chain: this is where the registration price is finally pulled. The
 * commit leg's permit already set the wallet→Nexus allowance for BOTH legs, so
 * the source calls here are a bare `transferFrom` — no second signature — and
 * the budget is whatever the commit did not consume.
 */
export function submitRevealBatchActor(input: {
  name: string
  wallet: Address
  hca: Address
  duration: bigint
  secret: Hex
  signer: Signer
  publicClient: PublicClient
  primaryName?: string
  id?: string
  /** Cross-chain funding source chain (e.g. Base Sepolia). */
  sourceChainId?: number
  /** Cross-chain: the funding Nexus — pull recipient and intent sender. */
  nexusAddress?: Address
  /** Cross-chain: public client for the source chain, to read the allowance. */
  sourcePublicClient?: PublicClient
  /** Cross-chain: the live budget breakdown, which sizes the delivery. */
  budget?: HcaBudgetBreakdown
}): ResultAsync<string, Error> {
  return fromPromise(
    (async () => {
      const chainId = input.publicClient.chain?.id ?? sepolia.id
      const label = cleanLabel(input.name)

      const resolverAddress = computeResolverAddress({
        chainId,
        hca: input.hca,
      })

      // Price MUST be read immediately before the reveal, never cached.
      const price = await readRegisterPrice({
        publicClient: input.publicClient,
        chainId,
        label,
        duration: input.duration,
      })

      const resolverCode = await input.publicClient.getCode({
        address: resolverAddress,
      })
      const resolverDeployed = Boolean(resolverCode && resolverCode !== '0x')

      const revealCalls = buildRevealBatch({
        chainId,
        hca: input.hca,
        resolver: resolverAddress,
        resolverDeployed,
        label,
        wallet: input.wallet,
        secret: input.secret,
        price,
        duration: input.duration,
        ...(input.primaryName ? { setPrimaryName: input.primaryName } : {}),
      })

      const crossChainLeg = await buildRevealCrossChainLeg({
        sourceChainId: input.sourceChainId,
        nexusAddress: input.nexusAddress,
        budget: input.budget,
        wallet: input.wallet,
        livePrice: price,
        publicClient: input.sourcePublicClient ?? input.publicClient,
      })

      const request = buildUserPaidRequest({
        from: input.hca,
        chainId,
        calls: toCalls(revealCalls),
        ...(crossChainLeg ? { crossChain: crossChainLeg } : {}),
      })

      const txId = transactionManager.startTransaction(
        { type: 'custom', request },
        input.signer,
        {
          id: input.id,
          description: `Register ${label}.eth`,
          publicClient: input.publicClient,
          timeout: 120_000,
        },
      )

      return txId
    })(),
    (error) => (error instanceof Error ? error : new Error(String(error))),
  )
}
