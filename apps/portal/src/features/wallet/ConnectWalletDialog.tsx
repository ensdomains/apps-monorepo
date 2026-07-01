import { Wallet } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import type { Connector } from 'wagmi'
import { useConnect, useConnectors } from 'wagmi'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  isCoinbase,
  isConnectionCancelled,
  isMetaMask,
  METAMASK_DOWNLOAD_URL,
  normalizeConnectError,
  WALLETCONNECT_ID,
} from './connect.helpers'
import { CoinbaseIcon, MetaMaskIcon, WalletConnectIcon } from './WalletIcons'

type WalletRowProps = {
  readonly icon: ReactNode
  readonly name: string
  readonly badge?: string
  readonly pending?: boolean
  readonly disabled?: boolean
} & (
  | { readonly onClick: () => void; readonly href?: never }
  | { readonly href: string; readonly onClick?: never }
)

const WalletRow = ({
  icon,
  name,
  badge,
  pending,
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
        {pending ? 'Connecting…' : badge}
      </span>
    </>
  )

  const className = cn(
    'flex w-full cursor-pointer items-center gap-3 rounded-sm border border-transparent bg-secondary/60 px-3 py-2.5 text-left transition-colors',
    'hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-60',
  )

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={className}
        aria-label={`Install ${name}`}
      >
        {content}
      </a>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pending}
      className={className}
    >
      {content}
    </button>
  )
}

type ConnectWalletDialogProps = {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

export const ConnectWalletDialog = ({
  open,
  onOpenChange,
}: ConnectWalletDialogProps) => {
  const connectors = useConnectors()
  const { mutateAsync: connectAsync } = useConnect()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Clear transient state when the dialog closes so the next open starts fresh.
  // We must NOT clear on open: reopening after a WalletConnect *failure* needs
  // to preserve the error message set in the connect handler.
  useEffect(() => {
    if (!open) {
      setError(null)
      setPendingId(null)
    }
  }, [open])

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

  const connect = async (connector: Connector) => {
    setError(null)

    // WalletConnect renders its own full-screen QR modal, so close ours first
    // to avoid stacking; injected/Coinbase keep ours open with a per-row
    // "Connecting…" state and dismiss it only on success.
    const usesOwnModal = connector.id === WALLETCONNECT_ID
    if (usesOwnModal) {
      onOpenChange(false)
    } else {
      setPendingId(connector.uid)
    }

    try {
      await connectAsync({ connector })
      onOpenChange(false)
    } catch (e) {
      if (usesOwnModal) {
        // Reopen the wallet list; show an error only for a genuine failure, not
        // a user cancel.
        onOpenChange(true)
        if (!isConnectionCancelled(e)) {
          setError(normalizeConnectError(e))
        }
        return
      }

      setError(normalizeConnectError(e))
    } finally {
      setPendingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-100">
        <DialogHeader>
          <DialogTitle>Connect a wallet</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {metaMask ? (
            <WalletRow
              icon={<MetaMaskIcon className="size-8" />}
              name="MetaMask"
              badge="Detected"
              pending={pendingId === metaMask.uid}
              onClick={() => connect(metaMask)}
            />
          ) : (
            <WalletRow
              icon={<MetaMaskIcon className="size-8" />}
              name="MetaMask"
              badge="Install"
              href={METAMASK_DOWNLOAD_URL}
            />
          )}

          {coinbase && (
            <WalletRow
              icon={<CoinbaseIcon className="size-8" />}
              name="Coinbase Wallet"
              pending={pendingId === coinbase.uid}
              onClick={() => connect(coinbase)}
            />
          )}

          {walletConnect && (
            <WalletRow
              icon={<WalletConnectIcon className="size-8" />}
              name="WalletConnect"
              pending={pendingId === walletConnect.uid}
              onClick={() => connect(walletConnect)}
            />
          )}

          {otherWallets.length > 0 && (
            <div className="mt-1 flex items-center gap-2 px-1">
              <span className="h-px flex-1 bg-border" />
              <span className="text-muted-foreground text-xs">Detected</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          )}

          {otherWallets.map((connector) => (
            <WalletRow
              key={connector.uid}
              icon={
                connector.icon ? (
                  <img
                    src={connector.icon}
                    alt=""
                    className="size-8 rounded-xs"
                  />
                ) : (
                  <Wallet className="size-5 text-muted-foreground" />
                )
              }
              name={connector.name}
              pending={pendingId === connector.uid}
              onClick={() => connect(connector)}
            />
          ))}
        </div>

        {error && (
          <p className="text-message-danger-text text-sm" role="alert">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
