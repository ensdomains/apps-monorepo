import type { ConnectErrorType } from '@wagmi/core'
import { useSelector } from '@xstate/react'
import { createAtom } from '@xstate/store'
import { useAtom } from '@xstate/store/react'
import { Loader2, LoaderIcon, WalletIcon } from 'lucide-react'
import { match } from 'ts-pattern'
import { useConnect, useConnection, useConnectionEffect } from 'wagmi'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { para, paraMachine } from '../machines/para'
import { ParaAuth } from './ParaAuth'

export const WalletModalOpenAtom = createAtom(false)

const getErrorMessage = (error: ConnectErrorType) => {
  switch (error.name) {
    case 'ConnectorAlreadyConnectedError':
      return 'This wallet is already connected. Please disconnect first or try a different wallet.'
    case 'UserRejectedRequestError':
      return 'Connection was rejected. Please approve the connection request in your wallet.'
    default:
      return `${error.name}: (${error.message})`
  }
}

const DisconnectedContent = () => {
  const {
    connect,
    connectors,
    isPending: isConnecting,
    isError,
    error,
    variables,
  } = useConnect()

  const connectingConnector =
    typeof variables?.connector === 'object' ? variables?.connector : null

  return (
    <>
      <DialogHeader>
        <DialogTitle>Connect Wallet</DialogTitle>
        <DialogDescription>
          Choose a wallet to connect to the application
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-3">
        {connectors.map((connector) => {
          const isCurrentlyConnecting =
            connectingConnector?.id === connector.id && isConnecting
          const isDisabled = isConnecting || isCurrentlyConnecting

          return (
            <Button
              key={connector.id}
              variant={isCurrentlyConnecting ? 'default' : 'secondary'}
              type="button"
              size="lg"
              className="justify-start"
              disabled={isDisabled}
              onClick={() => connect({ connector })}
            >
              <div className="flex w-full items-center gap-3">
                {connector.icon && (
                  <img
                    src={connector.icon}
                    alt={connector.name}
                    className="size-6 rounded-md"
                  />
                )}
                <span className="flex-1 text-left font-medium">
                  {connector.name}
                </span>
                {isCurrentlyConnecting && (
                  <LoaderIcon className="h-5 w-5 animate-spin text-white" />
                )}
              </div>
            </Button>
          )
        })}
      </div>

      {connectors.length === 0 && (
        <div className="py-8 text-center text-gray-500">
          <WalletIcon className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p>No wallet connectors available</p>
          <p className="text-sm">
            Make sure you have a wallet extension installed
          </p>
        </div>
      )}
      <DialogFooter>
        {isConnecting && (
          <Alert className="mb-6 border-blue-200 bg-blue-50">
            <LoaderIcon className="h-4 w-4 animate-spin text-blue-600" />
            <AlertDescription className="text-blue-800">
              Connecting to {connectingConnector?.name}...
              <br />
              Please approve the connection in your wallet.
            </AlertDescription>
          </Alert>
        )}

        {isError && (
          <Alert className="mb-6 border-red-200 bg-red-50">
            <AlertDescription className="text-red-800">
              {getErrorMessage(error as ConnectErrorType)}
            </AlertDescription>
          </Alert>
        )}
      </DialogFooter>
    </>
  )
}

export const WalletModal = () => {
  const isOpen = useAtom(WalletModalOpenAtom)
  const isParaModalOpen = useSelector(
    paraMachine,
    (state) => state.value !== 'closed',
  )
  const { isConnected } = useConnection()

  useConnectionEffect({
    onConnect() {
      WalletModalOpenAtom.set(false)
      paraMachine.send({
        type: 'CLOSE',
      })
    },
    onDisconnect() {
      para.logout()
    },
  })

  // Show Para modal when paraModalOpenAtom is true
  if (isParaModalOpen) {
    return (
      <Dialog
        open={isParaModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            paraMachine.send({
              type: 'CLOSE',
            })
          } else {
            paraMachine.send({
              type: 'OPEN',
            })
          }
        }}
      >
        <DialogContent>
          <ParaAuth />
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog
      open={isOpen && !isConnected}
      onOpenChange={WalletModalOpenAtom.set}
    >
      <DialogContent>
        {isConnected ? (
          <div>
            <h1>Connected</h1>
          </div>
        ) : (
          <DisconnectedContent />
        )}
      </DialogContent>
    </Dialog>
  )
}

export const ConnectButton = () => {
  const { status } = useConnection()
  const isOpen = useAtom(WalletModalOpenAtom)

  if (status === 'connected') {
    return
  }

  return (
    <Button
      variant="connectWallet"
      onClick={() => WalletModalOpenAtom.set(true)}
      disabled={status !== 'disconnected'}
    >
      {match(status)
        .with('disconnected', () => 'Connect')
        .with('reconnecting', () => 'Reconnecting...')
        .with('connecting', () => 'Connecting...')
        .exhaustive()}
      {isOpen && <Loader2 className="size-4 animate-spin" />}
    </Button>
  )
}
