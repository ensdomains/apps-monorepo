import { useHotkeySequence } from '@tanstack/react-hotkeys'
import { useMutation } from '@tanstack/react-query'
import { useMachine } from '@xstate/react'
import { useSelector } from '@xstate/store-react'
import { type ReactNode, useCallback, useEffect, useMemo } from 'react'
import { match } from 'ts-pattern'
import {
  type Connector,
  useConnect,
  useConnection,
  useConnectionEffect,
  useSwitchChain,
} from 'wagmi'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { signInBackendMutation } from '@/features/notifications/data/queries/auth'
import { useSmartAccountContextSafe } from '@/lib/smart-account/SmartAccountContext'
import { cn } from '@/lib/utils'
import { wagmiConfig } from '@/lib/wagmi'
import { useWalletDisconnect } from '@/lib/wallet'
import {
  connectWallet,
  WALLETCONNECT_ID,
} from '@/lib/wallet/stacks/custom/connect.helpers'
import { WalletPicker } from '@/lib/wallet/stacks/custom/WalletPicker'
import { ConnectModalContext } from '@/lib/wallet/useConnectModal'
import { backendAuthStore } from '@/utils/backend-client'
import { SignInContent } from './components/SignInContent'
import {
  isSmartAccountSettled,
  walletConnectionMachine,
} from './walletConnection.machine'

const machine = walletConnectionMachine.provide({
  actions: { dismissAuth: () => backendAuthStore.trigger.dismissModal() },
})
const focusOnMount = (element: HTMLElement | null) => element?.focus()

export const WalletConnectionProvider = ({
  children,
}: {
  readonly children?: ReactNode
}) => {
  const { isConnected } = useConnection()
  const account = useSmartAccountContextSafe()
  const isSignInNeeded = useSelector(
    backendAuthStore,
    (state) => !state.context.authKey && state.context.modalDismissed === false,
  )
  const signIn = useMutation(signInBackendMutation)
  const { disconnect, isDisconnecting } = useWalletDisconnect()
  const { mutateAsync: connectAsync } = useConnect()
  const { switchChainAsync } = useSwitchChain()
  const isAccountSettled = isSmartAccountSettled(account)
  const session = useMemo(
    () => ({
      isConnected,
      isSignInNeeded,
      isAccountSettled,
      isSigning: signIn.isPending,
      hasSignInError: signIn.isError,
    }),
    [
      isConnected,
      isSignInNeeded,
      isAccountSettled,
      signIn.isPending,
      signIn.isError,
    ],
  )
  const [state, send, actor] = useMachine(machine, { input: session })
  useEffect(() => {
    send({ type: 'SESSION_UPDATED', session })
  }, [send, session])
  useConnectionEffect({
    onConnect: ({ isReconnected }) =>
      send({ type: 'CONNECTED', isReconnected }),
    onDisconnect: () => send({ type: 'DISCONNECTED' }),
  })

  const openConnectModal = useCallback(() => send({ type: 'OPEN' }), [send])
  const isOpen = state.hasTag('open')
  const isAuth = state.hasTag('auth')
  const connectModalOpen = isOpen && state.context.entry === 'connect'
  const value = useMemo(
    () => ({ openConnectModal, connectModalOpen }),
    [openConnectModal, connectModalOpen],
  )

  useHotkeySequence(['S', 'K', 'I', 'P'], () => send({ type: 'SKIP' }), {
    enabled: isAuth && !signIn.isPending,
    ignoreInputs: true,
    preventDefault: false,
    stopPropagation: false,
    timeout: 1000,
  })

  const handleConnect = async (connector: Connector) => {
    const event = {
      type: 'CONNECT',
      connectorId: connector.uid,
      usesOwnModal: connector.id === WALLETCONNECT_ID,
    } as const
    if (!actor.getSnapshot().can(event)) return
    send(event)
    const outcome = await connectWallet(connector, wagmiConfig.chains, {
      connect: connectAsync,
      switchChain: switchChainAsync,
    })
    send({ type: 'CONNECT_RESULT', outcome, usesOwnModal: event.usesOwnModal })
  }
  const handleSignIn = async () => {
    if (!account?.walletClient || !actor.getSnapshot().can({ type: 'SIGN_IN' }))
      return
    send({ type: 'SIGN_IN' })
    try {
      await signIn.mutateAsync({ walletClient: account.walletClient })
    } catch (error) {
      console.error('Failed to sign in:', error)
    }
  }
  const preventAuthDismissal = (event: Event) => {
    if (isAuth) event.preventDefault()
  }

  return (
    <ConnectModalContext.Provider value={value}>
      {children}
      <Dialog
        onOpenChange={(open) => {
          if (!open) send({ type: 'DISMISS' })
        }}
        open={isOpen}
      >
        <DialogContent
          className={cn(
            'p-8 data-[state=closed]:hidden sm:max-w-100',
            isAuth ? 'gap-6' : 'gap-5',
          )}
          onEscapeKeyDown={preventAuthDismissal}
          onInteractOutside={preventAuthDismissal}
          onOpenAutoFocus={preventAuthDismissal}
          role={isAuth ? 'alertdialog' : 'dialog'}
          showCloseButton={!isAuth}
        >
          {match(state.value)
            .with('choosing', () => (
              <WalletPicker
                error={
                  state.context.connection.status === 'failed'
                    ? state.context.connection.message
                    : undefined
                }
                onConnect={handleConnect}
                pendingConnectorId={
                  'connectorId' in state.context.connection
                    ? state.context.connection.connectorId
                    : undefined
                }
              />
            ))
            .with('signIn', 'confirmSkip', () => (
              <SignInContent
                actions={{
                  signIn: handleSignIn,
                  skip: () => send({ type: 'SKIP' }),
                  confirmSkip: () => send({ type: 'CONFIRM_SKIP' }),
                  disconnect: () => void disconnect(),
                }}
                isConfirmingSkip={state.matches('confirmSkip')}
                status={{
                  isPending: signIn.isPending,
                  isError: signIn.isError,
                  isPreparing: !state.context.session.isAccountSettled,
                  isDisconnecting,
                  hasWalletClient: Boolean(account?.walletClient),
                }}
                titleRef={focusOnMount}
              />
            ))
            .otherwise(() => null)}
        </DialogContent>
      </Dialog>
    </ConnectModalContext.Provider>
  )
}
