import type { QueryClient } from '@tanstack/react-query'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { ownedNamesCountQueryOptions } from '@/features/shared/service/ownedNamesCount'
import type { SmartAccountContextValue } from '@/lib/smart-account/SmartAccountContext'
import type { SUPPORTED_TOKEN } from '@/lib/tokens'
import {
  getHcaBudgetQueryOptions,
  type HcaBudgetQueryParams,
  isHcaBudgetQuoteRequired,
} from '../data/queries/hcaBudget.query'
import { getRegisterPriceQueryOptions } from '../data/queries/pricing.query'
import { getManagerRegistrationPostRegistrationSetup } from '../state/registrationAutoSetup'

export type CheckoutAccount = Pick<
  SmartAccountContextValue,
  'accountAddress' | 'signer' | 'ownerAddress' | 'getSessionEnablePayload'
>

export interface CheckoutWarmupParams {
  readonly label: string
  readonly durationInSeconds: number
  readonly token: SUPPORTED_TOKEN
  readonly account: CheckoutAccount
}

/**
 * The smart-account route cannot proceed without the quote, so this only
 * bounds a hung request: past it the dialog opens and loads in place.
 */
export const CHECKOUT_WARMUP_TIMEOUT_MS = 30_000

/**
 * Whether the primary-name toggle defaults on, which the budget quote depends
 * on. The same lookups seed the toggle inside the dialog, so both read the one
 * cache entry. A failed lookup defaults the toggle off there too.
 */
const readDefaultSetAsPrimary = async (
  queryClient: QueryClient,
  ownerAddress: CheckoutAccount['ownerAddress'],
): Promise<boolean> => {
  if (!ownerAddress) return false
  try {
    const [existingPrimaryName, ownedNamesCount] = await Promise.all([
      queryClient.fetchQuery(profileReverseNameQuery(ownerAddress)),
      queryClient.fetchQuery(ownedNamesCountQueryOptions(ownerAddress)),
    ])
    return !!getManagerRegistrationPostRegistrationSetup({
      ownerAddress,
      existingPrimaryName,
      ownedNamesCount,
    })
  } catch {
    return false
  }
}

/** The budget the dialog will quote first, keyed the way the dialog keys it. */
export const buildCheckoutBudgetParams = (
  params: CheckoutWarmupParams,
  setAsPrimary: boolean,
): HcaBudgetQueryParams => ({
  label: params.label,
  durationInSeconds: params.durationInSeconds,
  hca: params.account.accountAddress,
  signer: params.account.signer,
  primaryName: setAsPrimary ? `${params.label}.eth` : undefined,
  getSessionEnablePayload: params.account.getSessionEnablePayload,
})

const settled = (promise: Promise<unknown>) => promise.catch(() => undefined)

/**
 * Fill the cache the payment dialog reads from, so it opens with its final
 * figures: the price, and on the smart-account route the funding budget. A
 * failed read is left to the dialog to report; a slow one stops holding the
 * dialog back after {@link CHECKOUT_WARMUP_TIMEOUT_MS}.
 */
export const warmRegistrationCheckout = async (
  queryClient: QueryClient,
  params: CheckoutWarmupParams,
  timeoutMs = CHECKOUT_WARMUP_TIMEOUT_MS,
): Promise<void> => {
  // `fetchQuery` reuses a fresh entry and awaits a stale one, so the dialog
  // never opens on a figure that is about to be replaced.
  const price = settled(
    queryClient.fetchQuery(
      getRegisterPriceQueryOptions(
        params.label,
        params.durationInSeconds,
        params.token,
      ),
    ),
  )

  const budget = (async () => {
    // The route decides whether there is a budget at all, so settle that
    // before the primary-name lookups the quote's key depends on.
    if (!isHcaBudgetQuoteRequired(buildCheckoutBudgetParams(params, false))) {
      return
    }
    const setAsPrimary = await readDefaultSetAsPrimary(
      queryClient,
      params.account.ownerAddress,
    )
    await settled(
      queryClient.fetchQuery(
        getHcaBudgetQueryOptions(
          buildCheckoutBudgetParams(params, setAsPrimary),
        ),
      ),
    )
  })()

  await Promise.race([
    Promise.all([price, budget]),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ])
}
