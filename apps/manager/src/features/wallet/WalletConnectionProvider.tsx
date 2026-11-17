import { useHotkeySequence } from '@tanstack/react-hotkeys'
import {
  type GetConnectionReturnType,
  getConnection,
  watchConnection,
} from '@wagmi/core'
import { useMachine } from '@xstate/react'
import { type ReactNode, useCallback, useEffect, useMemo } from 'react'
import { type Connector, useConnect, useSwitchChain } from 'wagmi'
import { fromCallback, fromPromise } from 'xstate'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { signInBackend } from '@/features/notifications/data/queries/auth'
import { useSmartAccountContextSafe } from '@/lib/smart-account/SmartAccountContext'
import { cn } from '@/lib/utils'
import { wagmiConfig } from '@/lib/wagmi'
import { useWalletDisconnect } from '@/lib/wallet'
import { connectWallet } from '@/lib/wallet/stacks/custom/connect.helpers'
import { WalletPicker } from '@/lib/wallet/stacks/custom/WalletPicker'
import { ConnectModalContext } from '@/lib/wallet/useConnectModal'
import { backendAuthStore } from '@/utils/backend-client'
import { SignInContent } from './components/SignInContent'
import {
  isSmartAccountSettled,
  walletConnectionMachine,
} from './walletConnection.machine'

const machine = walletConnectionMachine.provide({
  actors: {
    observeConnection: fromCallback(({ sendBack }) => {
      const report = (
        connection: GetConnectionReturnType,
        previous?: GetConnectionReturnType,
      ) => {
        if (connection.status === previous?.status) return
        if (connection.isConnected || connection.status === 'disconnected') {
          sendBack({
            type: 'CONNECTION_CHANGED',
            isConnected: connection.isConnected,
            isReconnected: previous?.status === 'reconnecting',
          })
        }
      }
      const unsubscribe = watchConnection(wagmiConfig, { onChange: report })
      report(getConnection(wagmiConfig))
      return unsubscribe
    }),
    observeAuth: fromCallback(({ sendBack }) => {
      const report = () => {
        const { authKey, modalDismissed } = backendAuthStore.get().context
        sendBack({
          type: 'AUTH_CHANGED',
          isSignInNeeded: !authKey && !modalDismissed,
        })
      }
      const subscription = backendAuthStore.subscribe(report)
      report()
      return () => subscription.unsubscribe()
    }),
    signIn: fromPromise(({ input }) => signInBackend({ walletClient: input })),
  },
  actions: {
    dismissAuth: () => backendAuthStore.trigger.dismissModal(),
    reportSignInError: (_, { error }) =>
      console.error('Failed to sign in:', error),
  },
})
const focusOnMount = (element: HTMLElement | null) => element?.focus()

export const WalletConnectionProvider = ({
  children,
}: {
  readonly children?: ReactNode
}) => {
  const account = useSmartAccountContextSafe()
  const { disconnect, isDisconnecting } = useWalletDisconnect()
  const { mutateAsync: connectAsync } = useConnect()
  const { switchChainAsync } = useSwitchChain()
  const isAccountSettled = isSmartAccountSettled(account)
  const walletClient = account?.walletClient ?? null
  const [state, send] = useMachine(
    machine.provide({
      actors: {
        connect: fromPromise(({ input }) =>
          connectWallet(input, wagmiConfig.chains, {
            connect: connectAsync,
            switchChain: switchChainAsync,
          }),
        ),
      },
    }),
    {
      input: {
        isAccountSettled,
      },
    },
  )
  useEffect(() => {
    send({ type: 'ACCOUNT_UPDATED', isAccountSettled })
  }, [send, isAccountSettled])

  const openConnectModal = useCallback(() => send({ type: 'OPEN' }), [send])
  const isOpen = state.hasTag('open')
  const isAuth = state.hasTag('auth')
  const isSigning = state.hasTag('signing')
  const connectModalOpen = isOpen && state.context.entry === 'connect'
  const value = useMemo(
    () => ({ openConnectModal, connectModalOpen }),
    [openConnectModal, connectModalOpen],
  )

  useHotkeySequence(['S', 'K', 'I', 'P'], () => send({ type: 'SKIP' }), {
    enabled: isAuth,
    ignoreInputs: true,
    preventDefault: false,
    stopPropagation: false,
    timeout: 1000,
  })

  const handleConnect = (connector: Connector) =>
    send({ type: 'CONNECT', connector })
  const handleSignIn = () => {
    if (walletClient) send({ type: 'SIGN_IN', walletClient })
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
          {state.matches({ dialog: 'choosing' }) && (
            <WalletPicker
              error={state.context.connectionError}
              onConnect={handleConnect}
              pendingConnectorId={state.context.pendingConnectorId}
            />
          )}
          {isAuth && (
            <SignInContent
              actions={{
                signIn: handleSignIn,
                skip: () => send({ type: 'SKIP' }),
                confirmSkip: () => send({ type: 'CONFIRM_SKIP' }),
                disconnect: () => void disconnect(),
              }}
              isConfirmingSkip={state.hasTag('confirmSkip')}
              status={{
                isPending: isSigning,
                isError: state.hasTag('signInError'),
                isPreparing: !isAccountSettled,
                isDisconnecting,
                hasWalletClient: Boolean(walletClient),
              }}
              titleRef={focusOnMount}
            />
          )}
        </DialogContent>
      </Dialog>
    </ConnectModalContext.Provider>
  )
}
