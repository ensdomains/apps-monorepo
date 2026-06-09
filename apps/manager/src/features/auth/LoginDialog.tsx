import { SiGoogle, SiX } from '@icons-pack/react-simple-icons'
import { Trans } from '@lingui/react/macro'
import { useMemo, useState } from 'react'
import type { Connector } from 'wagmi'
import { useConnect, useConnectors } from 'wagmi'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MSymbol } from '@/components/ui/material-symbol'
import { usePrivySession } from '@/lib/privy/usePrivySession'

type LoginDialogProps = {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

const buttonClass =
  'inline-flex items-center justify-center gap-3 rounded-lg border border-border bg-white px-4 py-3 font-medium text-foreground text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60'

/**
 * Sign-in dialog offering both social login (Google + X, via Privy's headless
 * redirect OAuth) and external wallets (MetaMask & other EIP-6963-discovered
 * injected wallets, plus WalletConnect — wagmi's own `useConnect`). Privy's
 * `login()` modal is never used; this is our UI over the headless hooks.
 */
export const LoginDialog = ({ open, onOpenChange }: LoginDialogProps) => {
  const { signInWithGoogle, signInWithX, busy, error } = usePrivySession()
  const connectors = useConnectors()
  const { connectAsync } = useConnect()
  // Which external connector is mid-connection, and any failure to surface.
  // We keep the dialog OPEN until a connection succeeds, so a rejected
  // MetaMask prompt / failed WC pairing leaves the user with a retry + message
  // instead of a silently-closed dialog and no recovery path.
  const [connectingUid, setConnectingUid] = useState<string | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)

  const connectExternal = async (connector: Connector) => {
    setConnectError(null)
    setConnectingUid(connector.uid)
    try {
      await connectAsync({ connector })
      onOpenChange(false)
    } catch (e) {
      setConnectError(
        e instanceof Error ? e.message : 'Failed to connect wallet',
      )
    } finally {
      setConnectingUid(null)
    }
  }

  // Everything except our Privy connector (social is handled by the buttons
  // above), de-duplicated by name (EIP-6963 discovery can surface dupes).
  const walletConnectors = useMemo(() => {
    const seen = new Set<string>()
    return connectors.filter((c) => {
      if (c.id === 'privy') return false
      if (seen.has(c.name)) return false
      seen.add(c.name)
      return true
    })
  }, [connectors])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            <Trans>Sign in</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Continue with a social account to create a wallet, or connect an
              existing one.
            </Trans>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <button
            className={buttonClass}
            disabled={busy}
            onClick={() => {
              void signInWithGoogle()
            }}
            type="button"
          >
            <SiGoogle className="size-5" />
            <Trans>Continue with Google</Trans>
          </button>
          <button
            className={buttonClass}
            disabled={busy}
            onClick={() => {
              void signInWithX()
            }}
            type="button"
          >
            <SiX className="size-5" />
            <Trans>Continue with X</Trans>
          </button>
        </div>

        {walletConnectors.length > 0 && (
          <>
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-muted-foreground text-xs uppercase">
                <Trans>or</Trans>
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="flex flex-col gap-2">
              {walletConnectors.map((connector) => (
                <button
                  className={buttonClass}
                  disabled={connectingUid !== null}
                  key={connector.uid}
                  onClick={() => {
                    void connectExternal(connector)
                  }}
                  type="button"
                >
                  {connector.icon ? (
                    <img
                      alt={connector.name}
                      className="size-5"
                      src={connector.icon}
                    />
                  ) : (
                    <MSymbol
                      className="ms-opsz-20"
                      symbol="account_balance_wallet"
                    />
                  )}
                  {connector.name}
                </button>
              ))}
            </div>
          </>
        )}

        {error || connectError ? (
          <p className="text-center text-red-600 text-sm">
            {error ?? connectError}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
