import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { Trans } from '@lingui/react/macro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type Address, type Hex, parseUnits } from 'viem'
import { usePublicClient, useWalletClient } from 'wagmi'
import { Button } from '@/components/ens-consumer/button/Button'
import { backendClient } from '@/utils/backend-client'
import { mintVoucherFromWallet } from '../../../utils/voucher'
import { PaymentDialogBase } from './TokenPickerDialog'

// Same in-flight statuses + poll cadence as the card flow — both share the
// backend fulfilment pipeline, so the progress UX is identical after mint.
const IN_FLIGHT = new Set([
  'pending',
  'paid',
  'committing',
  'committed',
  'registering',
])
const POLL_INTERVAL_MS = 4000
const STATUS_LABEL: Record<string, string> = {
  paid: 'Payment received',
  committing: 'Committing registration',
  committed: 'Waiting for the commitment to mature',
  registering: 'Registering your name',
}

// Headroom over the quoted price (the registrar pulls the live price at register
// time, which can drift up). Mirrors the worker's authorizedPaymentAmount.
const withHeadroom = (amount: bigint) => amount + amount / 10n

type Phase =
  | { kind: 'idle' }
  | { kind: 'preparing' } // creating the order + signing/approving
  | { kind: 'minting' }
  | { kind: 'processing'; orderId: string; status: string }
  | { kind: 'success' }
  | { kind: 'error'; message: string }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  durationSeconds: number
  ownerAddress: Address
  /** Display-only total in USD. */
  totalPriceUsd: number | undefined
}

/**
 * One fulfilment-status poll → the next Phase. Terminal statuses map to
 * success/error; in-flight (and transient network errors) map back to
 * `processing` so the caller keeps polling. Extracted so the effect stays thin.
 */
async function pollOrderPhase(orderId: string): Promise<Phase> {
  try {
    const res = await backendClient.crossmint.orders[':id'].$get({
      param: { id: orderId },
    })
    const body = await res.json()
    if (!('status' in body)) return { kind: 'error', message: body.error }
    if (body.status === 'registered') return { kind: 'success' }
    if (body.status === 'failed') {
      return { kind: 'error', message: body.error ?? 'Registration failed' }
    }
    if (IN_FLIGHT.has(body.status)) {
      return { kind: 'processing', orderId, status: body.status }
    }
    return { kind: 'processing', orderId, status: body.status }
  } catch {
    return { kind: 'processing', orderId, status: 'paid' }
  }
}

/**
 * Self-pay (connected wallet) single-click registration.
 *
 * The user pays in their own stablecoin: we create a server order (which fixes
 * the buyer-bound `commitment`), then the wallet mints the voucher directly —
 * one tx via EIP-2612 `mintSelfWithPermit` when the token supports permit
 * (USDC/USDS/mocks), else `approve` + `mintSelf`. From there the SAME backend
 * pipeline does commit/register, so we poll `/orders/:id` exactly like the card
 * flow. No Crossmint, no relayer, no Safe custody detour beyond the mint.
 */
export const VoucherCheckoutDialog = ({
  open,
  onOpenChange,
  label,
  durationSeconds,
  ownerAddress,
  totalPriceUsd,
}: Props) => {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const startedRef = useRef(false)

  const start = useCallback(async () => {
    if (!publicClient || !walletClient) {
      setPhase({ kind: 'error', message: 'Wallet not connected' })
      return
    }
    setPhase({ kind: 'preparing' })
    try {
      // 1. Server order → the buyer-bound commitment the voucher must carry.
      const res = await backendClient.crossmint.orders.$post({
        json: {
          name: label,
          durationSeconds,
          ownerAddress,
          paymentToken: 'USDC',
        },
      })
      if (!res.ok) throw new Error(`Failed to create order (${res.status})`)
      const { orderId, commitment } = (await res.json()) as {
        orderId: string
        commitment: Hex
      }

      // 2. Mint the voucher from the user's wallet — one tx via EIP-2612 permit
      //    when supported (detected on-chain), else approve + mintSelf.
      setPhase({ kind: 'minting' })
      await mintVoucherFromWallet({
        publicClient,
        walletClient,
        owner: ownerAddress,
        token: TOKENS.USDC.address as Address,
        amount: withHeadroom(
          parseUnits(String(totalPriceUsd ?? 0), TOKENS.USDC.decimals),
        ),
        commitment,
        duration: BigInt(durationSeconds),
      })

      // 3. Kick fulfilment (the webhook is Crossmint-specific; for self-pay the
      //    mint is the trigger, so nudge the same endpoint) and poll.
      void fetch(
        `${(import.meta.env.VITE_API_URL as string) ?? ''}/webhook/crossmint`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'orders.payment.succeeded',
            data: { clientReference: orderId },
          }),
        },
      ).catch(() => {})
      setPhase({ kind: 'processing', orderId, status: 'paid' })
    } catch (error) {
      setPhase({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Checkout failed',
      })
    }
  }, [
    publicClient,
    walletClient,
    label,
    durationSeconds,
    ownerAddress,
    totalPriceUsd,
  ])

  // Kick off once when the dialog opens.
  useEffect(() => {
    if (!open) {
      startedRef.current = false
      setPhase({ kind: 'idle' })
      return
    }
    if (startedRef.current) return
    startedRef.current = true
    void start()
  }, [open, start])

  // Poll fulfilment status while processing (identical to the card flow).
  useEffect(() => {
    if (phase.kind !== 'processing') return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const orderId = phase.orderId
    const poll = async () => {
      const next = await pollOrderPhase(orderId)
      if (cancelled) return
      setPhase(next)
      if (next.kind === 'processing') timer = setTimeout(poll, POLL_INTERVAL_MS)
    }
    timer = setTimeout(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [phase])

  return (
    <PaymentDialogBase
      onOpenChange={onOpenChange}
      open={open}
      title="Pay with your wallet"
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-4 text-center">
        {(phase.kind === 'preparing' || phase.kind === 'minting') && (
          <p className="text-ens-gray text-sm">
            {phase.kind === 'minting' ? (
              <Trans>Confirm the payment in your wallet…</Trans>
            ) : (
              <Trans>Preparing checkout…</Trans>
            )}
          </p>
        )}

        {phase.kind === 'processing' && (
          <div className="space-y-2">
            <p className="font-medium text-ens-blue-midnight">
              <Trans>Completing your registration…</Trans>
            </p>
            <p className="text-ens-gray text-sm">
              {STATUS_LABEL[phase.status] ?? phase.status}
            </p>
          </div>
        )}

        {phase.kind === 'success' && (
          <div className="space-y-2">
            <p className="font-medium text-ens-peridot-core text-lg">
              <Trans>{label}.eth is yours!</Trans>
            </p>
            <Button color="blue" onClick={() => onOpenChange(false)} size="lg">
              <Trans>Done</Trans>
            </Button>
          </div>
        )}

        {phase.kind === 'error' && (
          <div className="space-y-2">
            <p className="font-medium text-ens-signal-error-core">
              <Trans>Checkout failed</Trans>
            </p>
            <p className="text-ens-gray text-sm">{phase.message}</p>
            <Button color="blue" onClick={() => onOpenChange(false)} size="lg">
              <Trans>Close</Trans>
            </Button>
          </div>
        )}
      </div>
    </PaymentDialogBase>
  )
}
