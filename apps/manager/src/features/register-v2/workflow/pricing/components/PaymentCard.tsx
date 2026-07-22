import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { Trans } from '@lingui/react/macro'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import type { Address, Hex } from 'viem'
import { useWalletClient } from 'wagmi'
import { DAI, USDCIcon, USDTIcon } from '@/components/atoms/StableCoinsIcons'
import { Button } from '@/components/ens-consumer/button/Button'
import { useBaseRate } from '@/features/register-v2/data/queries/baseRates.query'
import { calculateDiscount } from '@/features/register-v2/utils/discount'
import type { SmartAccountContextValue } from '@/lib/smart-account/SmartAccountContext'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { backendClient } from '@/utils/backend-client'
import { isFeatureEnabled } from '@/utils/feature-flags'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { tw } from '@/utils/tailwind'
import { getRegisterPriceQueryOptions } from '../../../data/queries/pricing.query'
import { useRegistrationV2Context } from '../../../state/registrationUi.context'
import { AnimatedPrice } from './AnimatedPrice'
import {
  PaymentCardBaseLine,
  PaymentCardPremiumLine,
} from './PaymentCardLineItems'

// Crossmint's default per-transaction credit-card limit (USD). Above this the
// card option is disabled with a warning (per WEB-7).
const CARD_LIMIT_USD = 1500

// Load the Crossmint dialog client-only: the @crossmint SDK performs disallowed
// operations (async I/O / random values) at module top-level, which crash SSR
// in the Cloudflare Workers runtime. Lazy import + a mount guard keep it off the
// server entirely.
const CrossmintCheckoutDialog = lazy(() =>
  import('./CrossmintCheckoutDialog').then((m) => ({
    default: m.CrossmintCheckoutDialog,
  })),
)

