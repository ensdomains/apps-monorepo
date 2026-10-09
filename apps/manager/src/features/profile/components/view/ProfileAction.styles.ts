import type { CSSProperties } from 'react'

export const iconActionClassName =
  'flex size-13.5 shrink-0 items-center justify-center rounded bg-white text-ens-quartz-700 shadow-[0_2px_6px_rgba(0,0,0,0.06)] transition hover:bg-ens-quartz-50 disabled:cursor-not-allowed disabled:opacity-50'

export const renewActionClassName =
  'inline-flex h-13.5 min-w-34 items-center justify-center gap-1 whitespace-nowrap rounded border-none bg-white px-3 py-0 font-semi-mono text-xs text-ens-quartz-900 uppercase tracking-[0.96px] shadow-[0_2px_6px_rgba(0,0,0,0.06)] hover:bg-ens-quartz-50 disabled:cursor-wait disabled:opacity-60 lg:landscape:w-33 lg:landscape:min-w-33'

export const editActionClassName =
  'h-15.25 w-full max-w-87 rounded border-none bg-(--theme-button-bg) px-6 py-0 font-semi-mono text-sm text-(--theme-button-text) uppercase tracking-[1.12px] shadow-none hover:bg-(--theme-button-hover-bg) lg:landscape:h-12.5 lg:landscape:w-42.75'

// Figma-spec bar buttons: heights, tracking and border widths below have no
// matching tokens
export const editFloatingActionClassName =
  'inline-flex h-13.5 shrink-0 items-center justify-center whitespace-nowrap rounded-md bg-ens-quartz-900 px-3 py-0 font-mono text-sm text-white uppercase tracking-[0.28px] shadow-none transition-colors hover:bg-ens-quartz-700 lg:landscape:h-12.5 lg:landscape:rounded lg:landscape:border-2 lg:landscape:border-ens-lapis-500 lg:landscape:px-5 lg:landscape:font-semi-mono lg:landscape:text-xs lg:landscape:tracking-[1.44px]'

export const renewBarActionClassName =
  'inline-flex h-13.5 w-auto shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-ens-quartz-200 bg-transparent px-3 py-0 font-mono text-sm text-ens-quartz-900 uppercase tracking-[0.28px] transition-colors hover:bg-ens-quartz-50 disabled:cursor-wait disabled:opacity-60'

export const editBottomNavClassName =
  'fixed inset-x-0 bottom-0 z-40 bg-white shadow-[0_-3px_2px_rgba(220,220,220,0.25)] lg:landscape:shadow-[0_-3.24px_91px_rgba(7,28,47,0.12)]'

export const editBottomNavContentClassName =
  'mx-auto flex w-full max-w-97.5 flex-wrap justify-center gap-3 px-5 pt-3 pb-[calc(44px+env(safe-area-inset-bottom,0))] lg:landscape:max-w-360 lg:landscape:justify-end lg:landscape:gap-3 lg:landscape:px-8 lg:landscape:py-4'

export const editBottomBarContentClassName =
  'flex items-center justify-between gap-3 px-3 pt-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))] lg:landscape:p-6'

export const profileBarActionsClassName =
  'flex items-center gap-3 lg:landscape:gap-6 [&_a]:border [&_a]:border-ens-quartz-200 [&_a]:border-solid [&_a]:shadow-none [&_button]:border [&_button]:border-ens-quartz-200 [&_button]:border-solid [&_button]:shadow-none'

export const profileStickyBarClassName =
  'fixed inset-x-0 bottom-0 z-40 bg-white shadow-[0_-3px_2px_rgba(220,220,220,0.25)] lg:landscape:hidden'

export const desktopActionContainerClassName =
  'absolute top-[422px] z-30 hidden w-33 flex-col gap-6 lg:landscape:flex'

export const desktopActionContainerStyle = {
  left: 'min(calc(50% + 452.5px), calc(100% - 164px))',
} satisfies CSSProperties
