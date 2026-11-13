import { TaggedError } from '@ens-apps/utils/neverthrow'
import type {
  HistoryLocation,
  ParsedLocation,
  RouterHistory,
} from '@tanstack/react-router'
import type { PaletteNavigation } from './executionPlan'

type PaletteRouter = {
  readonly history: Readonly<Pick<RouterHistory, 'location' | '_getBlockers'>>
  readonly buildLocation: (navigation: PaletteNavigation) => ParsedLocation
  readonly navigate: (
    navigation: PaletteNavigation & { readonly ignoreBlocker: true },
  ) => Promise<void>
}

class NavigatePaletteError extends TaggedError('NavigatePaletteError')<{
  readonly cause: unknown
}> {}

const INTERNAL_URL_BASE = 'https://palette.invalid'

export const navigatePalette = async (
  router: PaletteRouter,
  navigation: PaletteNavigation,
): Promise<void> => {
  const currentLocation = router.history.location
  const built = router.buildLocation(navigation)
  if (
    built.maskedLocation ||
    built.external ||
    built.publicHref !== built.href
  ) {
    return Promise.reject(
      new NavigatePaletteError({
        cause: 'Palette navigation requires an internal, unmasked destination.',
      }),
    )
  }
  const encodedLocation = new URL(built.href, INTERNAL_URL_BASE)
  const nextLocation: HistoryLocation = {
    href: built.href,
    pathname: encodedLocation.pathname,
    search: built.searchStr,
    hash: encodedLocation.hash,
    state: {
      ...built.state,
      __TSR_index: currentLocation.state.__TSR_index + 1,
    },
  }

  // _getBlockers couples this adapter to installed history; blocked commits otherwise never settle.
  const blockers = [...router.history._getBlockers()]
  for (const blocker of blockers) {
    const isBlocked = await blocker.blockerFn({
      currentLocation,
      nextLocation,
      action: 'PUSH',
    })
    if (router.history.location !== currentLocation) {
      return Promise.reject(
        new NavigatePaletteError({
          cause:
            'The page changed before this action could open. Choose the action again.',
        }),
      )
    }
    if (isBlocked) return
  }

  await router.navigate({ ...navigation, ignoreBlocker: true })
}
