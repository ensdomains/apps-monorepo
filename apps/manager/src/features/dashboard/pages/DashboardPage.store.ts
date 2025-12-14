import { createPersistedStore } from '@/utils/xstate-store'

const DASHBOARD_UI_STORAGE_KEY = '@manager-v4/dashboard-ui'

type DashboardUiContext = {
  hasDismissedNewWalletBanner: boolean
}

type DashboardUiEvents = {
  dismissNewWalletBanner: Record<string, never>
  resetNewWalletBanner: Record<string, never>
}

export const dashboardUiStore = createPersistedStore<
  DashboardUiContext,
  DashboardUiEvents,
  never
>(
  {
    context: {
      hasDismissedNewWalletBanner: false,
    },
    on: {
      dismissNewWalletBanner: (context) => ({
        ...context,
        hasDismissedNewWalletBanner: true,
      }),
      resetNewWalletBanner: (context) => ({
        ...context,
        hasDismissedNewWalletBanner: false,
      }),
    },
  },
  { key: DASHBOARD_UI_STORAGE_KEY },
)

export const hasDismissedNewWalletBannerAtom = dashboardUiStore.select(
  (context) => context.hasDismissedNewWalletBanner,
)
