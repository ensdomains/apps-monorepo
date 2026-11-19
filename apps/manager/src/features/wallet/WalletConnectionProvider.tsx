import { useHotkeySequence } from '@tanstack/react-hotkeys'
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { type WatchConnectionParameters, watchConnection } from '@wagmi/core'
import { useSelector } from '@xstate/store-react'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  type Connector,
  useConfig,
  useConnect,
  useConnection,
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
  didWalletChange,
  getConnectedDialogStep,
  getConnectionError,
  getConnectionResultDialogStep,
  isSmartAccountSettled,
  shouldShowSignIn,
  type WalletDialogStep,
} from './walletConnection.helpers'

const SIGN_IN_MUTATION_KEY = [{ scope: 'walletDialogSignIn' }] as const

const focusOnMount = (element: HTMLElement | null) => element?.focus()

const useWalletConnectionChanges = (
  onChange: WatchConnectionParameters['onChange'],
) => {
  const config = useConfig()
  const onWalletChange = useEffectEvent(onChange)
  // Injected wallets can connect without passing through wagmi's connecting state.
  useEffect(
    () =>
      watchConnection(config, {
        onChange: (current, previous) => onWalletChange(current, previous),
      }),
    [config],
  )
}

export const WalletConnectionProvider = ({
  children,
}: {
  readonly children?: ReactNode
}) => {
  const [step, setStep] = useState<WalletDialogStep>('closed')
  const [isConfirmingSkip, setIsConfirmingSkip] = useState(false)
  const { isConnected } = useConnection()
  const account = useSmartAccountContextSafe()
  const isAccountSettled = isSmartAccountSettled(account)
  const walletClient = account?.walletClient
  const isSignInNeeded = useSelector(
    backendAuthStore,
    (state) => !state.context.authKey && state.context.modalDismissed === false,
  )
  const queryClient = useQueryClient()
  const signIn = useMutation({
    ...signInBackendMutation,
    mutationKey: SIGN_IN_MUTATION_KEY,
  })
  const isSigning = useIsMutating({ mutationKey: SIGN_IN_MUTATION_KEY }) > 0
  const { disconnect, isDisconnecting } = useWalletDisconnect()
  const { mutateAsync: connectAsync } = useConnect()
  const { switchChainAsync } = useSwitchChain()
  const connection = useMutation({
    mutationFn: (connector: Connector) =>
      connectWallet(connector, wagmiConfig.chains, {
        connect: connectAsync,
        switchChain: switchChainAsync,
      }),
  })
  // Keep the lock until chain switching settles, even when a wallet change detaches the result.
  const request = useRef<{ readonly connectorId: string | null } | null>(null)
  useWalletConnectionChanges((current, previous) => {
    if (!didWalletChange(current, previous)) return

    const isReconnected = previous.status === 'reconnecting'
    const isOwnedConnection =
      current.status === 'connected' &&
      request.current?.connectorId === current.connector.uid
    if (request.current && (!isOwnedConnection || isReconnected)) {
      request.current = { connectorId: null }
    }
    signIn.reset()
    setIsConfirmingSkip(false)
    setStep((step) =>
      getConnectedDialogStep({ step, isOwnedConnection, isReconnected }),
    )
  })

  const isSignInStep = step === 'signIn' || step === 'session'
  const isAuth = shouldShowSignIn({
    step,
    isConnected,
    isSignInNeeded,
    isAccountSettled,
  })
  const isOpen = isAuth || step === 'wallets'
  // Reset local UI choices when authentication completes or the prompt closes.
  if (isSignInStep && !isAuth) setStep('closed')
  if (isAuth && step === 'closed') setStep('session')
  if (!isAuth && isConfirmingSkip) setIsConfirmingSkip(false)

  const openConnectModal = useCallback(() => {
    if (request.current === null) connection.reset()
    setStep('wallets')
  }, [connection.reset])
  const connectModalOpen = isOpen && step !== 'closed' && step !== 'session'
  const value = useMemo(
    () => ({ openConnectModal, connectModalOpen }),
    [openConnectModal, connectModalOpen],
  )

  const handleConnect = async (connector: Connector) => {
    if (request.current !== null) return
    const attempt = { connectorId: connector.uid }
    request.current = attempt
    if (connector.id === WALLETCONNECT_ID) setStep('pairing')
    try {
      const outcome = await connection.mutateAsync(connector)
      if (request.current === attempt)
        setStep((current) => getConnectionResultDialogStep(current, outcome))
      else connection.reset()
    } finally {
      request.current = null
    }
  }
  const handleSignIn = async () => {
    if (
      !walletClient ||
      !isAccountSettled ||
      queryClient.isMutating({ mutationKey: SIGN_IN_MUTATION_KEY }) > 0
    )
      return
    setIsConfirmingSkip(false)
    try {
      await signIn.mutateAsync({ walletClient })
    } catch (error) {
      console.error('Failed to sign in:', error)
    }
  }
  const handleSkip = () => {
    if (queryClient.isMutating({ mutationKey: SIGN_IN_MUTATION_KEY }) === 0)
      backendAuthStore.trigger.dismissModal()
  }
  useHotkeySequence(['S', 'K', 'I', 'P'], handleSkip, {
    enabled: isAuth && !isSigning,
    ignoreInputs: true,
    preventDefault: false,
    stopPropagation: false,
    timeout: 1000,
  })
  const preventDialogDefaultInSignIn = (event: Event) => {
    if (isAuth) event.preventDefault()
  }

  return (
    <ConnectModalContext.Provider value={value}>
      {children}
      <Dialog
        onOpenChange={(open) => {
          if (!open && !isAuth) setStep('closed')
        }}
        open={isOpen}
      >
        <DialogContent
          className={cn(
            'p-8 data-[state=closed]:hidden sm:max-w-100',
            isAuth ? 'gap-6' : 'gap-5',
          )}
          onEscapeKeyDown={preventDialogDefaultInSignIn}
          onInteractOutside={preventDialogDefaultInSignIn}
          onOpenAutoFocus={preventDialogDefaultInSignIn}
          role={isAuth ? 'alertdialog' : 'dialog'}
          showCloseButton={!isAuth}
        >
          {step === 'wallets' && !isAuth && (
            <WalletPicker
              error={getConnectionError(
                connection.data,
                connection.variables?.id,
              )}
              onConnect={handleConnect}
              pendingConnectorId={
                connection.isPending ? connection.variables?.uid : undefined
              }
            />
          )}
          {isAuth && (
            <SignInContent
              actions={{
                signIn: handleSignIn,
                skip: handleSkip,
                confirmSkip: () => setIsConfirmingSkip(true),
                disconnect: () => void disconnect(),
              }}
              isConfirmingSkip={isConfirmingSkip}
              status={{
                isPending: isSigning,
                isError: signIn.isError,
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
