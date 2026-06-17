export interface GlobalBackButtonConfig {
  readonly className?: string
  readonly fallbackPath?: '/' | '/dashboard'
  readonly isVisible: boolean
}

export const DEFAULT_GLOBAL_BACK_BUTTON_CONFIG = {
  fallbackPath: '/',
  isVisible: true,
} satisfies GlobalBackButtonConfig

const isProfileEditRoute = (pathname: string) =>
  /^\/p\/[^/]+\/edit\/?$/.test(pathname)

const isProfileRoute = (pathname: string) =>
  /^\/[^/]+\.[^/]+\/?$/.test(pathname) ||
  /^\/0x[a-fA-F0-9]{40}\/?$/.test(pathname)

export const getDefaultGlobalBackButtonConfig = (
  pathname: string,
): GlobalBackButtonConfig | null => {
  if (pathname.startsWith('/legal/')) {
    return DEFAULT_GLOBAL_BACK_BUTTON_CONFIG
  }

  if (isProfileEditRoute(pathname) || isProfileRoute(pathname)) {
    return DEFAULT_GLOBAL_BACK_BUTTON_CONFIG
  }

  if (
    pathname === '/payment/add' ||
    pathname === '/payment/list' ||
    pathname === '/notifications' ||
    pathname === '/notifications/' ||
    pathname === '/notifications/settings' ||
    pathname === '/notifications/settings/' ||
    pathname === '/auto-renewal' ||
    pathname === '/auto-renewal/' ||
    pathname === '/wallet'
  ) {
    return DEFAULT_GLOBAL_BACK_BUTTON_CONFIG
  }

  return null
}
