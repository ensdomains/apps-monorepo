/**
 * Standalone-HCA registration actors (user-paid USDC route).
 *
 * These target the STANDALONE-HCA deployment (via `@ens-apps/smart-account`'s
 * manifest) — a different contract set from the chain's ENS contracts, which the
 * pure-EOA path (portal) keeps using untouched.
 *
 * Route shape (per the "HCA: New" handoff doc; NO gas sponsorship):
 *   - Commit leg (first HCA action, session-signed, one request):
 *       USDC.permit(wallet, HCA, budget)        — only when funding is needed
 *       USDC.transferFrom(wallet, HCA, budget)  — only when funding is needed
 *       ETHRegistrar.commit(commitment)
 *     The same request lazily deploys the HCA. Like every session-signed
 *     intent, it carries the session authorization as `enableData`: the
 *     validator keeps no session state. `sponsored: { gas:false,
 *     bridging:false, swaps:false }`, `feeAsset: 'USDC'` — execution costs are
 *     refunded from the HCA's USDC.
 *   - Reveal leg (after cooldown, session-signed, no wallet prompt):
 *       price re-read immediately before; exact-ordered reveal batch from
 *       `buildRevealBatch` (deployProxy? → approve(price) → register(wallet) →
 *       setters → setNameWithHCA?).
 */

import { requireChainId } from '@ens-apps/config'
import {
  buildCommitCall,
  buildRevealBatch,
  computeResolverAddress,
  estimateHcaBudget,
  getDestinationContracts,
  HCA_LEG_GAS_LIMITS,
  type HcaBudgetBreakdown,
  type Call as HcaCall,
  type HcaLeg,
  type QuoteLegResult,
  readCommitment,
  readRegisterPrice,
  registerLegGasLimit,
  withBudgetDrift,
} from '@ens-apps/smart-account'
import { ethRegistrarCommitmentsSnippet } from '@ensdomains/ensjs-abi/v2/ethRegistrar'
import {
  permissionedRegistryGetResolverSnippet,
  permissionedRegistryGetStateSnippet,
  permissionedRegistryGetSubregistrySnippet,
} from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import type { Transaction } from '@rhinestone/sdk'
import {
  errAsync,
  fromPromise,
  fromThrowable,
  type ResultAsync,
} from 'neverthrow'
import type { Address, Chain, Hash, Hex, PublicClient } from 'viem'
import {
  bytesToHex,
  encodeFunctionData,
  formatUnits,
  isAddressEqual,
  keccak256,
  parseAbi,
  parseSignature,
  stringToHex,
  zeroAddress,
} from 'viem'
import { getEip712Domain, readContract, signTypedData } from 'viem/actions'
import { normalize } from 'viem/ens'
import { transactionManager } from '../../providers/transactionManager'
import type { RhinestoneSigner, Signer } from '../../types/signer.types'
import type {
  Call,
  RhinestoneTransactionRequest,
  SessionEnableData,
} from '../../types/transaction.types'
import {
  type PermitSignature,
  pollUntilVerified,
  type VerifyPollOptions,
} from './registration.actors'

type CommitmentData = {
  commitment: Hash
  secret: Hex
}

/** The session authorization threaded from the manager, sent with every leg. */
export interface HcaSessionEnableParams {
  readonly enableData: SessionEnableData
  readonly permissionId: Hex
  readonly sessionKey: Address
  readonly validUntil: bigint
}

const erc2612Abi = parseAbi([
  'function nonces(address owner) view returns (uint256)',
  'function name() view returns (string)',
  'function version() view returns (string)',
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
])

/** `IPermissionedRegistry.Status.REGISTERED` */
const STATUS_REGISTERED = 2

// `expiry` is `registerTime + duration`, so this only has to cover reveal →
// check latency. Far below any registerable duration, so a hostile
// minimum-duration registration can't hide inside it.
const EXPIRY_SLACK_SECONDS = 60n * 60n

// Comfortably covers the commitment cooldown plus relayer latency. Permits are
// single-use (nonce-bound), so a generous deadline is not a replay risk.
const PERMIT_DEADLINE_SECONDS = 60 * 60

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

/**
 * Session-signed `signers` for a quote, or `undefined` to quote owner-signed.
 * Carries the session authorization (`enableData`) exactly as the transport
 * will, so the quote prices the same envelope.
 */