export const PaymentCard = () => {
  const { uiActor, label } = useRegistrationV2Context()
  const [duration, canNext] = useSelector(uiActor, (state) => [
    state.context.duration,
    state.can({ type: 'pricing.step.next' }),
  ])
  const { ownerAddress, accountAddress } = useSmartAccountContext()
  const [cardOpen, setCardOpen] = useState(false)
  const [orderError, setOrderError] = useState<string>()
  const [isCreatingOrder, setIsCreatingOrder] = useState(false)
  const { data: walletClient } = useWalletClient()
  // Gate the client-only Crossmint dialog on mount so it never renders (and its
  // SDK never imports) during SSR.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const baseRate = useBaseRate(label)

  const pricingQuery = useQuery({
    ...getRegisterPriceQueryOptions(label, duration, TOKENS.USDC.symbol),
    select: (data) => ({
      totalPrice: decimalBigintToNumber(
        data.basePrice + data.premium,
        TOKENS.USDC.decimals,
      ),
      basePrice: decimalBigintToNumber(data.basePrice, TOKENS.USDC.decimals),
      premiumPrice: decimalBigintToNumber(data.premium, TOKENS.USDC.decimals),
    }),
    placeholderData: keepPreviousData,
  })

  const { discountAmount } = calculateDiscount(
    pricingQuery.data?.basePrice ?? 0,
    baseRate,
    BigInt(duration),
  )

  const totalPriceUsd = pricingQuery.data?.totalPrice
  const cardCheckoutEnabled = isFeatureEnabled('CARD_CHECKOUT')
  const overCardLimit =
    totalPriceUsd !== undefined && totalPriceUsd > CARD_LIMIT_USD
  const showCardOption = cardCheckoutEnabled && Boolean(ownerAddress)
  // Self-pay voucher path: the stablecoin button creates a backend order and
  // starts the registration machine (which handles mint + poll) instead of
  // advancing to the HCA/Rhinestone intent flow.
  const voucherCheckoutEnabled =
    isFeatureEnabled('WALLET_VOUCHER_CHECKOUT') && Boolean(ownerAddress)

  const handleVoucherCheckout = async () => {
    setOrderError(undefined)

    // The mint is sent from the connected EOA wallet — bail early if the
    // wallet client is momentarily unavailable (connector desync).
    if (!walletClient) {
      setOrderError('Wallet not connected — please reconnect and try again')
      return
    }

    setIsCreatingOrder(true)
    try {
      // 1. Create the backend order — deliberately UNAUTHENTICATED (no SIWE).
      // The buyer proves control of the wallet on-chain by signing the mint;
      // the backend only ever fulfils against that on-chain proof, so a
      // session signature adds nothing here (and a mid-flow session expiry
      // must never be able to break checkout).
      const res = await backendClient.crossmint.voucher.orders.$post({
        json: {
          name: label,
          durationSeconds: duration,
          ownerAddress: ownerAddress as Address,
          paymentToken: 'USDC',
        },
      })
      if (!res.ok) throw new Error(`Failed to create order (${res.status})`)
      const { orderId, commitment, totalDue, gasFee, paymentToken } =
        (await res.json()) as {
          orderId: string
          commitment: Hex
          totalDue: string
          gasFee: string
          /** Server-declared mint token: the rail's settlement asset. */
          paymentToken: Address
        }

      // 2. Start the registration machine with voucher data. The machine
      // handles mint → receipt → settle → poll; the injected callbacks keep
      // all backend URLs/transport out of the machine. Settle fires on entry
      // to `fulfillingRegistration`, i.e. AFTER the mint receipt is
      // confirmed — never before payment.
      uiActor.send({
        type: 'registration.start',
        label,
        duration: BigInt(duration),
        token: 'USDC',
        totalPrice: BigInt(0), // not used in the voucher path
        account: {
          // For the voucher self-pay path the signer is the EOA wallet — the
          // machine routes through the voucher states before any rhinestone
          // Bundle production, and the mint actor uses walletClient directly.
          signer: { type: 'eoa', walletClient } as const,
          ownerAddress: ownerAddress as Address,
          accountAddress: (accountAddress ?? ownerAddress) as Address,
          walletClient,
        } as unknown as SmartAccountContextValue,
        basePriceNumber: pricingQuery.data?.basePrice ?? 0,
        premiumPriceNumber: pricingQuery.data?.premiumPrice ?? 0,
        voucherOrder: {
          orderId,
          commitment,
          // Server-declared: the rail's settlement asset (Circle USDC on
          // Sepolia), NOT the registrar's pricing token — so the gasFee the
          // voucher forwards is the same coin solvers take as reimbursement.
          paymentToken,
          // Server-authoritative quote: register price + drift headroom +
          // the orchestrator-quoted fulfilment gasFee. The mint pulls the
          // TOTAL from the buyer; the voucher forwards the gasFee component
          // on-chain to the fulfilment executor (buyer funds their own gas).
          // Settle enforces amountPaid >= this total.
          paymentAmount: BigInt(totalDue),
          gasFee: BigInt(gasFee),
          walletClient,
          pollOrderStatus: async () => {
            // Public-by-UUID status endpoint — no auth, so an expired SIWE
            // session can never blind the buyer mid-fulfilment.
            const statusRes = await backendClient.crossmint.voucher.orders[
              ':id'
            ].$get({ param: { id: orderId } })
            const body = await statusRes.json()
            if (!('status' in body)) {
              // Non-status body (404/…): throw so the poll retries.
              throw new Error(body.error)
            }
            // Surface the fulfilment phase to the ui machine so the progress
            // bar advances through the real backend phases (committing →
            // committed → registering) instead of parking on one value for
            // the whole fulfilment.
            uiActor.send({
              type: 'registration.voucherPhase',
              phase: body.status,
            })
            return {
              status: body.status,
              error: 'error' in body ? body.error : undefined,
            }
          },
          triggerFulfilment: (mintTxHash) => {
            // Settle with the on-chain payment proof: the backend verifies
            // the mint receipt (VoucherMinted carrying this order's
            // commitment) before flipping paid + enqueueing fulfilment.
            // Fire-and-forget; idempotent, re-fired on machine RETRY.
            void backendClient.crossmint.voucher.orders[':id'].settle
              .$post({
                param: { id: orderId },
                json: { txHash: mintTxHash },
              })
              .catch(() => {})
          },
        },
      })
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : 'Checkout failed')
    } finally {
      setIsCreatingOrder(false)
    }
  }

  return (
    <>
      <PaymentCardBase
        amount={totalPriceUsd}
        basePrice={pricingQuery.data?.basePrice}
        canNext={canNext && !isCreatingOrder}
        cardOverLimit={overCardLimit}
        discountAmount={discountAmount}
        isLoading={pricingQuery.isLoading || pricingQuery.isPlaceholderData}
        onNext={
          voucherCheckoutEnabled
            ? handleVoucherCheckout
            : () => uiActor.send({ type: 'pricing.step.next' })
        }
        onPayWithCard={showCardOption ? () => setCardOpen(true) : undefined}
        premiumAmount={pricingQuery.data?.premiumPrice}
        type="register"
        voucherError={orderError}
        voucherProcessing={isCreatingOrder}
      />
      {mounted && showCardOption && ownerAddress && (
        <Suspense fallback={null}>
          <CrossmintCheckoutDialog
            durationSeconds={duration}
            label={label}
            onOpenChange={setCardOpen}
            open={cardOpen}
            ownerAddress={ownerAddress as Address}
            totalPriceUsd={totalPriceUsd}
          />
        </Suspense>
      )}
    </>
  )
}

