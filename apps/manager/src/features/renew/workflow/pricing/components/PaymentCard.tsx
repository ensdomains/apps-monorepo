import { Trans } from '@lingui/react/macro'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { formatUnits } from 'viem'
import { useConnection } from 'wagmi'
import { useBaseRate } from '@/features/register-v2/data/queries/baseRates.query'
import { calculateDiscount } from '@/features/register-v2/utils/discount'
import { CheckoutSummaryCard } from '@/features/register-v2/workflow/pricing/components/CheckoutSummaryCard'
import { useCheckoutSources } from '@/features/register-v2/workflow/pricing/hooks/useCheckoutSources'
import { useIsAccountPending } from '@/features/register-v2/workflow/pricing/hooks/useIsAccountPending'
import {
  getCheckoutAction,
  getPageAvailability,
  UNKNOWN_BALANCE,
} from '@/features/register-v2/workflow/pricing/lib/checkoutAvailability'
import { getCheckoutSummary } from '@/features/register-v2/workflow/pricing/lib/checkoutSummary'
import { getRenewPriceQueryOptions } from '@/features/renew/data/queries/renewPricing.query'
import { useRenewalSigner } from '@/features/renew/hooks/useRenewalSigner'
import { useRenewalUiContext } from '@/features/renew/state/renewalUi.context'
import { getRenewalPaymentRoute } from '@/features/renew/utils/renewalPaymentRoute'
import { useSmartSessionGate } from '@/features/wallet/hooks/useSmartSessionGate'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { TOKENS } from '@/lib/tokens'
import { useConnectModal } from '@/lib/wallet'

/** The renewal page's payment card: the registration card, with renewal's routes. */
export const PaymentCard = () => {
  const { uiActor, label, protocol } = useRenewalUiContext()
  const signer = useRenewalSigner()
  const route = getRenewalPaymentRoute(signer)
  // The wallet route sends transactions and signs no session, like a v1 renewal.
  const isWalletRoute = protocol === 'v1' || route === 'wallet'

  const [duration, canNext] = useSelector(uiActor, (state) => [
    state.context.duration,
    state.can({ type: 'pricing.step.next' }),
  ])
  const { gate, sessionModal } = useSmartSessionGate()
  const baseRate = useBaseRate(label)

  const pricingQuery = useQuery({
    ...getRenewPriceQueryOptions(label, duration, TOKENS.USDC.symbol, protocol),
    placeholderData: keepPreviousData,
  })
  const priceRaw = pricingQuery.data?.amount
  const { discountAmount } = calculateDiscount(
    Number(formatUnits(priceRaw ?? 0n, TOKENS.USDC.decimals)),
    baseRate,
    duration,
  )

  const account = useSmartAccountContext()
  const { isConnected: isEoaConnected } = useConnection()
  const { openConnectModal, connectModalOpen } = useConnectModal()
  // ETH is swapped to fund the account, so only the intent route pays with it, V1 included.
  const isEthAccepted = route === 'intent'
  const checkout = useCheckoutSources({ ...account, signer }, isEthAccepted)
  const { sources } = checkout

  const isConnected = isWalletRoute ? isEoaConnected : account.isConnected
  // A connected wallet's signer not yet resolved reads as no balance; the total waits for it instead.
  const accountBalance =
    isConnected && route === null ? UNKNOWN_BALANCE : checkout.accountBalance
  const isAccountPending = useIsAccountPending(isConnected)
  const openTokenPicker = () => uiActor.send({ type: 'pricing.step.next' })
  const action = getCheckoutAction({
    isAccountPending,
    isConnected,
    isPreparing: false,
    availability:
      priceRaw === undefined
        ? 'unknown'
        : getPageAvailability(priceRaw, accountBalance, sources),
    // Until the route is known, a Safe could still reach the session prompt.
    canNext: canNext && (isWalletRoute || route === 'intent'),
  })

  return (
    <>
      <CheckoutSummaryCard
        acceptsEth={isEthAccepted}
        action={action}
        connect={{
          onConnect: () => openConnectModal?.(),
          isOpen: connectModalOpen,
          label: <Trans>Connect to renew</Trans>,
        }}
        discount={discountAmount}
        isLoading={pricingQuery.isLoading || pricingQuery.isPlaceholderData}
        isTotalPending={accountBalance.status === 'unknown'}
        onContinue={() =>
          isWalletRoute ? openTokenPicker() : gate(openTokenPicker)
        }
        summary={
          priceRaw === undefined
            ? undefined
            : getCheckoutSummary(
                priceRaw,
                accountBalance.status === 'known' ? accountBalance.usdcRaw : 0n,
              )
        }
      />
      {sessionModal}
    </>
  )
}