function sessionSigners(
  activeSession: RhinestoneSigner['session'],
  enableData: SessionEnableData | undefined,
): SessionSigners | undefined {
  if (!activeSession) return undefined
  const authorization = enableData ?? activeSession.enableData
  return {
    type: 'experimental_session',
    session: activeSession.session,
    ...(authorization ? { enableData: authorization } : {}),
    verifyExecutions: true,
  }
}

/**
 * Decides whether `buildRevealBatch` prepends `deployProxy`, and therefore
 * whether `registerLegGasLimit` funds it. Shared so the budget and the
 * submitted batch cannot disagree.
 */
async function isResolverDeployed(params: {
  publicClient: PublicClient
  chainId: number
  hca: Address
}): Promise<boolean> {
  const code = await params.publicClient.getCode({
    address: computeResolverAddress({
      chainId: params.chainId,
      hca: params.hca,
    }),
  })
  return Boolean(code && code !== '0x')
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
  // This label prices the registration and sizes the funding permit, so a
  // non-canonical one funds a different name than the reveal batch registers.
  // Wrapped because the refusal must be an `err`, not a throw.
  const labelResult = fromThrowable(canonicalLabel, (error) =>
    error instanceof Error ? error : new Error(String(error)),
  )(input.name)
  if (labelResult.isErr()) return errAsync(labelResult.error)
  const label = labelResult.value

  const chainId = input.chainId

  // Build a best-effort per-leg quoter whenever we have a Rhinestone account.
  //
  // An active session is NOT required. A first-time user has no session at
  // budget time (it is authorized later in the flow), so gating the quoter
  // on one meant new users could never quote and always fell through to the
  // fallback model — which, because the price service is unreachable from the
  // browser (see `estimateHcaBudget`), degrades further to a flat per-leg fee
  // and massively over-funds the HCA. Without a session we still quote, just
  // owner-signed: the batch shape (and therefore its cost) is the same.
  const rhinestone =
    input.signer?.type === 'rhinestone' ? input.signer : undefined
  const chain = input.publicClient.chain
  const activeSession = rhinestone?.session

  // Takes `resolverDeployed` rather than reading it per call, so the batch and
  // the gas limit that funds it are built from one value.
  const makeQuoter = (resolverDeployed: boolean) =>
    rhinestone && chain
      ? async (leg: HcaLeg, incomingUsdc?: bigint): Promise<QuoteLegResult> => {
          const hca = rhinestone.account.getAddress() as Address
          const resolver = computeResolverAddress({ chainId, hca })
          const signers = sessionSigners(
            activeSession,
            input.sessionEnable?.enableData,
          )
          if (leg === 'commit') {
            // Quote the SAME shape `submitFundingAndCommitActor` submits. The
            // funding permit/transferFrom pair is two cheap ERC-20 calls on
            // top; the `HCA_LEG_GAS_LIMITS.commit` bound covers them, so a
            // successful quote never underfunds the HCA.
            const calls: Call[] = []
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
              signers,
              incomingUsdc,
            )
          }
          // register leg: full reveal batch at the current price, signed with
          // the same session authorization as the commit.
          const price = await readRegisterPrice({
            publicClient: input.publicClient,
            chainId,
            label,
            duration: input.duration,
          })
          const revealCalls = buildRevealBatch({
            chainId,
            hca,
            resolver,
            resolverDeployed,
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
            // on `destinationGasUnits`, so what actually funds these calls is
            // `registerLegGasLimit` below, built from the same inputs.
            ...(input.primaryName ? { setPrimaryName: input.primaryName } : {}),
          })
          return quoteIntentSpendUsdc(
            rhinestone.account,
            chain,
            toCalls(revealCalls),
            registerLegGasLimit({
              isResolverDeployed: resolverDeployed,
              ...(input.primaryName ? { primaryName: input.primaryName } : {}),
            }),
            signers,
            incomingUsdc,
          )
        }
      : undefined

  return fromPromise(
    (async () => {
      const hca = rhinestone
        ? (rhinestone.account.getAddress() as Address)
        : undefined

      // Read the HCA balance here rather than relying on `checkingHcaFunding`,
      // which runs AFTER this state — the auxiliary-funds declaration must not
      // include funds the HCA already holds.
      const hcaBalanceUsdc = hca
        ? await readHcaUsdcBalanceActor({
            hca,
            publicClient: input.publicClient,
            chainId,
          }).unwrapOr(0n)
        : 0n

      // One read, feeding both the batch and the limit that funds it. Not
      // caught: an unsized leg must fail loudly, not fund the permit short.
      const resolverDeployed = hca
        ? await isResolverDeployed({
            publicClient: input.publicClient,
            chainId,
            hca,
          })
        : false

      const quoteLegCostUsdc = makeQuoter(resolverDeployed)

      const breakdown = await estimateHcaBudget({
        publicClient: input.publicClient,
        chainId,
        label,
        duration: input.duration,
        hcaBalanceUsdc,
        isResolverDeployed: resolverDeployed,
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
 * The label for a call that will be signed, hashed or registered.
 *
 * `keccak256(label)` is the name's identity, so a non-canonical label buys a
 * different name than the confirm step displayed and priced. The app
 * canonicalises at the entry of the flow; this is the last line before the
 * wallet, and it refuses rather than signs.
 */
const canonicalLabel = (name: string): string => {
  const label = cleanLabel(name)

  // `normalize` throws on a label ENS can never issue; its own error says
  // which, so let it through.
  const normalized = normalize(label)

  if (normalized !== label) {
    throw new Error(
      `Refusing to register "${label}": its canonical form is "${normalized}", so it would register a different name than the one shown.`,
    )
  }

  return label
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
}): RhinestoneTransactionRequest {
  const contracts = getDestinationContracts(params.chainId)
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
      ...(params.incomingUsdc !== undefined && params.incomingUsdc > 0n
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
 * Bounds a funding permit's value must satisfy before the wallet is asked to
 * sign it. Both are optional and independent — each rules out a different way
 * the value could be wrong.
 */
export interface PermitValueBounds {
  /**
   * Ceiling (USDC 6dp) derived WITHOUT the orchestrator's figures — the
   * on-chain registration price plus a fixed execution-cost margin
   * (`hcaBudgetMaximum`). Catches a quote that is simply too large, whatever
   * the user was or was not shown.
   */
  readonly expectedMaximum?: bigint
  /**
   * The USDC (6dp) figure the user was shown for THIS debit before the prompt.
   * Catches a value that is plausible on its own but is not the one consented
   * to. Only an upward divergence beyond `withBudgetDrift` refuses: being asked
   * to approve less than was displayed has not misled anyone, and the two
   * figures come from separate quotes that legitimately drift with gas.
   */
  readonly displayedValue?: bigint
}

/**
 * Why this permit value must not be signed, or `null` when it is in bounds.
 *
 * Pure and exported so the refusal is testable without a wallet: the whole
 * point of the check is that it happens BEFORE any signature is requested.
 */
export function rejectPermitValue(
  value: bigint,
  bounds: PermitValueBounds,
): string | null {
  if (bounds.expectedMaximum !== undefined && value > bounds.expectedMaximum) {
    return (
      `Refusing to request a signature: the funding permit would authorize ` +
      `${formatUnits(value, 6)} USDC, above the expected maximum of ` +
      `${formatUnits(bounds.expectedMaximum, 6)} USDC for this registration. ` +
      `The amount is quoted by the payment relayer and this bound is computed ` +
      `independently from the on-chain price, so a value above it means the ` +
      `quote cannot be trusted.`
    )
  }

  if (bounds.displayedValue !== undefined) {
    const allowed = withBudgetDrift(bounds.displayedValue)
    if (value > allowed) {
      return (
        `Refusing to request a signature: the funding permit would authorize ` +
        `${formatUnits(value, 6)} USDC, but ` +
        `${formatUnits(bounds.displayedValue, 6)} USDC was shown at checkout. ` +
        `Please start the registration again so the amount you approve is the ` +
        `amount you were quoted.`
      )
    }
  }

  return null
}

/**
 * Sign the HCA funding permit — the SECOND (and last) wallet prompt:
 * EIP-2612 permit with `owner = wallet`, `spender = HCA`, `value = budget`.
 *
 * NOT a registrar allowance: the registrar is paid by the HCA itself inside
 * the reveal batch (`approve(price)` from the HCA's own balance).
 *
 * `value` ultimately traces back to figures the orchestrator returned over
 * HTTP, so callers pass {@link PermitValueBounds} and this refuses outright
 * rather than prompting. Both are optional because one caller (a `hcaBudget`
 * override supplied by the app itself) has no orchestrator figure to bound.
 */
export function signFundingPermitActor(input: {
  wallet: Address
  hca: Address
  value: bigint
  approvalSigner: Signer
  publicClient: PublicClient
  chainId: number
  bounds?: PermitValueBounds
}): ResultAsync<PermitSignature, Error> {
  // Before anything else, including the RPC reads: a refusal must never reach
  // the wallet, and must not depend on a network round-trip succeeding first.
  const refusal = input.bounds
    ? rejectPermitValue(input.value, input.bounds)
    : null
  if (refusal) return errAsync(new Error(refusal))

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

  const contracts = getDestinationContracts(input.chainId)

  return fromPromise(
    (async () => {
      const [nonce, walletBalance] = await Promise.all([
        readContract(input.publicClient, {
          address: contracts.usdc,
          abi: erc2612Abi,
          functionName: 'nonces',
          args: [input.wallet],
        }),
        readContract(input.publicClient, {
          address: contracts.usdc,
          abi: erc2612Abi,
          functionName: 'balanceOf',
          args: [input.wallet],
        }),
      ])

      // Preflight the WALLET's balance before prompting for a signature.
      //
      // A permit only authorizes a transfer; it does not make one possible. The
      // pair is honoured by `transferFrom(wallet, HCA, value)` inside the
      // session-signed commit batch, where USDC checks the balance for real. A
      // wallet short by even one 6dp unit reverts that call, and because it is
      // one leg of an atomic batch the WHOLE intent fails — surfacing from the
      // orchestrator as `Simulation failed: UnclassifiedRevert` with
      // `errorSelector: 0x00000000`, which names neither the token nor the
      // shortfall and is not in the validator's error table (see
      // DEBUGGING_INTENTS.md). Catch it here, where both numbers are known.
      //
      // This bound is NOT the one the pricing UI enforces. That screen gates on
      // the registration PRICE; `value` is the funding shortfall for the whole
      // HCA BUDGET (price + both Rhinestone leg costs), which is materially
      // larger — on Sepolia an 8.00 USDC name has run to a ~20.20 USDC budget.
      // A wallet holding between the two passes the UI and then fails
      // simulation, which is exactly the window this check closes.
      if (walletBalance < input.value) {
        throw new Error(
          `Insufficient USDC to fund the registration. Need ` +
            `${formatUnits(input.value, 6)} USDC in ${input.wallet}, ` +
            `but it holds ${formatUnits(walletBalance, 6)} USDC ` +
            `(short by ${formatUnits(input.value - walletBalance, 6)} USDC). ` +
            `The funding amount covers the registration price plus the ` +
            `execution costs of both the commit and register legs, so it is ` +
            `larger than the price shown at checkout.`,
        )
      }

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
        const resolved = await getEip712Domain(input.publicClient, {
          address: contracts.usdc,
        })
        domain = {
          name: resolved.domain.name ?? '',
          version: resolved.domain.version ?? '1',
          chainId: Number(resolved.domain.chainId ?? input.chainId),
          verifyingContract:
            (resolved.domain.verifyingContract as Address) ?? contracts.usdc,
        }
      } catch {
        const [name, version] = await Promise.all([
          readContract(input.publicClient, {
            address: contracts.usdc,
            abi: erc2612Abi,
            functionName: 'name',
          }),
          // `version()` is optional on ERC-2612 tokens; default to "1" only
          // when the token doesn't expose it.
          readContract(input.publicClient, {
            address: contracts.usdc,
            abi: erc2612Abi,
            functionName: 'version',
          }).catch(() => '1'),
        ])
        domain = {
          name,
          version,
          chainId: input.chainId,
          verifyingContract: contracts.usdc,
        }
      }

      const deadline = BigInt(
        Math.floor(Date.now() / 1000) + PERMIT_DEADLINE_SECONDS,
      )

      // Observability contract — do not remove. The resume e2e counts wallet
      // prompts by matching this exact line, because the whole cost of a
      // resumed registration is meant to be ONE permit re-signature: the
      // permit is deliberately not persisted (1h deadline, untracked nonce),
      // so `checkingAllowance → signingPermit` re-signs it. A second prompt
      // means the flow restarted rather than resumed. Values are interpolated
      // into the string, not passed as an object arg — Playwright's
      // `msg.text()` renders object args as `JSHandle@object`, which is
      // unmatchable.
      console.log(
        `📊 [TRANSACTION MANAGER] Funding permit signing: wallet=${input.wallet} value=${input.value.toString()}`,
      )

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
          spender: input.hca,
          value: input.value,
          nonce,
          deadline,
        },
      })

      const { r, s, v, yParity } = parseSignature(signature)

      return {
        owner: input.wallet,
        spender: input.hca,
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
 * Commit leg: fund the HCA (when needed) and submit the commitment — ONE
 * session-signed, user-paid request. Deploys the HCA lazily when absent.
 * Generates the secret + commitment here so the reveal binds to the exact same
 * inputs.
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
}): ResultAsync<
  { txId: string; resolverAddress: Address; commitment: CommitmentData },
  Error
> {
  return fromPromise(
    (async () => {
      const chainId = requireChainId(input.publicClient, 'HCA registration')
      const contracts = getDestinationContracts(chainId)
      const label = canonicalLabel(input.name)

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

      // Funding pair — only when the HCA balance did not cover the budget.
      if (input.permit) {
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

      const commitCall = buildCommitCall({
        chainId,
        commitment,
      })
      calls.push({
        to: commitCall.to,
        value: commitCall.value,
        data: commitCall.data,
      })

      const request = buildUserPaidRequest({
        from: input.hca,
        chainId,
        calls,
        sessionEnableData: input.sessionEnable?.enableData,
        // Exactly the permit's value — the amount this batch pulls in, and
        // nothing the HCA already holds. `signFundingPermitActor` is signed for
        // `budget - balance`, so the permit value IS the inflow; declaring the
        // whole budget would double-count the standing balance.
        ...(input.permit ? { incomingUsdc: input.permit.value } : {}),
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
 * Verify that THIS flow's reveal registered the name — a pass sends the machine
 * to `success`, so "some registration exists" is not enough. Status, owner and
 * resolver are all caller-supplied `register` args, and registration is
 * permissionless in the owner, so an attacker can match all three.
 *
 * `commitmentAt == 0` is the unforgeable check: the preimage holds our secret,
 * `register` deletes what it consumes and `commit` only writes. Every path into
 * `commitmentCooldown` confirms the commitment first, so zero means consumed.
 */
export function verifyHcaRegistrationActor(
  input: {
    name: string
    wallet: Address
    hca: Address
    publicClient: PublicClient
    /** The commitment this flow's reveal consumed. */
    commitment: Hash
    /** Duration the commitment bound, to check the expiry we paid for. */
    duration: bigint
    /** The reveal intent's orchestrator id, when a resumed run persisted one. */
    intentId?: bigint
    /**
     * Orchestrator status lookup. `'FAILED'`/`'EXPIRED'` short-circuits the
     * grace poll — that intent will never fill, so polling the registry is
     * waiting for a state that cannot appear. Anything else (PENDING, null,
     * a thrown fetch) is inconclusive and falls back to the poll. Receives the
     * actor's abort signal so CANCEL interrupts the underlying request.
     */
    fetchIntentStatus?: (
      intentId: bigint,
      signal?: AbortSignal,
    ) => Promise<string | null>
  } & VerifyPollOptions,
): ResultAsync<
  {
    verified: boolean
    registeredToOther: boolean
    isUnregistered: boolean
    reason?: string
  },
  Error
> {
  const readRegistryState = async (): Promise<{
    verified: boolean
    registeredToOther: boolean
    isUnregistered: boolean
    reason?: string
  }> => {
    const chainId = requireChainId(input.publicClient, 'HCA registration')
    const contracts = getDestinationContracts(chainId)
    const label = canonicalLabel(input.name)
    const expectedResolver = computeResolverAddress({
      chainId,
      hca: input.hca,
    })

    const [state, registryResolver, registrySubregistry, commitTime] =
      await Promise.all([
        readContract(input.publicClient, {
          address: contracts.ethRegistry,
          abi: permissionedRegistryGetStateSnippet,
          functionName: 'getState',
          args: [BigInt(keccak256(stringToHex(label)))],
        }),
        readContract(input.publicClient, {
          address: contracts.ethRegistry,
          abi: permissionedRegistryGetResolverSnippet,
          functionName: 'getResolver',
          args: [label],
        }),
        readContract(input.publicClient, {
          address: contracts.ethRegistry,
          abi: permissionedRegistryGetSubregistrySnippet,
          functionName: 'getSubregistry',
          args: [label],
        }),
        readContract(input.publicClient, {
          address: contracts.ethRegistrar,
          abi: ethRegistrarCommitmentsSnippet,
          functionName: 'commitmentAt',
          args: [input.commitment],
        }),
      ])

    // Lost the race: registered, but to another wallet. No retry can win it
    // back, so the caller must stop rather than resubmit the reveal.
    const registeredToOther =
      Number(state.status) === STATUS_REGISTERED &&
      !isAddressEqual(state.latestOwner, input.wallet)

    const reason = firstFailure([
      [
        Number(state.status) === STATUS_REGISTERED,
        `label is not REGISTERED (status ${Number(state.status)})`,
      ],
      [
        isAddressEqual(state.latestOwner, input.wallet),
        `owner is ${state.latestOwner}, expected the wallet ${input.wallet}`,
      ],
      [
        isAddressEqual(registryResolver, expectedResolver),
        `resolver is ${registryResolver}, expected the HCA resolver ${expectedResolver}`,
      ],
      [
        // Our reveal sets none, and whoever did set it owns every name
        // beneath this one.
        isAddressEqual(registrySubregistry, zeroAddress),
        `subregistry is ${registrySubregistry}, expected none — this registration is not ours`,
      ],
      [
        BigInt(commitTime) === 0n,
        `our commitment is unconsumed (recorded at ${commitTime}), so a different reveal registered this name`,
      ],
      [
        BigInt(state.expiry) + EXPIRY_SLACK_SECONDS >=
          BigInt(Math.floor(Date.now() / 1000)) + input.duration,
        `expiry ${state.expiry} is shorter than the ${input.duration}s registered`,
      ],
    ])

    return reason
      ? {
          verified: false,
          registeredToOther,
          // Nothing holds the label: the reveal never landed, so `reason` can
          // only restate that. Callers then keep the failure that stopped it.
          isUnregistered: Number(state.status) !== STATUS_REGISTERED,
          reason,
        }
      : { verified: true, registeredToOther: false, isUnregistered: false }
  }

  // A definitive FAILED / EXPIRED from the orchestrator means the fill can
  // never land — the only thing the grace window would add is 30 seconds of
  // false hope in front of the retry screen. Anything else (PENDING, no id,
  // an unreachable orchestrator) is inconclusive and keeps the poll.
  const isRevealIntentDead = async (): Promise<boolean> => {
    if (input.intentId === undefined || !input.fetchIntentStatus) return false
    const status = await input.fetchIntentStatus(input.intentId, input.signal)
    return status === 'FAILED' || status === 'EXPIRED'
  }

  // Grace-polls: a Rhinestone intent keeps filling server-side after the tab
  // closes, so a resumed run reaches here before the reveal has confirmed.
  return fromPromise(
    pollUntilVerified(readRegistryState, {
      ...input,
      isDefinitivelyDead: isRevealIntentDead,
    }),
    (error) => (error instanceof Error ? error : new Error(String(error))),
  )
}

/** The first unmet condition's message, or `undefined` when all hold. */
function firstFailure(
  checks: readonly [boolean, string][],
): string | undefined {
  return checks.find(([held]) => !held)?.[1]
}

/**
 * Reveal leg: re-read the CURRENT price, then submit the exact-ordered reveal
 * batch session-signed (no wallet prompt). It carries the same session
 * authorization as the commit: the validator keeps no session state.
 */
export function submitRevealBatchActor(input: {
  name: string
  wallet: Address
  hca: Address
  duration: bigint
  secret: Hex
  sessionEnable?: HcaSessionEnableParams
  signer: Signer
  publicClient: PublicClient
  primaryName?: string
  id?: string
  /** Receives the orchestrator's intent id the moment the intent is accepted. */
  onIntentSubmitted?: (intentId: bigint) => void
}): ResultAsync<string, Error> {
  return fromPromise(
    (async () => {
      const chainId = requireChainId(input.publicClient, 'HCA registration')
      const label = canonicalLabel(input.name)

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

      const resolverDeployed = await isResolverDeployed({
        publicClient: input.publicClient,
        chainId,
        hca: input.hca,
      })

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

      const request = buildUserPaidRequest({
        from: input.hca,
        chainId,
        calls: toCalls(revealCalls),
        sessionEnableData: input.sessionEnable?.enableData,
      })

      const txId = transactionManager.startTransaction(
        {
          type: 'custom',
          request: input.onIntentSubmitted
            ? {
                ...request,
                rhinestoneParams: {
                  ...request.rhinestoneParams,
                  onIntentSubmitted: input.onIntentSubmitted,
                },
              }
            : request,
        },
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
