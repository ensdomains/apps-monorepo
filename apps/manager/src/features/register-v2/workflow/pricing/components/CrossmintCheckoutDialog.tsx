import { Trans } from '@lingui/react/macro'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Address } from 'viem'
import { Button } from '@/components/ens-consumer/button/Button'
import { backendClient, getBackendApiBaseUrl } from '@/utils/backend-client'
import { PaymentDialogBase } from './TokenPickerDialog'

type Phase =
  | { kind: 'creating' }
  | { kind: 'awaiting_payment'; orderId: string }
  | { kind: 'processing'; orderId: string; status: string }
  | { kind: 'success' }
  | { kind: 'error'; message: string }

// Backend order statuses that are still in-flight (keep polling).
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

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** ENS label (without .eth). */
  label: string
  durationSeconds: number
  /** Delivery wallet — must match the authenticated wallet. */
  ownerAddress: Address
  /** Display-only total in USD. */
  totalPriceUsd: number | undefined
}

/**
 * Credit-card checkout in a popup modal. Creates a server-side order intent,
 * runs the Crossmint embedded checkout, then polls our backend while it does
 * the commit-reveal registration on the buyer's behalf and delivers the name.
 *
 * NOTE: the Crossmint embedded-checkout widget (`@crossmint/client-sdk-react-ui`)
 * is not yet wired (dependency + staging credentials pending — see WEB-7 /
 * ens-crossmint-voucher repo). Until then this renders a mock "pay" control that
 * drives the real backend fulfilment via the (unsigned, dev-only) webhook. The
 * real widget config to drop in:
 *
 *   <CrossmintEmbeddedCheckout
 *     lineItems={{ collectionLocator: VITE_CROSSMINT_COLLECTION, callData: {
 *       totalPrice, duration: durationSeconds, clientReference: orderId } }}
 *     payment={{ defaultMethod: 'fiat', crypto: { enabled: false },
 *       fiat: { enabled: true, defaultCurrency: 'usd',
 *         allowedMethods: { card: true, applePay: false, googlePay: false } } }}
 *     recipient={{ walletAddress: ownerAddress }}
 *     appearance={{ rules: { DestinationInput: { display: 'hidden' },
 *       ReceiptEmailInput: { display: 'hidden' } } }} />
 */
export const CrossmintCheckoutDialog = ({
  open,
  onOpenChange,
  label,
  durationSeconds,
  ownerAddress,
  totalPriceUsd,
}: Props) => {
  const [phase, setPhase] = useState<Phase>({ kind: 'creating' })
  // Guards the create-intent effect against StrictMode double-invocation.
  const createdRef = useRef(false)

  // Create the order intent when the dialog opens.
  useEffect(() => {
    if (!open) {
      createdRef.current = false
      setPhase({ kind: 'creating' })
      return
    }
    if (createdRef.current) return
    createdRef.current = true

    let cancelled = false
    void (async () => {
      try {
        const res = await backendClient.crossmint.orders.$post({
          json: {
            name: label,
            durationSeconds,
            ownerAddress,
            paymentToken: 'USDC',
          },
        })
        if (!res.ok) throw new Error(`Failed to create order (${res.status})`)
        const { orderId } = await res.json()
        if (!cancelled) setPhase({ kind: 'awaiting_payment', orderId })
      } catch (error) {
        if (!cancelled) {
          setPhase({
            kind: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'Could not start checkout',
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, label, durationSeconds, ownerAddress])

  // Poll fulfilment status while processing.
  useEffect(() => {
    if (phase.kind !== 'processing') return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const orderId = phase.orderId
    const poll = async () => {
      try {
        const res = await backendClient.crossmint.orders[':id'].$get({
          param: { id: orderId },
        })
        const body = await res.json()
        if (cancelled) return
        // The not-found response is `{ error }`; the order response carries
        // `status` — discriminate on that.
        if (!('status' in body)) {
          setPhase({ kind: 'error', message: body.error })
          return
        }
        if (body.status === 'registered') {
          setPhase({ kind: 'success' })
          return
        }
        if (body.status === 'failed') {
          setPhase({
            kind: 'error',
            message: body.error ?? 'Registration failed',
          })
          return
        }
        if (IN_FLIGHT.has(body.status)) {
          setPhase({ kind: 'processing', orderId, status: body.status })
          timer = setTimeout(poll, POLL_INTERVAL_MS)
        }
      } catch {
        if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS)
      }
    }

    timer = setTimeout(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [phase])

  // Mock payment: drive the real backend fulfilment via the dev webhook (no
  // signing secret configured => signature check skipped). Replaced by the
  // Crossmint widget's success callback once the SDK is wired.
  const onMockPay = useCallback(async () => {
    if (phase.kind !== 'awaiting_payment') return
    const orderId = phase.orderId
    setPhase({ kind: 'processing', orderId, status: 'paid' })
    try {
      await fetch(`${getBackendApiBaseUrl()}/webhook/crossmint`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'orders.payment.succeeded',
          data: { clientReference: orderId },
        }),
      })
    } catch {
      // The poll loop surfaces any resulting failure.
    }
  }, [phase])

  return (
    <PaymentDialogBase
      onOpenChange={onOpenChange}
      open={open}
      title="Pay by card"
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-4 text-center">
        {phase.kind === 'creating' && (
          <p className="text-ens-gray text-sm">
            <Trans>Preparing checkout…</Trans>
          </p>
        )}

        {phase.kind === 'awaiting_payment' && (
          <>
            <div className="space-y-1">
              <p className="font-medium text-ens-blue-midnight text-lg">
                {label}.eth
              </p>
              {totalPriceUsd !== undefined && (
                <p className="text-ens-gray text-sm">
                  ${totalPriceUsd.toFixed(2)} <Trans>USD</Trans>
                </p>
              )}
            </div>
            {/* Stand-in for the Crossmint embedded checkout (see file note). */}
            <Button color="blue" onClick={onMockPay} size="lg">
              <Trans>Pay by card</Trans>
            </Button>
            <p className="text-ens-gray text-xs">
              <Trans>Card checkout (test mode)</Trans>
            </p>
          </>
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
