import { actionButtonVariants } from '@/components/ui/action-button'
import { cn } from '@/lib/utils'

// Square secondary action (favorite, share)
export const iconActionClassName = cn(
  actionButtonVariants({ intent: 'secondary', shape: 'square' }),
  'overflow-hidden',
)

// With the 2px outer padding this gives the bar's 14px (12px on desktop) inset
export const iconActionInnerClassName =
  'flex h-full items-center justify-center gap-2.5 rounded-[10px] px-3 max-xs:px-2 xl:px-2.5'

export const iconActionIconInnerClassName =
  'flex size-full items-center justify-center rounded-[10px]'

export const iconActionSymbolClassName =
  'ms-opsz-20 ms-wght-500 text-[20px] leading-none'

export const favoriteActionClassName =
  'hover:bg-ens-garnet-100 hover:text-ens-garnet-500'

export const favoritedActionClassName =
  'bg-ens-garnet-100 text-ens-garnet-core hover:bg-ens-garnet-100 hover:text-ens-garnet-core'

// Text secondary action (Renew, Explore); the inner label span carries the padding
export const renewActionClassName = cn(
  actionButtonVariants({ intent: 'secondary' }),
  'overflow-hidden border-0 px-0.5',
)

export const editActionClassName =
  'h-15.25 w-full max-w-87 rounded border-none bg-(--theme-button-bg) px-6 py-0 font-semi-mono text-sm text-(--theme-button-text) uppercase tracking-[1.12px] shadow-none hover:bg-(--theme-button-hover-bg) xl:h-12.5 xl:w-42.75'

// Edit Profile, Preview, Publish
export const primaryActionClassName = actionButtonVariants({
  intent: 'primary',
})

// Set up or replace resolver, beside Edit
export const secondaryActionClassName = actionButtonVariants({
  intent: 'secondary',
})

// Cancel, Discard
export const tertiaryActionClassName = actionButtonVariants({
  intent: 'tertiary',
})

// The design's action tooltips hug their text up to 220px; longer copy breaks lines itself. 10px text has no token
export const actionTooltipClassName =
  'w-max max-w-55 rounded-sm bg-ens-quartz-900 px-2 py-1.25 text-center text-[10px] leading-3.5'

// The floating bar's Edit button; the dialog gives each of its buttons an intent
export const barEditActionClassName = primaryActionClassName

// Below xl the bar holds every action on one row, so Edit drops its icon
export const barEditActionSymbolClassName =
  'ms-opsz-20 ms-wght-500 text-sm leading-none max-xl:hidden'

// Trims the label box to the cap height so it centres on the caps, as in Figma
export const actionLabelClassName =
  '[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]'

// Figma-spec bar sizes, offsets and shadows below have no matching tokens; the
// calc() values add the device safe area
export const editBottomNavClassName =
  'fixed inset-x-0 bottom-0 z-40 bg-white shadow-[0_-3px_2px_rgba(220,220,220,0.25)] xl:shadow-[0_-3.24px_91px_rgba(7,28,47,0.12)]'

export const editBottomNavContentClassName =
  'mx-auto flex w-full max-w-97.5 flex-wrap justify-center gap-3 px-5 pt-3 pb-[calc(44px+env(safe-area-inset-bottom,0))] xl:max-w-360 xl:justify-end xl:gap-3 xl:px-8 xl:py-4'

export const editBottomBarContentClassName =
  'flex items-center justify-between gap-3 px-3 pt-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))] xl:p-6'

export const profileBarActionsClassName = 'flex items-center gap-2'

export const profileStickyBarClassName =
  'fixed inset-x-0 bottom-0 z-40 bg-white shadow-[0_-3px_2px_rgba(220,220,220,0.25)] xl:hidden'

export const desktopActionClusterClassName =
  'hidden shrink-0 items-center gap-2 xl:flex'

// Visitors' header actions; the header decides where they show at each width
export const headerActionClusterClassName = 'flex shrink-0 items-center gap-2'

// Below xl every action sits on one centred row; Edit wraps only if a long label can't fit
export const ownerBarContentClassName = cn(
  editBottomBarContentClassName,
  'flex-wrap justify-center gap-2 xl:justify-between xl:gap-3',
)

// No grow, so Edit stays beside the other actions instead of pushing right
export const ownerBarEditActionsClassName =
  'flex min-w-0 items-center justify-end gap-3 xl:ml-auto xl:flex-none'
