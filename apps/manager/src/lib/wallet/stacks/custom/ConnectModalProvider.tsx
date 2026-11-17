import { type ReactNode, useCallback, useMemo, useReducer } from 'react'
import { useConnectionEffect } from 'wagmi'
import { BackendAuthModal } from '@/features/wallet/components/BackendAuthModal'
import { ConnectModalContext } from '../../useConnectModal'
import { isConnectDialogOpen, nextConnectFlow } from './connectFlow'

// Owns the dialog lifecycle and renders below the smart-account provider.
export const ConnectModalProvider = ({ children }: { children: ReactNode }) => {
  const [connectFlow, sendConnectFlow] = useReducer(nextConnectFlow, 'closed')
  const openConnectModal = useCallback(() => sendConnectFlow('opened'), [])

  // Subscribe to connections, eager reconnects and disconnects.
  const onConnect = useCallback(
    ({ isReconnected }: { readonly isReconnected: boolean }) =>
      sendConnectFlow(isReconnected ? 'reconnected' : 'connected'),
    [],
  )
  const onDisconnect = useCallback(() => sendConnectFlow('disconnected'), [])
  useConnectionEffect({ onConnect, onDisconnect })

  const value = useMemo(
    () => ({
      openConnectModal,
      connectModalOpen: isConnectDialogOpen(connectFlow),
    }),
    [openConnectModal, connectFlow],
  )

  return (
    <ConnectModalContext.Provider value={value}>
      {children}
      <BackendAuthModal
        connectFlow={connectFlow}
        onFlowEvent={sendConnectFlow}
      />
    </ConnectModalContext.Provider>
  )
}
