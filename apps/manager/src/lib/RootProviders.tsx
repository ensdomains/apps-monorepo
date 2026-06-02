import { transactionManager } from '@ens-apps/transaction-manager'
import { ParaProvider } from '@getpara/react-sdk-lite'
import { useRouteContext } from '@tanstack/react-router'
import { EnableSessionModal } from '@/features/wallet/components/EnableSessionModal'
import {
  SmartAccountContextProvider,
  useSmartAccountContext,
} from '@/lib/smart-account'
import '@getpara/react-sdk-lite/styles.css'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClientProvider } from '@tanstack/react-query'
import posthog from 'posthog-js'
import { track } from '@/lib/posthog/events'
import { PHProvider } from '@/lib/posthog/provider'
import { backendAuthStore } from '@/utils/backend-client'
import { isFeatureEnabled } from '@/utils/feature-flags'
import { tw } from '@/utils/tailwind'
import { performLogoutCleanup } from './logout-cleanup'
import { ParaConnectionCookieSync } from './ParaConnectionCookieSync'
import { getParaClient, setParaConnectionCookie } from './para'
import { sepoliaWithEns } from './wagmi'

const onWalletChange = () => {
  const client = getParaClient()

  if (!client) return

  const wallet = client.findWallet(undefined, undefined, {
    type: ['EVM'],
  })

  setParaConnectionCookie(wallet?.address ?? null)

  if (!wallet) return

  const previousAuthAddress = backendAuthStore.get().context.address

  // If the previous auth address is the same as the current wallet address, do nothing
  // Or if the previous auth address is not set, do nothing
  if (
    !previousAuthAddress ||
    previousAuthAddress.toLowerCase() === wallet.address?.toLowerCase()
  )
    return

  // Clear all transactions when wallet changes
  transactionManager.clearAllAndPersistence()

  backendAuthStore.trigger.signOut()
}

export const RootProviders = ({ children }: { children: React.ReactNode }) => {
  const VITE_PARA_API_KEY = import.meta.env.VITE_PARA_API_KEY

  if (!VITE_PARA_API_KEY) {
    throw new Error('VITE_PARA_API_KEY is not defined in environment variables')
  }

  const queryClient = useRouteContext({
    from: '__root__',
    select: (context) => context.queryClient,
  })

  return (
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ParaProvider
          callbacks={{
            onLogin: onWalletChange,
            onLogout() {
              setParaConnectionCookie(null)
              // Clear all active transactions when wallet disconnects
              transactionManager.clearAllAndPersistence()

              // Clear the backend auth store
              backendAuthStore.trigger.signOut()

              // Remove manager-owned localStorage entries. Do NOT
              // call `localStorage.clear()` — that wipes PostHog,
              // audit-trail data, and any future shared-origin
              // app state.
              performLogoutCleanup()

              // Clear the posthog session
              track('wallet:disconnect')
              posthog.reset()
            },
            onExternalWalletChange: onWalletChange,
            onWalletsChange: onWalletChange,
          }}
          config={{
            appName: 'ENS Manager',
          }}
          externalWalletConfig={{
            wallets: ['METAMASK'],
            // Do not create Para accounts for external wallet connections
            createLinkedEmbeddedForExternalWallets: [],
            evmConnector: {
              config: {
                chains: [sepoliaWithEns],
              },
            },
            // walletConnect: {
            //   projectId: '1cb2e088d817de31a39a54154b265f68',
            // },
            connectionOnly: true,
          }}
          paraClientConfig={{
            apiKey: VITE_PARA_API_KEY,
          }}
          paraModalConfig={{
            disableEmailLogin: false,
            disablePhoneLogin: true,
            onRampTestMode: true,
            oAuthMethods: ['GOOGLE', 'TWITTER', 'TELEGRAM'],
            authLayout: ['AUTH:FULL', 'EXTERNAL:FULL'],
            recoverySecretStepEnabled: true,

            theme: {
              foregroundColor: '#2D3648',
              backgroundColor: '#FFFFFF',
              accentColor: '#0066CC',
              darkForegroundColor: '#E8EBF2',
              darkBackgroundColor: '#1A1F2B',
              darkAccentColor: '#4D9FFF',
              mode: 'light',
              borderRadius: 'lg',
              font: 'Inter',
            },
            twoFactorAuthEnabled: false,
            // By default, the Para modal uses a high z-index (10011) to render above other elements. However, our dialog/alertdialog components apply `pointer-events-none` to the body, which can unintentionally block interaction with the Para modal when these dialogs are open underneath. To prevent this, we explicitly set `pointer-events-auto` on the Para modal, ensuring it remains interactive even when an underlying dialog/alertdialog is present—mirroring the approach we use for other modals.
            className: tw`pointer-events-auto`,
          }}
        >
          <ParaConnectionCookieSync />
          <PHProvider>
            <SmartAccountContextProvider>
              {children}
              {!isFeatureEnabled('USE_EOA') && <SmartAccountSessionModal />}
            </SmartAccountContextProvider>
          </PHProvider>
        </ParaProvider>
      </QueryClientProvider>
    </I18nProvider>
  )
}

const SmartAccountSessionModal = () => {
  const {
    showSessionModal,
    enableSession,
    dismissSession,
    accountAddress,
    ownerAddress,
    isCreatingSession,
    error,
  } = useSmartAccountContext()

  return (
    <EnableSessionModal
      hasError={!!error}
      isEnabling={isCreatingSession}
      onEnableSession={enableSession}
      onOpenChange={(open) => {
        if (!open) {
          dismissSession()
        }
      }}
      open={showSessionModal}
      smartAccountAddress={accountAddress ?? undefined}
      walletAddress={ownerAddress ?? undefined}
    />
  )
}
