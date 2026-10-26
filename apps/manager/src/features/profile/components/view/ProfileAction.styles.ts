export const iconActionClassName =
  'flex size-13.5 shrink-0 items-center justify-center rounded bg-white text-ens-quartz-700 shadow-[0_2px_6px_rgba(0,0,0,0.06)] transition hover:bg-ens-quartz-50 disabled:cursor-not-allowed disabled:opacity-50'

export const renewActionClassName =
  'inline-flex h-13.5 min-w-34 items-center justify-center gap-1 whitespace-nowrap rounded border-none bg-white px-3 py-0 font-semi-mono text-xs text-ens-quartz-900 uppercase tracking-[0.96px] shadow-[0_2px_6px_rgba(0,0,0,0.06)] hover:bg-ens-quartz-50 disabled:cursor-wait disabled:opacity-60 xl:w-33 xl:min-w-33'

export const editActionClassName =
  'h-15.25 w-full max-w-87 rounded border-none bg-(--theme-button-bg) px-6 py-0 font-semi-mono text-sm text-(--theme-button-text) uppercase tracking-[1.12px] shadow-none hover:bg-(--theme-button-hover-bg) xl:h-12.5 xl:w-42.75'

// Sizes the shared Button to the 42px / 4px spec; colors come from its variants
export const profileButtonClassName = 'h-10.5 rounded-sm text-xs uppercase'

// Figma-spec bar sizes, offsets and shadows below have no matching tokens; the
// calc() values add the device safe area
export const renewBarActionClassName =
  'inline-flex h-13.5 w-auto shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-ens-quartz-200 bg-transparent px-3 py-0 font-mono text-sm text-ens-quartz-900 uppercase tracking-[0.28px] transition-colors hover:bg-ens-quartz-50 disabled:cursor-wait disabled:opacity-60'

export const editBottomNavClassName =
  'fixed inset-x-0 bottom-0 z-40 bg-white shadow-[0_-3px_2px_rgba(220,220,220,0.25)] xl:shadow-[0_-3.24px_91px_rgba(7,28,47,0.12)]'

export const editBottomNavContentClassName =
  'mx-auto flex w-full max-w-97.5 flex-wrap justify-center gap-3 px-5 pt-3 pb-[calc(44px+env(safe-area-inset-bottom,0))] xl:max-w-360 xl:justify-end xl:gap-3 xl:px-8 xl:py-4'

export const editBottomBarContentClassName =
  'flex items-center justify-between gap-3 px-3 pt-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))] xl:p-6'

export const profileBarActionsClassName =
  'flex items-center gap-3 xl:gap-6 [&_a]:border [&_a]:border-ens-quartz-200 [&_a]:border-solid [&_a]:shadow-none [&_button]:border [&_button]:border-ens-quartz-200 [&_button]:border-solid [&_button]:shadow-none'

export const profileStickyBarClassName =
  'fixed inset-x-0 bottom-0 z-40 bg-white shadow-[0_-3px_2px_rgba(220,220,220,0.25)] xl:hidden'

export const desktopActionContainerClassName =
  'absolute top-[377px] left-[calc(50%+29.5rem)] z-30 hidden w-33 flex-col gap-6 xl:flex'
