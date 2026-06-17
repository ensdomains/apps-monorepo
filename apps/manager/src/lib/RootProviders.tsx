import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { useRouteContext } from '@tanstack/react-router'
import { PHProvider } from '@/lib/posthog/provider'
import { SmartAccountContextProvider } from '@/lib/smart-account'
import { WalletLifecycle, WalletProvider } from '@/lib/wallet'
import { ConnectionCookieSync } from './ConnectionCookieSync'

export const RootProviders = ({ children }: { children: React.ReactNode }) => {
  const queryClient = useRouteContext({
    from: '__root__',
    select: (context) => context.queryClient,
  })

  return (
    // WalletProvider owns wagmi + the vendor; everything inside reads the
    // wallet through the seam.
    <I18nProvider i18n={i18n}>
      <WalletProvider queryClient={queryClient}>
        <ConnectionCookieSync />
        <WalletLifecycle />
        <PHProvider>
          <SmartAccountContextProvider>{children}</SmartAccountContextProvider>
        </PHProvider>
      </WalletProvider>
    </I18nProvider>
  )
}
