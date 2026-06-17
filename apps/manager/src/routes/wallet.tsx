import { Trans } from '@lingui/react/macro'
import { createFileRoute } from '@tanstack/react-router'
import { CheckCircle, LoaderIcon, WalletIcon, XCircle } from 'lucide-react'
import type { Connector } from 'wagmi'
import { useConnect, useConnection } from 'wagmi'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useConnectModal, useWalletUi } from '@/lib/wallet'

export const Route = createFileRoute('/wallet')({
  component: RouteComponent,
  ssr: false,
})

type ErrorTone = 'destructive' | 'secondary' | 'default'

const TONE_STYLES: Record<
  ErrorTone,
  { alert: string; text: string; icon: string }
> = {
  destructive: {
    alert: 'border-red-200 bg-red-50',
    text: 'text-red-800',
    icon: 'text-red-600',
  },
  secondary: {
    alert: 'border-blue-200 bg-blue-50',
    text: 'text-blue-800',
    icon: 'text-blue-600',
  },
  default: {
    alert: 'border-orange-200 bg-orange-50',
    text: 'text-orange-800',
    icon: 'text-orange-600',
  },
}

// Per wagmi error name: user-facing message + alert tone. Single source of truth
const CONNECT_ERROR_BY_NAME: Record<
  string,
  { message: string; tone: ErrorTone }
> = {
  ConnectorAlreadyConnectedError: {
    message:
      'This wallet is already connected. Please disconnect first or try a different wallet.',
    tone: 'secondary',
  },
  UserRejectedRequestError: {
    message:
      'Connection was rejected. Please approve the connection request in your wallet.',
    tone: 'default',
  },
  ResourceUnavailableRpcError: {
    message:
      'Network error. Please check your internet connection and try again.',
    tone: 'default',
  },
  SwitchChainError: {
    message:
      'Failed to switch network. Please try switching networks manually in your wallet.',
    tone: 'destructive',
  },
  ChainMismatchError: {
    message:
      'Network mismatch. Please ensure your wallet is connected to the correct network.',
    tone: 'destructive',
  },
  InsufficientFundsError: {
    message:
      'Insufficient funds for transaction fees. Please add more funds to your wallet.',
    tone: 'destructive',
  },
}

// Fallback matching on the (lowercased) error text when the name isn't known.
const CONNECT_ERROR_BY_TEXT: ReadonlyArray<{
  needles: string[]
  message: string
}> = [
  {
    needles: ['user rejected', 'user denied'],
    message:
      'Connection was rejected. Please approve the connection request in your wallet.',
  },
  {
    needles: ['network', 'rpc'],
    message: 'Network error. Please check your connection and try again.',
  },
  {
    needles: ['timeout', 'timed out'],
    message: 'Connection timed out. Please try again.',
  },
  {
    needles: ['already connected'],
    message: 'This wallet is already connected. Please try a different wallet.',
  },
  {
    needles: ['no provider', 'no wallet'],
    message:
      'No wallet detected. Please install a wallet extension and refresh the page.',
  },
  {
    needles: ['unsupported chain'],
    message:
      'Unsupported network. Please switch to a supported network in your wallet.',
  },
]

const describeConnectError = (
  error: Error | null,
): { message: string; tone: ErrorTone } => {
  if (!error) {
    return {
      message: 'An unknown error occurred while connecting',
      tone: 'destructive',
    }
  }

  const byName = CONNECT_ERROR_BY_NAME[error.name]
  if (byName) return byName

  const text = error.message?.toLowerCase() ?? ''
  const byText = CONNECT_ERROR_BY_TEXT.find(({ needles }) =>
    needles.some((needle) => text.includes(needle)),
  )
  if (byText) return { message: byText.message, tone: 'destructive' }

  return {
    message:
      error.message ||
      'An unexpected error occurred while connecting to your wallet',
    tone: 'destructive',
  }
}

