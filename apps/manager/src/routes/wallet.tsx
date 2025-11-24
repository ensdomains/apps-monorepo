import { createFileRoute } from '@tanstack/react-router'
import { useSelector } from '@xstate/react'
import { CheckCircle, LoaderIcon, WalletIcon, XCircle } from 'lucide-react'
import { useConnect, useConnection, useDisconnect } from 'wagmi'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { paraMachine } from '@/features/wallet/machines/para'

export const Route = createFileRoute('/wallet')({
  component: RouteComponent,
  ssr: false,
})

const ConnectMenu = () => {
  const { connect, connectors, data, error, status, variables } = useConnect()

  const connectingConnector =
    typeof variables?.connector === 'object' ? variables?.connector.id : null

  const isConnecting = status === 'pending'
  const isSuccess = status === 'success'
  const hasError = status === 'error'

  console.log('ConnectMenu', {
    data,
    error,
    status,
    variables,
  })

  const isParaModalOpen = useSelector(
    paraMachine,
    (state) => state.value !== 'closed',
  )

  const handleConnect = (connector: any) => {
    console.log('Connecting to:', connector)
    connect({ connector })
  }

  // Enhanced error message handling
  const getErrorMessage = (error: any) => {
    if (!error) return 'An unknown error occurred while connecting'

    // Handle specific wagmi error types
    if (error.name === 'ConnectorAlreadyConnectedError') {
      return 'This wallet is already connected. Please disconnect first or try a different wallet.'
    }

    if (error.name === 'UserRejectedRequestError') {
      return 'Connection was rejected. Please approve the connection request in your wallet.'
    }

    if (error.name === 'ResourceUnavailableRpcError') {
      return 'Network error. Please check your internet connection and try again.'
    }

    if (error.name === 'SwitchChainError') {
      return 'Failed to switch network. Please try switching networks manually in your wallet.'
    }

    if (error.name === 'ChainMismatchError') {
      return 'Network mismatch. Please ensure your wallet is connected to the correct network.'
    }

    if (error.name === 'InsufficientFundsError') {
      return 'Insufficient funds for transaction fees. Please add more funds to your wallet.'
    }

    // Handle common error messages
    if (error.message) {
      const message = error.message.toLowerCase()

      if (
        message.includes('user rejected') ||
        message.includes('user denied')
      ) {
        return 'Connection was rejected. Please approve the connection request in your wallet.'
      }

      if (message.includes('network') || message.includes('rpc')) {
        return 'Network error. Please check your connection and try again.'
      }

      if (message.includes('timeout') || message.includes('timed out')) {
        return 'Connection timed out. Please try again.'
      }

      if (message.includes('already connected')) {
        return 'This wallet is already connected. Please try a different wallet.'
      }

      if (message.includes('no provider') || message.includes('no wallet')) {
        return 'No wallet detected. Please install a wallet extension and refresh the page.'
      }

      if (message.includes('unsupported chain')) {
        return 'Unsupported network. Please switch to a supported network in your wallet.'
      }
    }

    // Fallback to original error message or generic message
    return (
      error.message ||
      'An unexpected error occurred while connecting to your wallet'
    )
  }

  const getErrorIcon = (error: any) => {
    if (!error) return <XCircle className="h-4 w-4 text-red-600" />

    // Different icons for different error types
    if (error.name === 'UserRejectedRequestError') {
      return <XCircle className="h-4 w-4 text-orange-600" />
    }

    if (error.name === 'ConnectorAlreadyConnectedError') {
      return <XCircle className="h-4 w-4 text-blue-600" />
    }

    if (error.name === 'ResourceUnavailableRpcError') {
      return <XCircle className="h-4 w-4 text-yellow-600" />
    }

    return <XCircle className="h-4 w-4 text-red-600" />
  }

  const getErrorVariant = (error: any) => {
    if (!error) return 'destructive'

    // Different alert variants for different error types
    if (error.name === 'UserRejectedRequestError') {
      return 'default' // Less severe - user action
    }

    if (error.name === 'ConnectorAlreadyConnectedError') {
      return 'secondary' // Informational
    }

    if (error.name === 'ResourceUnavailableRpcError') {
      return 'default' // Network issues
    }

    return 'destructive' // Default for other errors
  }

  return (
    <>
      <h1 className="mb-6 text-center font-bold text-3xl text-gray-800">
        Connect a Wallet
      </h1>

      {/* Status Messages */}
      {isConnecting && (
        <Alert className="mb-6 border-blue-200 bg-blue-50">
          <LoaderIcon className="h-4 w-4 animate-spin text-blue-600" />
          <AlertDescription className="text-blue-800">
            Connecting to {connectingConnector}... Please approve the connection
            in your wallet.
          </AlertDescription>
        </Alert>
      )}

      {isSuccess && (
        <Alert className="mb-6 border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Successfully connected! You can now use the application.
          </AlertDescription>
        </Alert>
      )}

      {hasError && error && (
        <Alert
          className={`mb-6 ${getErrorVariant(error) === 'destructive' ? 'border-red-200 bg-red-50' : getErrorVariant(error) === 'secondary' ? 'border-blue-200 bg-blue-50' : 'border-orange-200 bg-orange-50'}`}
        >
          {getErrorIcon(error)}
          <AlertDescription
            className={
              getErrorVariant(error) === 'destructive'
                ? 'text-red-800'
                : getErrorVariant(error) === 'secondary'
                  ? 'text-blue-800'
                  : 'text-orange-800'
            }
          >
            <strong>Connection failed:</strong> {getErrorMessage(error)}
          </AlertDescription>
        </Alert>
      )}

      {/* Para Modal Debug Info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-gray-600 text-sm">Debug Info</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600 text-sm">
            Para modal open: {isParaModalOpen.toString()}
          </p>
          {isParaModalOpen && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => paraMachine.send({ type: 'CLOSE' })}
              className="mt-2"
            >
              Close Para Modal
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Wallet Connectors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <WalletIcon className="h-5 w-5" />
            Available Wallets
          </CardTitle>
          <CardDescription>
            Choose a wallet to connect to the application
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            {connectors.map((connector) => {
              const isCurrentlyConnecting =
                connectingConnector === connector.id && isConnecting
              const isDisabled = isConnecting || isCurrentlyConnecting

              return (
                <Button
                  key={connector.id}
                  variant={isCurrentlyConnecting ? 'default' : 'secondary'}
                  type="button"
                  className="h-14 justify-start"
                  disabled={isDisabled}
                  onClick={() => handleConnect(connector)}
                >
                  <div className="flex w-full items-center gap-3">
                    {connector.icon && (
                      <img
                        src={connector.icon}
                        alt={connector.name}
                        className="h-8 w-8 rounded-full border border-gray-200 bg-white"
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
        </CardContent>
      </Card>
    </>
  )
}

const DisconnectMenu = () => {
  const { disconnect } = useDisconnect()
  const { address, connector } = useConnection()

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  return (
    <>
      <h1 className="mb-6 text-center font-bold text-3xl text-gray-800">
        Wallet Connected
      </h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Connection Details
          </CardTitle>
          <CardDescription>
            Your wallet is successfully connected to the application
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
            <span className="font-medium text-gray-600 text-sm">
              Wallet Address:
            </span>
            <span className="rounded border bg-white px-2 py-1 font-mono text-sm">
              {formatAddress(address || '')}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
            <span className="font-medium text-gray-600 text-sm">
              Connected via:
            </span>
            <span className="font-medium text-sm">
              {connector?.name || 'Unknown'}
            </span>
          </div>

          <Button
            onClick={() => disconnect()}
            variant="destructive"
            className="w-full"
          >
            Disconnect Wallet
          </Button>
        </CardContent>
      </Card>
    </>
  )
}

function RouteComponent() {
  const { isConnected, status, chainId } = useConnection()
  // console.log(connectors)
  console.log('RouteComponent', {
    isConnected,
    status,
    chainId,
  })
  return (
    <div className="mx-auto max-w-2xl">
      {isConnected ? <DisconnectMenu /> : <ConnectMenu />}
    </div>
  )
}
