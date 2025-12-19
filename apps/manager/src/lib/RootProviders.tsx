import { transactionManager } from '@ens-apps/transaction-manager'
import { ParaProvider } from '@getpara/react-sdk-lite'
import { useRouteContext } from '@tanstack/react-router'
import { SmartSessionProvider } from '@/features/wallet/components/SmartSessionProvider'
import { SmartAccountContextProvider } from '@/lib/smart-account'
import '@getpara/react-sdk-lite/styles.css'
import { QueryClientProvider } from '@tanstack/react-query'
import posthog from 'posthog-js'
import { track } from '@/lib/posthog/events'
import { PHProvider } from '@/lib/posthog/provider'
import { backendAuthStore } from '@/utils/backend-client'
import { getParaClient, setParaConnectionCookie } from './para'
import { customSepolia } from './wagmi'

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
  if (!previousAuthAddress || previousAuthAddress === wallet.address) return

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
    <QueryClientProvider client={queryClient}>
      <ParaProvider
        paraClientConfig={{
          apiKey: VITE_PARA_API_KEY,
        }}
        callbacks={{
          onLogin: onWalletChange,
          onLogout() {
            setParaConnectionCookie(null)
            // Clear all active transactions when wallet disconnects
            transactionManager.clearAllAndPersistence()

            // Clear the backend auth store
            backendAuthStore.trigger.signOut()

            // Clear all local storage for the app
            localStorage.clear()

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
          wallets: ['METAMASK', 'WALLETCONNECT'],
          // Do not create Para accounts for external wallet connections
          createLinkedEmbeddedForExternalWallets: [],
          evmConnector: {
            config: {
              chains: [customSepolia],
            },
          },
          walletConnect: {
            projectId: '1cb2e088d817de31a39a54154b265f68',
          },
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
        }}
      >
        <PHProvider>
          <SmartAccountContextProvider>
            {children}
            <SmartSessionProvider />
          </SmartAccountContextProvider>
        </PHProvider>
      </ParaProvider>
    </QueryClientProvider>
  )
}