export const PaymentCardBase = ({
  canNext,
  onNext,
  onPayWithCard,
  cardOverLimit,
  amount,
  isLoading,
  discountAmount,
  premiumAmount,
  basePrice,
  type,
  voucherProcessing,
  voucherError,
}: {
  canNext: boolean
  onNext: () => void
  /** When set, renders a "Pay with card" option (registration only). */
  onPayWithCard?: () => void
  /** Disables the card option + shows a warning when over the card limit. */
  cardOverLimit?: boolean
  amount: number | undefined
  discountAmount?: number
  premiumAmount?: number
  /** Base registration cost (excludes the one-time cooldown premium). */
  basePrice?: number
  isLoading: boolean
  type: 'register' | 'renew'
  /** When true, the voucher order is being created (show loading state). */
  voucherProcessing?: boolean
  /** Error message from the voucher order creation. */
  voucherError?: string
}) => {
  const { isConnected } = useSmartAccountContext()
  const { openConnectModal, connectModalOpen } = useConnectModal()

  return (
    <div
      className={tw(
        'flex flex-1 flex-col items-center justify-between gap-8',
        'rounded-xl border-[#DDDDDE] border-[0.5px] bg-white px-12 py-6 shadow-temp-card',
      )}
    >
      <div className="w-full max-w-55 space-y-3 text-center">
        {premiumAmount !== undefined && premiumAmount > 0 && (
          <div className="space-y-2">
            {basePrice !== undefined && (
              <PaymentCardBaseLine
                basePrice={basePrice}
                isLoading={isLoading}
              />
            )}
            <PaymentCardPremiumLine
              isLoading={isLoading}
              premiumAmount={premiumAmount}
            />
          </div>
        )}

        <p className="text-ens-lapis-surface text-xs uppercase">
          <Trans>Total</Trans>
        </p>

        <div className="flex items-end justify-center gap-1.5">
          <span
            className={tw(
              'font-medium text-4xl text-ens-blue-midnight leading-ens-none md:text-5xl',
              isLoading && 'animate-pulse',
            )}
          >
            <AnimatedPrice emphasis="soft" value={amount ?? 0} />
          </span>
          <span className="font-normal text-base text-ens-blue-midnight leading-7">
            <Trans>USD</Trans>
          </span>
        </div>

        <div
          className={tw(
            'w-full rounded bg-ens-signal-success-300 px-4 py-2 transition-opacity duration-300',
            !discountAmount && 'opacity-0',
          )}
        >
          <span className="font-normal text-2xl text-ens-peridot-core leading-ens-none">
            <Trans>
              Save <AnimatedPrice value={discountAmount ?? 0} />
            </Trans>
          </span>
        </div>
      </div>

      <div className="flex w-full flex-col items-center justify-between gap-3">
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-center font-normal text-ens-gray text-xs tracking-tight">
            <Trans>Stables accepted</Trans>
          </p>
          {/* Stablecoin icons */}
          <div className="flex items-center gap-1">
            <USDTIcon className="h-7 w-7" />
            <USDCIcon className="h-7 w-7" />
            <DAI className="h-7 w-7" />
          </div>
        </div>

        {isConnected ? (
          <>
            <Button
              className="w-full font-medium font-mono uppercase tracking-widest"
              color="blue"
              disabled={!canNext || voucherProcessing}
              onClick={onNext}
              size="lg"
            >
              {voucherProcessing ? (
                <Trans>Creating order…</Trans>
              ) : (
                <Trans>Pay with stablecoins</Trans>
              )}
            </Button>
            {voucherError && (
              <p className="text-center text-ens-signal-error-core text-xs">
                {voucherError}
              </p>
            )}
            {onPayWithCard && (
              <>
                <Button
                  className="w-full font-medium font-mono uppercase tracking-widest"
                  color="lightBlue"
                  disabled={!canNext || cardOverLimit}
                  onClick={onPayWithCard}
                  size="lg"
                >
                  <Trans>Pay with card</Trans>
                </Button>
                {cardOverLimit && (
                  <p className="text-center text-ens-signal-error-core text-xs">
                    <Trans>
                      Card payments are limited to $1,500. Pay with stablecoins
                      for this amount.
                    </Trans>
                  </p>
                )}
              </>
            )}
          </>
        ) : (
          <Button
            className="w-full font-medium font-mono uppercase tracking-widest"
            color="blue"
            disabled={connectModalOpen}
            onClick={() => openConnectModal?.()}
            size="lg"
          >
            {type === 'register' ? (
              <Trans>Connect to register</Trans>
            ) : (
              <Trans>Connect to renew</Trans>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}
