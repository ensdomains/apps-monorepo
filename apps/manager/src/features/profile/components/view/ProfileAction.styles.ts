// Secondary action from the Explore CTA design (6714:72931): 44px, grey, darker on hover
export const iconActionClassName =
  'inline-flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-ens-quartz-75 p-0.5 text-ens-quartz-500 transition-colors hover:bg-ens-quartz-200 hover:text-ens-quartz-900 disabled:cursor-not-allowed disabled:opacity-50'

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

// Text secondary action (Renew, Explore) from the same design; its 1px tracking has no token
export const renewActionClassName =
  'inline-flex h-11 min-h-11 w-auto max-h-11 shrink-0 items-center justify-center overflow-hidden rounded-[4px] border-0 bg-ens-quartz-75 p-0.5 font-medium font-mono text-ens-quartz-500 text-sm uppercase leading-none tracking-[1px] transition-colors hover:bg-ens-quartz-200 hover:text-ens-quartz-900 disabled:cursor-wait disabled:opacity-60'

export const renewActionSymbolClassName =
  'ms-opsz-12 ms-wght-500 text-[12px] leading-none max-xs:hidden'

export const editActionClassName =
  'h-15.25 w-full max-w-87 rounded border-none bg-(--theme-button-bg) px-6 py-0 font-semi-mono text-sm text-(--theme-button-text) uppercase tracking-[1.12px] shadow-none hover:bg-(--theme-button-hover-bg) xl:h-12.5 xl:w-42.75'

// Sizes the shared Button to the 42px / 4px spec; colors come from its variants
export const profileButtonClassName = 'h-10.5 rounded-sm text-xs uppercase'

// Primary action (Edit Profile, Preview, Publish): black, lighter on hover; overrides the Button variant
export const primaryActionClassName =
  'bg-ens-quartz-900 text-white hover:bg-ens-quartz-500 active:bg-ens-quartz-900 disabled:bg-ens-quartz-50 disabled:text-ens-quartz-300 disabled:opacity-100 aria-disabled:bg-ens-quartz-50 aria-disabled:text-ens-quartz-300'

// Tertiary action (Cancel, Discard): white, off-white on hover
export const tertiaryActionClassName =
  'bg-white text-ens-quartz-900 hover:bg-ens-quartz-50 hover:text-ens-quartz-900'

// The design's action tooltips hug their text up to 220px; longer copy breaks lines itself. 10px text has no token
export const actionTooltipClassName =
  'w-max max-w-55 rounded-sm bg-ens-quartz-900 px-2 py-1.25 text-center text-[10px] leading-3.5'

// The floating bar's Edit button, sized and set like the Renew action beside it
export const barEditActionClassName =
  'h-11 gap-2 rounded-sm px-3.5 font-medium text-sm uppercase leading-none tracking-[1.56px] max-xs:px-2.5 xl:px-3'

// Below 352px the icon no longer fits beside the Renew action, so it drops
export const barEditActionSymbolClassName =
  'ms-opsz-20 ms-wght-500 text-sm leading-none max-[22rem]:hidden'

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

// When the owner's actions and Edit don't fit on one row, Edit wraps to its own
export const ownerBarContentClassName = `${editBottomBarContentClassName} flex-wrap`

// Grow from an auto basis (not flex-1), so Edit wraps rather than squeezing under the actions
export const ownerBarEditActionsClassName =
  'flex min-w-0 grow items-center justify-end gap-3 xl:ml-auto xl:flex-none'