const ConnectMenu = () => {
  const { connect, connectors, error, status, variables } = useConnect()
  const { openConnectModal } = useConnectModal()

  const connectingConnector =
    typeof variables?.connector === 'object' ? variables?.connector.id : null

  const isConnecting = status === 'pending'
  const isSuccess = status === 'success'
  const hasError = status === 'error'

  const handleConnect = (connector: Connector) => {
    connect({ connector })
  }

  const errorDisplay = error ? describeConnectError(error) : null

  return (
    <>
      <h1 className="mb-6 text-center font-bold text-3xl text-gray-800">
        <Trans>Connect a Wallet</Trans>
      </h1>

      {/* Status Messages */}
      {isConnecting && (
        <Alert className="mb-6 border-blue-200 bg-blue-50">
          <LoaderIcon className="h-4 w-4 animate-spin text-blue-600" />
          <AlertDescription className="text-blue-800">
            <Trans>
              Connecting to {connectingConnector}... Please approve the
              connection in your wallet.
            </Trans>
          </AlertDescription>
        </Alert>
      )}

      {isSuccess && (
        <Alert className="mb-6 border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            <Trans>
              Successfully connected! You can now use the application.
            </Trans>
          </AlertDescription>
        </Alert>
      )}

      {hasError && errorDisplay && (
        <Alert className={`mb-6 ${TONE_STYLES[errorDisplay.tone].alert}`}>
          <XCircle
            className={`h-4 w-4 ${TONE_STYLES[errorDisplay.tone].icon}`}
          />
          <AlertDescription className={TONE_STYLES[errorDisplay.tone].text}>
            <Trans>
              <strong>Connection failed:</strong> {errorDisplay.message}
            </Trans>
          </AlertDescription>
        </Alert>
      )}

      {/* Wallet Connectors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <WalletIcon className="h-5 w-5" />
            <Trans>Available Wallets</Trans>
          </CardTitle>
          <CardDescription>
            <Trans>Choose a wallet to connect to the application</Trans>
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
                  className="h-14 justify-start"
                  disabled={isDisabled}
                  key={connector.id}
                  onClick={() => handleConnect(connector)}
                  type="button"
                  variant={isCurrentlyConnecting ? 'default' : 'secondary'}
                >
                  <div className="flex w-full items-center gap-3">
                    {connector.icon && (
                      <img
                        alt={connector.name}
                        className="h-8 w-8 rounded-full border border-gray-200 bg-white"
                        src={connector.icon}
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
              <p>
                <Trans>No wallet connected yet</Trans>
              </p>
              <p className="mb-4 text-sm">
                <Trans>
                  Sign in with a social account or wallet to get started
                </Trans>
              </p>
              {/* Privy builds wagmi connectors from the signed-in wallet, so
                  there are none pre-login — start the Privy login flow instead. */}
              <Button
                disabled={!openConnectModal}
                onClick={() => openConnectModal?.()}
                type="button"
              >
                <Trans>Sign in</Trans>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

const DisconnectMenu = () => {
  // Shared disconnect clears the Privy session too, not just wagmi.
  const { disconnect } = useWalletUi()
  const { address, connector } = useConnection()

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  return (
    <>
      <h1 className="mb-6 text-center font-bold text-3xl text-gray-800">
        <Trans>Wallet Connected</Trans>
      </h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <Trans>Connection Details</Trans>
          </CardTitle>
          <CardDescription>
            <Trans>
              Your wallet is successfully connected to the application
            </Trans>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
            <span className="font-medium text-gray-600 text-sm">
              <Trans>Wallet Address:</Trans>
            </span>
            <span className="rounded border bg-white px-2 py-1 font-mono text-sm">
              {formatAddress(address || '')}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
            <span className="font-medium text-gray-600 text-sm">
              <Trans>Connected via:</Trans>
            </span>
            <span className="font-medium text-sm">
              {connector?.name || 'Unknown'}
            </span>
          </div>

          <Button
            className="w-full"
            onClick={() => {
              void disconnect()
            }}
            variant="destructive"
          >
            <Trans>Disconnect Wallet</Trans>
          </Button>
        </CardContent>
      </Card>
    </>
  )
}

function RouteComponent() {
  const { isConnected } = useConnection()
  return (
    <div className="mx-auto max-w-2xl">
      {isConnected ? <DisconnectMenu /> : <ConnectMenu />}
    </div>
  )
}
