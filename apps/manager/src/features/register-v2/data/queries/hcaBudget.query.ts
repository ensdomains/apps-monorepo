import type { HcaBudgetBreakdown } from '@ens-apps/smart-account'
import type { Signer } from '@ens-apps/transaction-manager'
import {
  estimateHcaBudgetActor,
  type HcaSessionEnableParams,
  readHcaUsdcBalanceActor,
} from '@ens-apps/transaction-manager/machines/registration/registration.hca.actors'
import { logger } from '@ens-apps/utils/logger'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { keepPreviousData } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { chain } from '@/config'
import { publicClient } from '@/lib/wagmi'

/**
 * The USDC the standalone-HCA route actually pulls from the wallet, which is
 * NOT the registration price:
 *
 *     budget = registrationPrice + commitLegCost + registerLegCost
 *
 * The wallet signs one EIP-2612 permit for this whole amount and the commit
 * batch transfers it into the HCA, which then pays the registrar from its own
 * balance. A wallet that covers the price but not the budget used to clear
 * checkout and then fail the commit simulation with an unclassifiable revert
 * (`UnclassifiedRevert` / `errorSelector: 0x00000000`) — see
 * `packages/smart-account/DEBUGGING_INTENTS.md` §8.
 *
 * This runs the SAME estimator the registration machine runs in
 * `computingHcaBudget`, so the number shown at checkout is the number the
 * machine will size the permit from. Every input that moves the quote must
 * therefore be threaded through — see `primaryName` on
 * {@link HcaBudgetQueryParams}.
 */

/**
 * Each estimate costs TWO `prepareTransaction` round trips to the Rhinestone
 * orchestrator (one per leg), so this is deliberately long-lived. It only has
 * to be fresh enough to catch a gas regime change between opening the confirm
 * screen and pressing register; the machine re-quotes for real either way.
 */
const HCA_BUDGET_STALE_TIME_MS = 60_000

/**
 * The quoted budget plus the HCA's standing USDC balance.
 *
 * Both numbers are needed to know what the WALLET pays. The funding permit tops
 * the HCA up to the budget, so it is signed for `total - hcaBalance` (see
 * `registration.machine.ts` — signing for the full budget would re-fund the
 * leftover from every prior registration). A checkout gate that compares the
 * wallet against `total` therefore blocks a wallet that only has to cover the
 * shortfall.
 */
export type HcaBudgetQuote = HcaBudgetBreakdown & {
  /** The HCA's USDC balance, or `0n` when it could not be read. */
  readonly hcaBalance: bigint
}

/** The estimator refused to quote — "no budget", never "the budget is cheap". */
export class EstimateHcaBudgetError extends TaggedError(
  'EstimateHcaBudgetError',
)<{
  readonly cause: unknown
}> {}

/** The session-enable payload could not be resolved, so the commit leg is unquotable. */
export class HcaSessionEnableError extends TaggedError(
  'HcaSessionEnableError',
)<{
  readonly cause: unknown
}> {}

export interface HcaBudgetQueryParams {
  readonly label: string
  readonly durationInSeconds: number
  /** The HCA address — only used to key the cache per account. */
  readonly hca: Address | null
  readonly signer: Signer | null
  /**
   * The primary name the reveal batch will set, or `undefined` when the user
   * opted out. MUST match what `registrationUi.machine.ts` derives for
   * `START_REGISTRATION` (`${label}.eth` on the HCA path when the toggle is
   * on), because the opt-in widens the register leg's gas limit and the rail
   * prices the intent purely on `destinationGasUnits`.
   *
   * Omitting it here quotes a budget SMALLER than the one the machine sizes the
   * permit from, so a wallet holding the quoted amount clears checkout and then
   * fails the permit preflight — the exact failure this quote exists to catch.
   */
  readonly primaryName: string | undefined
  /**
   * Resolves the session-enable payload. Both legs are signed with it, so the
   * quote must be taken against the same envelope the machine will submit.
   */
  readonly getSessionEnablePayload: () => Promise<
    HcaSessionEnableParams | undefined
  >
}

const getHcaBudget = ResultFn(async function* (params: HcaBudgetQueryParams) {
  const sessionEnable = yield* fromPromise(
    params.getSessionEnablePayload(),
    (cause) => new HcaSessionEnableError({ cause }),
  )

  // The estimator refuses to return a fallback-sourced budget (it would over-
  // or under-fund), so an error here means "no quote", not "cheap".
  const budget = yield* estimateHcaBudgetActor({
    name: params.label,
    duration: BigInt(Math.ceil(params.durationInSeconds)),
    publicClient,
    chainId: chain.id,
    ...(params.signer ? { signer: params.signer } : {}),
    ...(sessionEnable ? { sessionEnable } : {}),
    ...(params.primaryName ? { primaryName: params.primaryName } : {}),
  }).mapErr((cause) => new EstimateHcaBudgetError({ cause }))

  // Read the standing balance the same way the machine does — including
  // `unwrapOr(0n)`. A failed read must fall back to "the HCA holds nothing",
  // i.e. gate on the whole budget: erring the other way would wave through a
  // wallet that then fails the commit simulation.
  const hcaBalance = params.hca
    ? await readHcaUsdcBalanceActor({
        hca: params.hca,
        publicClient,
        chainId: chain.id,
      }).unwrapOr(0n)
    : 0n

  return ok({ ...budget, hcaBalance } satisfies HcaBudgetQuote)
})

/**
 * Does this registration have a funding budget to quote at all? Only the
 * standalone-HCA route does; a pure-EOA signer pays the registrar directly.
 *
 * Exported because `fetchQuery` ignores `enabled`, so a caller that refuses to
 * proceed without a budget must ask this first or it blocks the EOA route too.
 */
export const isHcaBudgetQuoteRequired = (
  params: Pick<
    HcaBudgetQueryParams,
    'hca' | 'signer' | 'label' | 'durationInSeconds'
  >,
): boolean =>
  Boolean(params.hca) &&
  params.signer?.type === 'rhinestone' &&
  params.label.length > 0 &&
  params.durationInSeconds > 0

/**
 * On screen a refused quote only reads as an unknown fee, so the reason it was
 * refused would otherwise leave no trace. Wraps the whole pipeline: a session
 * payload that cannot be resolved fails the quote just as an estimate can.
 */
const getLoggedHcaBudget = (params: HcaBudgetQueryParams) =>
  getHcaBudget(params).mapErr((error) => {
    logger.warn('HCA budget quote failed', error)
    return error
  })

export const getHcaBudgetQueryOptions = (params: HcaBudgetQueryParams) =>
  resultQueryOptions({
    queryKey: $qk({
      $scope: 'registration',
      $action: 'hca-budget',
      label: params.label,
      durationInSeconds: params.durationInSeconds,
      hca: params.hca,
      // Keyed, not just passed: toggling the primary-name switch changes the
      // quote, so it has to refetch rather than serve the other variant.
      primaryName: params.primaryName ?? null,
    }),
    queryFn: () => getLoggedHcaBudget(params),
    enabled: isHcaBudgetQuoteRequired(params),
    // One retry for a flaky orchestrator. If it still fails the caller must
    // surface that: here "no budget" means "the permit cannot be sized", not
    // "show the rent alone".
    retry: 1,
    staleTime: HCA_BUDGET_STALE_TIME_MS,
    // The primary-name toggle is part of the key, so flipping it starts a
    // fresh query. Carrying the last quote through keeps the figures on screen
    // instead of the breakdown emptying out and refilling. Callers must treat
    // placeholder data as not-yet-quoted: it belongs to the other toggle state.
    placeholderData: keepPreviousData,
  })
