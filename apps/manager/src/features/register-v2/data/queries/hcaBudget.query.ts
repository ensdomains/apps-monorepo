import type { HcaBudgetBreakdown } from '@ens-apps/smart-account'
import type { Signer } from '@ens-apps/transaction-manager'
import {
  estimateHcaBudgetActor,
  type HcaSessionEnableParams,
  readHcaUsdcBalanceActor,
} from '@ens-apps/transaction-manager/machines/registration/registration.hca.actors'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { queryOptions } from '@tanstack/react-query'
import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
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
 * machine will size the permit from.
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

export interface HcaBudgetQueryParams {
  readonly label: string
  readonly durationInSeconds: number
  /** The HCA address — only used to key the cache per account. */
  readonly hca: Address | null
  readonly signer: Signer | null
  /**
   * Resolves the session-enable payload. The commit leg's cost depends on
   * whether the batch carries `enableSessionWithRefund`, so the quote must be
   * taken against the same shape the machine will submit.
   */
  readonly getSessionEnablePayload: () => Promise<
    HcaSessionEnableParams | undefined
  >
}

export const getHcaBudgetQueryOptions = ({
  label,
  durationInSeconds,
  hca,
  signer,
  getSessionEnablePayload,
}: HcaBudgetQueryParams) =>
  queryOptions({
    queryKey: $qk({
      $scope: 'registration',
      $action: 'hca-budget',
      label,
      durationInSeconds,
      hca,
    }),
    queryFn: async (): Promise<HcaBudgetQuote> => {
      const sessionEnable = await getSessionEnablePayload()

      const result = await estimateHcaBudgetActor({
        name: label,
        duration: BigInt(Math.ceil(durationInSeconds)),
        publicClient,
        chainId: sepolia.id,
        ...(signer ? { signer } : {}),
        ...(sessionEnable ? { sessionEnable } : {}),
      })

      // The estimator refuses to return a fallback-sourced budget (it would
      // over- or under-fund), so an error here means "no quote", not "cheap".
      if (result.isErr()) throw result.error

      // Read the standing balance the same way the machine does — including
      // `unwrapOr(0n)`. A failed read must fall back to "the HCA holds
      // nothing", i.e. gate on the whole budget: erring the other way would
      // wave through a wallet that then fails the commit simulation.
      const hcaBalance = hca
        ? await readHcaUsdcBalanceActor({
            hca,
            publicClient,
            chainId: sepolia.id,
          }).unwrapOr(0n)
        : 0n

      return { ...result.value, hcaBalance }
    },
    // Only the HCA route has a funding budget; a pure-EOA signer pays the
    // registrar directly and the estimator has nothing to quote against.
    enabled:
      Boolean(hca) &&
      signer?.type === 'rhinestone' &&
      label.length > 0 &&
      durationInSeconds > 0,
    staleTime: HCA_BUDGET_STALE_TIME_MS,
    // A flaky orchestrator must not strand the user on the confirm screen:
    // callers treat "no budget" as "show the price alone and let the machine
    // surface any failure", never as a hard block.
    retry: 1,
  })
