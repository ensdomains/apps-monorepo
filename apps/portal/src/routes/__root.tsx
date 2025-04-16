import { queryClient, wagmiConfig } from '@/lib/wagmi'
import { type Mode, ThemeProvider } from '@ensdomains/thorin'
import { RainbowKitProvider, type Theme, darkTheme, lightTheme } from '@rainbow-me/rainbowkit'
import { QueryClientProvider } from '@tanstack/react-query'
import { Outlet, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { WagmiProvider } from 'wagmi'

import { darkTheme as thorinDarkTheme, lightTheme as thorinLightTheme } from '@ensdomains/thorin'
import { useState } from 'react'

declare global {
  interface Window {
    __theme: Mode
    __setPreferredTheme: (theme: Mode) => void
    __onThemeChange: (theme: Mode) => void
  }
}

const rainbowkitThemeBase = (theme: Mode): Theme => {
  const shared = {
    borderRadius: 'medium',
  } as const
  if (theme === 'light') {
    return lightTheme({
      ...shared,
      accentColor: thorinDarkTheme.colors.accent,
    })
  }
  return darkTheme({
    ...shared,
    accentColor: thorinLightTheme.colors.accent,
  })
}



export const Route = createRootRoute({
  component: () => {

    const [theme, setTheme] = useState<Mode | null>(window.__theme)

    window.__onThemeChange = (newTheme: Mode) => {
      setTheme(newTheme)
    }

    return (
      <>
        <WagmiProvider config={wagmiConfig}>
          <QueryClientProvider client={queryClient}>
            <RainbowKitProvider theme={rainbowkitThemeBase(theme ?? 'light')}>
              <ThemeProvider onThemeChange={mode => window.__setPreferredTheme(mode)}>
                <Outlet />
              </ThemeProvider>
            </RainbowKitProvider>
          </QueryClientProvider>
        </WagmiProvider>

        <TanStackRouterDevtools />
      </>
    )
  },
})
