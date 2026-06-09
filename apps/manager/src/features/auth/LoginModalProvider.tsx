import { createContext, useContext, useMemo, useState } from 'react'
import { requestPrivyLoad } from '@/lib/privy/privy-session-store'
import { LoginDialog } from './LoginDialog'

type LoginModalContextValue = {
  /** Open the social-login dialog. */
  openLogin: () => void
  /** Close it. */
  closeLogin: () => void
  isOpen: boolean
}

const noop = () => {}

/**
 * Default value (used when no provider is mounted) is a no-op, so call sites
 * can always call `openLogin()` without guarding.
 */
const LoginModalContext = createContext<LoginModalContextValue>({
  openLogin: noop,
  closeLogin: noop,
  isOpen: false,
})

/**
 * App-level "open the login UI" hook — the Privy replacement for RainbowKit's
 * `useConnectModal`. Returns `openLogin()` (always defined).
 */
export const useLoginModal = () => useContext(LoginModalContext)

/**
 * Owns the login-dialog open state and renders the dialog once at the app root.
 * The dialog reads the Privy session from privy-session-store (not the SDK
 * directly), so this no longer needs to sit inside PrivyProvider — opening it
 * triggers the lazy Privy load (see openLogin).
 */
export const LoginModalProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [isOpen, setIsOpen] = useState(false)

  const value = useMemo<LoginModalContextValue>(
    () => ({
      openLogin: () => {
        // Kick off loading the Privy SDK chunk as the dialog opens, so the
        // social buttons are ready by the time the user reaches for them.
        // (External-wallet login doesn't need Privy; a visitor who never opens
        // this dialog never downloads the SDK.)
        requestPrivyLoad()
        setIsOpen(true)
      },
      closeLogin: () => setIsOpen(false),
      isOpen,
    }),
    [isOpen],
  )

  return (
    <LoginModalContext.Provider value={value}>
      {children}
      <LoginDialog onOpenChange={setIsOpen} open={isOpen} />
    </LoginModalContext.Provider>
  )
}
