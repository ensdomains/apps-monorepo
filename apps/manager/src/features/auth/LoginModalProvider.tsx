import { createContext, useContext, useMemo, useState } from 'react'
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
 * Default value (used when no provider is mounted — e.g. when
 * VITE_PRIVY_APP_ID is unset and auth is disabled) is a no-op, so call sites
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
 * Must be mounted inside PrivyProvider (the dialog uses the headless Privy
 * hooks). When Privy isn't configured it simply isn't mounted, and consumers
 * fall back to the no-op default above.
 */
export const LoginModalProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [isOpen, setIsOpen] = useState(false)

  const value = useMemo<LoginModalContextValue>(
    () => ({
      openLogin: () => setIsOpen(true),
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
