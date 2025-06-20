import {
  cssVars,
  type Mode,
  ThemeProvider,
  darkTheme as thorinDarkTheme,
  lightTheme as thorinLightTheme,
} from '@ensdomains/thorin'
import {
  darkTheme,
  lightTheme,
  RainbowKitProvider,
  type Theme,
} from '@rainbow-me/rainbowkit'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { useState } from 'react'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from '@/lib/wagmi'
import { queryClient } from '@/utils/queryClient'

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
    return {
      ...lightTheme({
        ...shared,
        accentColor: thorinDarkTheme.colors.accent,
      }),
      fonts: { body: cssVars.fonts.sans },
    }
  }
  return {
    ...darkTheme({
      ...shared,
      accentColor: thorinLightTheme.colors.accent,
    }),
    fonts: { body: cssVars.fonts.sans },
  }
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
              <ThemeProvider
                defaultMode={window.__theme}
                onThemeChange={(mode) => window.__setPreferredTheme(mode)}
              >
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
