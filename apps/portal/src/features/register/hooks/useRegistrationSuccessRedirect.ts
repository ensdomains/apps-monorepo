import { useQueryClient } from '@tanstack/react-query'
import { type HistoryState, useNavigate } from '@tanstack/react-router'
import { fromPromise } from 'neverthrow'
import { useEffect, useRef } from 'react'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import type { RegistrationSuccessState } from '@/features/register/types/registrationSuccessState'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'

type UseRegistrationSuccessRedirectParams = {
  readonly name: string
  readonly durationSeconds: number
  readonly isSuccess: boolean
  readonly paid: string | undefined
}

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
  paid,
}: UseRegistrationSuccessRedirectParams) => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const hasRedirectedRef = useRef(false)

  useEffect(() => {
    if (hasRedirectedRef.current) return
    if (!isSuccess) return

    hasRedirectedRef.current = true

    const redirectToProfile = () =>
      navigate({
        to: '/$name',
        params: { name },
        // History state, not search params: the banner must not be reproducible
        // from a crafted link (Immunefi #92544). Without a paid figure there's
        // nothing to show, so the banner is skipped rather than half-rendered.
        state:
          paid === undefined
            ? undefined
            : // `HistoryState` is augmentable in `@tanstack/history`, which
              // isn't a direct dependency, so the extra key is widened here and
              // parsed back with `readRegistrationSuccessState` on the page.
              ({
                registrationSuccess: {
                  durationSeconds,
                  paid,
                } satisfies RegistrationSuccessState,
              } as HistoryState),
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
  }, [isSuccess, name, durationSeconds, paid, navigate, queryClient])
}
