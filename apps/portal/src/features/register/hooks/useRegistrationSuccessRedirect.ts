import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { fromPromise } from 'neverthrow'
import { useEffect, useRef, useState } from 'react'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import type { RegistrationPriceResult } from '@/features/register/hooks/useRegistrationPrice'
import {
  formatPriceDisplay,
  isPriceResult,
} from '@/features/register/utils/registrationPrice'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'

type UseRegistrationSuccessRedirectParams = {
  readonly name: string
  readonly durationSeconds: number
  readonly isSuccess: boolean
  readonly price: RegistrationPriceResult | undefined
  readonly isPriceError: boolean
}

const PRICE_SETTLE_TIMEOUT_MS = 10_000

/**
 * After a successful registration, waits for the indexer to catch up (so the
 * overview shows the owned name, not "available") and redirects to `/$name`
 * with the duration + paid amount as search params, which drive the success
 * banner there. Fires once.
 */
export const useRegistrationSuccessRedirect = ({
  name,
  durationSeconds,
  isSuccess,
  price,
  isPriceError,
}: UseRegistrationSuccessRedirectParams) => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const hasRedirectedRef = useRef(false)
  const [didTimeout, setDidTimeout] = useState(false)

  useEffect(() => {
    if (!isSuccess) return
    const timer = setTimeout(() => setDidTimeout(true), PRICE_SETTLE_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [isSuccess])

  useEffect(() => {
    if (hasRedirectedRef.current) return
    if (!isSuccess) return

    const hasPrice = isPriceResult(price)
    if (!hasPrice && !isPriceError && !didTimeout) return

    hasRedirectedRef.current = true

    const paid = hasPrice
      ? formatPriceDisplay(price.total, price.decimals)
      : undefined

    const redirectToProfile = () =>
      navigate({
        to: '/$name',
        params: { name },
        search: { registered: true, duration: durationSeconds, paid },
        replace: true,
      })

    void fromPromise(
      pollForIndexerSync({
        invalidateQueries: () =>
          Promise.all([
            queryClient.invalidateQueries({
              queryKey: getEnsOwnerQueryOptions({ name }).queryKey,
              refetchType: 'all',
            }),
            queryClient.invalidateQueries({
              queryKey: getNameAvailabilityQueryOptions({ name }).queryKey,
              refetchType: 'all',
            }),
            queryClient.invalidateQueries({
              queryKey: getProfileQueryOptions({ name }).queryKey,
              refetchType: 'all',
            }),
          ]).then(() => undefined),
      }),
      (error) => error,
    ).match(
      // Indexer has (likely) caught up — redirect to the profile.
      redirectToProfile,
      // A polling failure shouldn't trap the user on the registration screen;
      // redirect anyway and let the overview refetch on its own.
      redirectToProfile,
    )
  }, [
    isSuccess,
    price,
    isPriceError,
    didTimeout,
    name,
    durationSeconds,
    navigate,
    queryClient,
  ])
}
