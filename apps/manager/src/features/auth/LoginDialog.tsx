import { SiX } from '@icons-pack/react-simple-icons'
import { Trans, useLingui } from '@lingui/react/macro'
import { type FormEvent, useMemo, useState } from 'react'
import type { Connector } from 'wagmi'
import { useConnect, useConnectors } from 'wagmi'
import googleIcon from '@/assets/google-icon.svg'
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

// Figma tokens: grey #f3f4f6 boxes, 16px radius.
const box =
  'flex items-center justify-center rounded-2xl bg-[#f3f4f6] transition-colors hover:bg-[#e9ebee] disabled:cursor-not-allowed disabled:opacity-60'
const inputBox = 'flex h-12 items-center gap-2 rounded-2xl bg-[#f3f4f6] px-4'
const inputEl =
  'h-full flex-1 bg-transparent text-foreground text-sm outline-none placeholder:text-[#99a1af]'

/**
 * Sign-in dialog over Privy's HEADLESS hooks (Privy's own modal is never used):
 *   - Google + X — OAuth, redirect-based (icon-only squares)
 *   - Email — OTP, inline two-step (enter email → enter the 6-digit code)
 *   - MetaMask — the EIP-6963-discovered injected connector (no "more wallets")
 *
 * Styled to the Figma login design. The Privy SDK is lazy-loaded
 * (RootProviders / privy-session-store): social + email controls stay disabled
 * until `ready`, so the real runtime callbacks are installed before use.
 */
export const LoginDialog = ({ open, onOpenChange }: LoginDialogProps) => {
  const { t } = useLingui()
  const {
    signInWithGoogle,
    signInWithX,
    signInWithEmail,
    completeEmail,
    awaitingEmailCode,
    ready,
    busy,
    error,
  } = usePrivySession()
  const connectors = useConnectors()
  const { connectAsync } = useConnect()

  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [reEnterEmail, setReEnterEmail] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  // Only MetaMask, via EIP-6963 discovery (skip our own privy connector).
  const metaMaskConnector = useMemo(
    () =>
      connectors.find(
        (c) => c.id !== 'privy' && /metamask/i.test(`${c.id} ${c.name}`),
      ),
    [connectors],
  )

  // `ready` is false until the lazily loaded Privy runtime mounts (opening this
  // dialog kicks that off — see LoginModalProvider).
  const socialDisabled = busy || !ready
  const showCodeStep = Boolean(awaitingEmailCode) && !reEnterEmail

  const connectMetaMask = async (connector: Connector) => {
    setConnectError(null)
    setConnecting(true)
    try {
      await connectAsync({ connector })
      onOpenChange(false)
    } catch (e) {
      setConnectError(
        e instanceof Error ? e.message : 'Failed to connect wallet',
      )
    } finally {
      setConnecting(false)
    }
  }

  const submitEmail = async (e: FormEvent) => {
    e.preventDefault()
    if (!email) return
    try {
      await signInWithEmail(email)
      setReEnterEmail(false) // code sent → show the code step
    } catch {}
  }

  const submitCode = async (e: FormEvent) => {
    e.preventDefault()
    if (!code) return
    try {
      await completeEmail(code)
      onOpenChange(false) // authenticated → close; the app takes over
    } catch {}
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="gap-6 rounded-[4px] p-8 shadow-[0_1px_3px_0_rgba(0,0,0,0.10),0_1px_2px_-1px_rgba(0,0,0,0.10)] sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-center font-normal text-[32px] text-ens-lapis-dense">
            <Trans>Sign up or connect</Trans>
          </DialogTitle>
          <DialogDescription className="sr-only">
            <Trans>
              Sign in to ENS with a social account, email, or wallet.
            </Trans>
          </DialogDescription>
        </DialogHeader>

        {/* Social — Google + X, icon-only squares */}
        <div className="grid grid-cols-2 gap-3">
          <button
            className={`${box} h-20`}
            disabled={socialDisabled}
            onClick={() => void signInWithGoogle()}
            type="button"
          >
            <img alt="Google" className="size-8" src={googleIcon} />
          </button>
          <button
            className={`${box} h-20`}
            disabled={socialDisabled}
            onClick={() => void signInWithX()}
            type="button"
          >
            <SiX className="size-8" />
          </button>
        </div>

        {/* Email OTP — two-step */}
        {showCodeStep ? (
          <form className="flex flex-col gap-3" onSubmit={submitCode}>
            <p className="text-muted-foreground text-sm">
              <Trans>Enter the code sent to {awaitingEmailCode}</Trans>
            </p>
            <div className={inputBox}>
              <input
                className={inputEl}
                disabled={busy}
                inputMode="numeric"
                onChange={(e) => setCode(e.target.value)}
                placeholder={t`6-digit code`}
                value={code}
              />
            </div>
            <button
              className={`${box} h-12 font-medium text-foreground text-sm`}
              disabled={busy || !code}
              type="submit"
            >
              <Trans>Verify</Trans>
            </button>
            <button
              className="text-muted-foreground text-xs underline"
              onClick={() => {
                setReEnterEmail(true)
                setCode('')
              }}
              type="button"
            >
              <Trans>Use a different email</Trans>
            </button>
          </form>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={submitEmail}>
            <div className={inputBox}>
              <MSymbol className="text-[#99a1af]" symbol="mail" />
              <input
                className={inputEl}
                disabled={socialDisabled}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t`Enter your email`}
                type="email"
                value={email}
              />
            </div>
            <button
              className={`${box} h-12 font-medium text-foreground text-sm`}
              disabled={socialDisabled || !email}
              type="submit"
            >
              <Trans>Continue with email</Trans>
            </button>
          </form>
        )}

        {/* MetaMask */}
        {metaMaskConnector ? (
          <>
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-black/10" />
              <span className="text-[#6a7282] text-sm">
                <Trans>or</Trans>
              </span>
              <span className="h-px flex-1 bg-black/10" />
            </div>
            <button
              className={`${box} flex-col gap-3 py-6`}
              disabled={connecting}
              onClick={() => void connectMetaMask(metaMaskConnector)}
              type="button"
            >
              {metaMaskConnector.icon ? (
                <img
                  alt={metaMaskConnector.name}
                  className="size-10"
                  src={metaMaskConnector.icon}
                />
              ) : (
                <MSymbol symbol="account_balance_wallet" />
              )}
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-[#00bc7d]" />
                <span className="text-[#364153] text-sm">
                  {metaMaskConnector.name}
                </span>
              </span>
            </button>
          </>
        ) : null}

        {error || connectError ? (
          <p className="text-center text-red-600 text-sm">
            {error ?? connectError}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
