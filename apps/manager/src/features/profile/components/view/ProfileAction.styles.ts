// Small Button / Secondary from ENS Consumer (871:3955): 44px tall.
export const iconActionClassName =
  'inline-flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-[#e2e8f0] p-0.5 text-ens-lapis-500 transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50'

export const iconActionInnerClassName =
  'flex h-full items-center justify-center gap-2.5 rounded-[10px] px-4 max-xs:px-2'

export const iconActionIconInnerClassName =
  'flex size-full items-center justify-center rounded-[10px]'

export const iconActionSymbolClassName =
  'ms-opsz-20 ms-wght-500 text-[20px] leading-none'

export const favoriteActionClassName = 'bg-ens-magenta-light text-ens-magenta'

export const renewActionClassName =
  'inline-flex h-11 min-h-11 w-auto max-h-11 shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-[#e2e8f0] p-0.5 font-medium font-mono text-[13px] text-ens-lapis-500 uppercase leading-none tracking-[1.56px] transition-opacity hover:opacity-80 disabled:cursor-wait disabled:opacity-60'

export const renewActionSymbolClassName =
  'ms-opsz-12 ms-wght-500 text-[12px] leading-none max-xs:hidden'

export const editActionClassName =
  'h-15.25 w-full max-w-87 rounded border-none bg-(--theme-button-bg) px-6 py-0 font-semi-mono text-sm text-(--theme-button-text) uppercase tracking-[1.12px] shadow-none hover:bg-(--theme-button-hover-bg) xl:h-12.5 xl:w-42.75'

// Sizes the shared Button to the 42px / 4px spec; colors come from its variants
export const profileButtonClassName = 'h-10.5 rounded-sm text-xs uppercase'

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
