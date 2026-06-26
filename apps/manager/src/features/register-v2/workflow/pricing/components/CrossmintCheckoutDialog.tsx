import {
  CrossmintCheckoutProvider,
  CrossmintEmbeddedCheckout,
  CrossmintProvider,
  useCrossmintCheckout,
} from '@crossmint/client-sdk-react-ui'
import { Trans } from '@lingui/react/macro'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Address } from 'viem'
import { Button } from '@/components/ens-consumer/button/Button'
import { backendClient, getBackendApiBaseUrl } from '@/utils/backend-client'
import { PaymentDialogBase } from './TokenPickerDialog'

// Crossmint staging client (publishable) key + the BYOC collection locator.
// When both are present the real embedded checkout renders; otherwise the dev
// mock-pay fallback drives the backend directly.
const CROSSMINT_CLIENT_KEY = import.meta.env.VITE_CROSSMINT_CLIENT_KEY as
  | string
  | undefined
const CROSSMINT_COLLECTION = import.meta.env.VITE_CROSSMINT_COLLECTION as
  | string
  | undefined
// The voucher's on-chain commitment arg is decorative for our flow (the backend
// joins via clientReference and computes its own commit-reveal commitment), so a
// zero bytes32 is fine for the mint callData.
const PLACEHOLDER_COMMITMENT = `0x${'0'.repeat(64)}`

// Crossmint BYOC reads callData.totalPrice as the on-chain native-token amount
// (ETH) carried as msg.value, and charges the card its fiat value. So the USD
// name price must be converted to ETH. STAGING approximation — production should
// source this rate from a live oracle (and reconcile the ETH the contract holds
// against the USDC the backend fronts for registration).
const ETH_USD_RATE = 1800
const usdToEthString = (usd: number) =>
  (Math.max(usd, 0) / ETH_USD_RATE).toFixed(6)

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
 * Watches the Crossmint checkout order and signals once the card payment has
 * settled, so the parent can switch to polling our backend fulfilment. Must be
 * rendered inside CrossmintCheckoutProvider.
 */
const CheckoutWatcher = ({ onPaid }: { onPaid: () => void }) => {
  const { order } = useCrossmintCheckout()
  const paymentStatus = order?.payment?.status
  useEffect(() => {
    if (paymentStatus === 'completed') onPaid()
  }, [paymentStatus, onPaid])
  return null
}

/** The real Crossmint embedded checkout (card-only) for a paid order intent. */
const EmbeddedCheckoutPanel = ({
  orderId,
  ownerAddress,
  durationSeconds,
  totalPriceUsd,
  onPaid,
}: {
  orderId: string
  ownerAddress: Address
  durationSeconds: number
  totalPriceUsd: number | undefined
  onPaid: () => void
}) => {
  // Memoize the whole checkout element. Window-focus refetches (staleTime 0 +
  // refetchOnWindowFocus) re-render this subtree; without a stable element the
  // SDK receives new config objects and tears down/rebuilds the card iframe,
  // wiping any details already entered. Same element ref => React skips it.
  const checkout = useMemo(
    () => (
      <CrossmintEmbeddedCheckout
        appearance={{
          rules: {
            DestinationInput: { display: 'hidden' },
            ReceiptEmailInput: { display: 'hidden' },
          },
        }}
        lineItems={{
          collectionLocator: CROSSMINT_COLLECTION ?? '',
          callData: {
            totalPrice: usdToEthString(totalPriceUsd ?? 0),
            commitment: PLACEHOLDER_COMMITMENT,
            duration: String(durationSeconds),
          },
        }}
        metadata={{ clientReference: orderId }}
        payment={{
          defaultMethod: 'fiat',
          crypto: { enabled: false },
          fiat: {
            enabled: true,
            defaultCurrency: 'usd',
            allowedMethods: { card: true, applePay: false, googlePay: false },
          },
        }}
        recipient={{ walletAddress: ownerAddress }}
      />
    ),
    [orderId, ownerAddress, durationSeconds, totalPriceUsd],
  )
  return (
    <CrossmintProvider apiKey={CROSSMINT_CLIENT_KEY ?? ''}>
      <CrossmintCheckoutProvider>
        <CheckoutWatcher onPaid={onPaid} />
        {checkout}
      </CrossmintCheckoutProvider>
    </CrossmintProvider>
  )
}

/**
 * Credit-card checkout in a popup modal. Creates a server-side order intent,
 * renders the Crossmint embedded checkout (card-only), then polls our backend
 * while it does the commit-reveal registration on the buyer's behalf and
 * delivers the name. When the Crossmint client key / collection env vars are
 * absent it falls back to a dev mock-pay control.
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

  const goToProcessing = useCallback((orderId: string) => {
    setPhase({ kind: 'processing', orderId, status: 'paid' })
  }, [])

  // Dev-only: Crossmint's webhook can't reach localhost, so kick fulfilment by
  // POSTing the (unsigned) webhook ourselves. In production the Svix-signed
  // webhook drives this server-side, so this is a no-op there.
  const triggerLocalFulfilment = useCallback(async (orderId: string) => {
    if (!import.meta.env.DEV) return
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
  }, [])

  // When the real card payment settles, move to processing and (in dev only)
  // kick fulfilment locally since Crossmint can't reach our localhost webhook.
  const handlePaid = useCallback(
    (orderId: string) => {
      goToProcessing(orderId)
      void triggerLocalFulfilment(orderId)
    },
    [goToProcessing, triggerLocalFulfilment],
  )

  // Dev fallback when the Crossmint env isn't configured: a button driving the
  // same local fulfilment trigger.
  const onMockPay = useCallback(() => {
    if (phase.kind !== 'awaiting_payment') return
    handlePaid(phase.orderId)
  }, [phase, handlePaid])

  const crossmintConfigured = Boolean(
    CROSSMINT_CLIENT_KEY && CROSSMINT_COLLECTION,
  )

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

        {phase.kind === 'awaiting_payment' &&
          (crossmintConfigured ? (
            <EmbeddedCheckoutPanel
              durationSeconds={durationSeconds}
              onPaid={() => handlePaid(phase.orderId)}
              orderId={phase.orderId}
              ownerAddress={ownerAddress}
              totalPriceUsd={totalPriceUsd}
            />
          ) : (
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
              <Button color="blue" onClick={onMockPay} size="lg">
                <Trans>Pay by card</Trans>
              </Button>
              <p className="text-ens-gray text-xs">
                <Trans>Card checkout (test mode)</Trans>
              </p>
            </>
          ))}

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
