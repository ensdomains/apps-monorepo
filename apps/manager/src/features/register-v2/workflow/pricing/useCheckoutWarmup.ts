import { useQuery } from '@tanstack/react-query'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { ownedNamesCountQueryOptions } from '@/features/shared/service/ownedNamesCount'
import {
  getHcaBudgetQueryOptions,
  isHcaBudgetQuoteRequired,
} from '../../data/queries/hcaBudget.query'
import {
  buildCheckoutBudgetParams,
  type CheckoutWarmupParams,
} from '../../service/checkoutWarmup'
import { getManagerRegistrationPostRegistrationSetup } from '../../state/registrationAutoSetup'

/**
 * Start the payment dialog's funding quote while the user is still choosing a
 * duration. The quote is two orchestrator round trips, so by the time Pay is
 * pressed it is usually cached and the dialog opens with its final figures.
 * Keyed exactly as the dialog keys it, including the primary-name default.
 */
export const useCheckoutWarmup = (params: CheckoutWarmupParams) => {
  const { account } = params
  const existingPrimaryName = useQuery(
    profileReverseNameQuery(account.ownerAddress ?? undefined),
  )
  const ownedNamesCount = useQuery(
    ownedNamesCountQueryOptions(account.ownerAddress ?? undefined),
  )
  const setAsPrimary = !!getManagerRegistrationPostRegistrationSetup({
    ownerAddress: account.ownerAddress,
    existingPrimaryName: existingPrimaryName.data,
    ownedNamesCount: ownedNamesCount.data,
  })

  // Only once the default is known, or the first quote is for the wrong key.
  // Without an owner the default is off and there is nothing to wait for.
  const isDefaultKnown =
    !account.ownerAddress ||
    (existingPrimaryName.isFetched && ownedNamesCount.isFetched)
  const budgetParams = buildCheckoutBudgetParams(params, setAsPrimary)

  useQuery({
    ...getHcaBudgetQueryOptions(budgetParams),
    enabled: isHcaBudgetQuoteRequired(budgetParams) && isDefaultKnown,
  })
}
