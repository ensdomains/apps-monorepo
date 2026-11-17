import { Trans } from '@lingui/react/macro'
import { Wallet } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import type { Connector } from 'wagmi'
import { useConnectors } from 'wagmi'
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  isCoinbase,
  isMetaMask,
  METAMASK_DOWNLOAD_URL,
  WALLETCONNECT_ID,
} from './connect.helpers'
import { CoinbaseIcon, MetaMaskIcon, WalletConnectIcon } from './WalletIcons'

type WalletRowProps = {
  readonly icon: ReactNode
  readonly name: string
  readonly badge?: string
  readonly isPending?: boolean
  readonly disabled?: boolean
} & (
  | { readonly onClick: () => void; readonly href?: never }
  | { readonly href: string; readonly onClick?: never }
)

const WalletRow = ({
  icon,
  name,
  badge,
  isPending,
  disabled,
  onClick,
  href,
}: WalletRowProps) => {
  const content = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-xs">
        {icon}
      </span>
      <span className="font-medium text-sm">{name}</span>
      <span className="ml-auto text-muted-foreground text-xs">
        {isPending ? 'Connecting…' : badge}
      </span>
    </>
  )

  const className = cn(
    'flex w-full cursor-pointer items-center gap-3 rounded-xs border bg-background px-3 py-2.5 text-left transition-colors',
    'hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-60',
  )

  if (href) {
    return (
      <a
        aria-label={`Install ${name}`}
        className={className}
        href={href}
        rel="noreferrer"
        target="_blank"
      >
        {content}
      </a>
    )
  }

  return (
    <button
      className={className}
      disabled={disabled || isPending}
      onClick={onClick}
      type="button"
    >
      {content}
    </button>
  )
}

// A single row in the connect list: either a connectable wallet (has a
// `connector`) or a link out to install one (has an `href`).
type WalletOption = {
  readonly key: string
  readonly icon: ReactNode
  readonly name: string
  readonly badge?: string
} & (
  | { readonly connector: Connector; readonly href?: never }
  | { readonly href: string; readonly connector?: never }
)

type WalletPickerProps = {
  readonly pendingConnectorId?: string
  readonly error?: string
  readonly onConnect: (connector: Connector) => void
}

export const WalletPicker = ({
  pendingConnectorId,
  error,
  onConnect,
}: WalletPickerProps) => {
  const connectors = useConnectors()
  const isConnecting = pendingConnectorId !== undefined
  const metaMask = connectors.find(isMetaMask)
  const coinbase = connectors.find(isCoinbase)
  const walletConnect = connectors.find((c) => c.id === WALLETCONNECT_ID)

  // Other injected wallets (Rabby, Frame, …), deduped by `uid` so wallets that
  // share a display name aren't collapsed into one.
  const otherWallets = useMemo(() => {
    const seen = new Set<string>()
    return connectors.filter((c) => {
      if (c.type !== 'injected' || isMetaMask(c) || isCoinbase(c)) return false
      if (seen.has(c.uid)) return false
      seen.add(c.uid)
      return true
    })
  }, [connectors])

  // Curated wallets first, in priority order; MetaMask falls back to an install
  // link when it isn't detected.
  const prioritizedWallets: WalletOption[] = [
    metaMask
      ? {
          key: 'metamask',
          icon: <MetaMaskIcon className="size-8" />,
          name: 'MetaMask',
          badge: 'Detected',
          connector: metaMask,
        }
      : {
          key: 'metamask',
          icon: <MetaMaskIcon className="size-8" />,
          name: 'MetaMask',
          badge: 'Install',
          href: METAMASK_DOWNLOAD_URL,
        },
    ...(coinbase
      ? [
          {
            key: 'coinbase',
            icon: <CoinbaseIcon className="size-8" />,
            name: 'Coinbase Wallet',
            connector: coinbase,
          },
        ]
      : []),
    ...(walletConnect
      ? [
          {
            key: 'walletconnect',
            icon: <WalletConnectIcon className="size-8" />,
            name: 'WalletConnect',
            connector: walletConnect,
          },
        ]
      : []),
  ]

  // EIP-6963-discovered injected wallets, shown after the curated ones.
  const discoveredWallets: WalletOption[] = otherWallets.map((connector) => ({
    key: connector.uid,
    icon: connector.icon ? (
      <img alt="" className="size-8 rounded-xs" src={connector.icon} />
    ) : (
      <Wallet className="size-5 text-muted-foreground" />
    ),
    name: connector.name,
    connector,
  }))

  const renderWallet = (option: WalletOption) => {
    if (!option.connector) {
      return (
        <WalletRow
          badge={option.badge}
          href={option.href}
          icon={option.icon}
          key={option.key}
          name={option.name}
        />
      )
    }
    const { connector } = option
    return (
      <WalletRow
        badge={option.badge}
        disabled={isConnecting}
        icon={option.icon}
        isPending={pendingConnectorId === connector.uid}
        key={option.key}
        name={option.name}
        onClick={() => onConnect(connector)}
      />
    )
  }

  return (
    <>
      <DialogHeader className="items-center text-center sm:text-center">
        <DialogTitle className="font-medium text-ens-blue-midnight text-xl tracking-tight">
          Connect a wallet
        </DialogTitle>
        <DialogDescription className="sr-only">
          <Trans>Choose a wallet to connect to the ENS App.</Trans>
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        {prioritizedWallets.map(renderWallet)}
        {discoveredWallets.length > 0 && (
          <div className="mt-1 flex items-center gap-2 px-1">
            <span className="h-px flex-1 bg-border" />
            <span className="text-muted-foreground text-xs">Detected</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        )}
        {discoveredWallets.map(renderWallet)}
      </div>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </>
  )
}
