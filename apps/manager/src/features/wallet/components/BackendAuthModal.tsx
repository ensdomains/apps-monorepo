import { useSelector } from '@xstate/store-react'
import { useEffect } from 'react'
import { useConnection } from 'wagmi'
import * as AlertDialog from '@/components/ui/alert-dialog'
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSmartAccountContextSafe } from '@/lib/smart-account/SmartAccountContext'
import { ConnectWalletDialog } from '@/lib/wallet/stacks/custom/ConnectWalletDialog'
import type {
  ConnectFlow,
  ConnectFlowEvent,
} from '@/lib/wallet/stacks/custom/connectFlow'
import { backendAuthStore } from '@/utils/backend-client'
import { useBackendSignIn } from '../hooks/useBackendSignIn'
import { getWalletDialogView, isSmartAccountSettled } from '../walletDialogView'
import { SignInContent, type SignInSlots } from './SignInContent'

const ALERT_DIALOG_SLOTS: SignInSlots = {
  Header: AlertDialog.Header,
  Title: AlertDialog.Title,
  Description: AlertDialog.Description,
  Footer: AlertDialog.Footer,
}

const DIALOG_SLOTS: SignInSlots = {
  Header: DialogHeader,
  Title: DialogTitle,
  Description: DialogDescription,
  Footer: DialogFooter,
}

const NOOP_FLOW_EVENT = () => {}

type BackendAuthModalProps = {
  readonly connectFlow?: ConnectFlow
  readonly onFlowEvent?: (event: ConnectFlowEvent) => void
}

export const BackendAuthModal = ({
  connectFlow = 'closed',
  onFlowEvent = NOOP_FLOW_EVENT,
}: BackendAuthModalProps) => {
  const isSignInNeeded = useSelector(
    backendAuthStore,
    (state) => !state.context.authKey && state.context.modalDismissed === false,
  )
  useEffect(() => {
    if (connectFlow === 'signing-in' && !isSignInNeeded) onFlowEvent('finished')
  }, [isSignInNeeded, connectFlow, onFlowEvent])
  const { isConnected: isWalletConnected } = useConnection()

  // Sign in with the smart account's wallet client, once it is live.
  const smartAccount = useSmartAccountContextSafe()
  const isAccountSettled = isSmartAccountSettled(smartAccount)

  const view = getWalletDialogView({
    connectFlow,
    isConnected: isWalletConnected,
    isSignInNeeded,
    isAccountSettled,
  })

  const signIn = useBackendSignIn({
    isShown: view === 'sign-in-step' || view === 'standalone-sign-in',
    walletClient: smartAccount?.walletClient,
  })

  return (
    <>
      <ConnectWalletDialog
        onFlowEvent={onFlowEvent}
        signInStep={({ titleRef }) => (
          <SignInContent
            footerClassName="grid grid-cols-1 *:w-full"
            isPreparing={!isAccountSettled}
            slots={DIALOG_SLOTS}
            state={signIn}
            titleRef={titleRef}
          />
        )}
        view={view}
      />
      <AlertDialog.Root open={view === 'standalone-sign-in'}>
        <AlertDialog.Content
          className="grid-cols-1 gap-6 border-ens-gray-two p-6 sm:max-w-sm sm:p-8"
          onEscapeKeyDown={(event) => {
            event.preventDefault()
          }}
        >
          <SignInContent
            isPreparing={!isAccountSettled}
            slots={ALERT_DIALOG_SLOTS}
            state={signIn}
          />
        </AlertDialog.Content>
      </AlertDialog.Root>
    </>
  )
}
