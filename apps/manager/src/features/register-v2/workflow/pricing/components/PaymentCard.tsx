import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { useState } from 'react'
import { useConnection } from 'wagmi'
import { useBaseRate } from '@/features/register-v2/data/queries/baseRates.query'
import { calculateDiscount } from '@/features/register-v2/utils/discount'
import { useSmartSessionGate } from '@/features/wallet/hooks/useSmartSessionGate'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { TOKENS } from '@/lib/tokens'
import { useConnectModal, useWalletDisconnect } from '@/lib/wallet'
import { getIsSafeWalletQueryOptions } from '@/lib/wallet/safe'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { getRegisterPriceQueryOptions } from '../../../data/queries/pricing.query'
import { warmRegistrationCheckout } from '../../../service/checkoutWarmup'
import { useRegistrationV2Context } from '../../../state/registrationUi.context'
import { useCheckoutSources } from '../hooks/useCheckoutSources'
import {
  getCheckoutAction,
  getPageAvailability,
} from '../lib/checkoutAvailability'
import { getCheckoutSummary } from '../lib/checkoutSummary'
import { useCheckoutWarmup } from '../useCheckoutWarmup'
import { CheckoutSummaryCard } from './CheckoutSummaryCard'
import {
  PaymentCardBaseLine,
  PaymentCardPremiumLine,
} from './PaymentCardLineItems'
import { SafeWalletDialog } from './SafeWalletDialog'

const toUsd = (raw: bigint) => decimalBigintToNumber(raw, TOKENS.USDC.decimals)

export const PaymentCard = () => {
  const { uiActor, label } = useRegistrationV2Context()
  const [duration, canNext] = useSelector(uiActor, (state) => [
    state.context.duration,
    state.can({ type: 'pricing.step.next' }),
  ])

  // Gate the smart session at the FRONT of the flow: enabling a session is a
  // prerequisite for the whole HCA registration, so prompt for it BEFORE the
  // stablecoin chooser opens — not after the user has already picked a token.
  const { gate, sessionModal } = useSmartSessionGate()

  const baseRate = useBaseRate(label)

  const pricingQuery = useQuery({
    ...getRegisterPriceQueryOptions(label, duration, TOKENS.USDC.symbol),
    placeholderData: keepPreviousData,
  })
  const basePrice = toUsd(pricingQuery.data?.basePrice ?? 0n)
  const premium = toUsd(pricingQuery.data?.premium ?? 0n)

  const { discountAmount } = calculateDiscount(
    basePrice,
    baseRate,
    BigInt(duration),
  )

  // The chooser opens once its figures are cached, so it does not open on the
  // price alone and then reflow when the funding budget lands.
  const queryClient = useQueryClient()
  const account = useSmartAccountContext()
  const checkout = {
    label,
    durationInSeconds: BigInt(duration),
    token: TOKENS.USDC.symbol,
    account,
  }
  useCheckoutWarmup(checkout)
  const openTokenPicker = useMutation({
    mutationFn: () => warmRegistrationCheckout(queryClient, checkout),
    onSettled: () => uiActor.send({ type: 'pricing.step.next' }),
  })

  // A Safe can't enable the session, so send it to the Explorer instead.
  const { connector, address } = useConnection()
  const isSafeWalletOptions = getIsSafeWalletQueryOptions({
    connector,
    address,
  })
  useQuery({ ...isSafeWalletOptions, enabled: !!connector })
  const [isSafeDialogOpen, setIsSafeDialogOpen] = useState(false)
  const { disconnect } = useWalletDisconnect()
  const { openConnectModal, connectModalOpen } = useConnectModal()

  const { accountBalance, sources } = useCheckoutSources(account)
  const summary = pricingQuery.data
    ? getCheckoutSummary(
        pricingQuery.data.basePrice + pricingQuery.data.premium,
        accountBalance.status === 'known' ? accountBalance.usdcRaw : 0n,
      )
    : undefined
  const action = getCheckoutAction({
    isConnected: account.isConnected,
    isPreparing: openTokenPicker.isPending,
    availability: pricingQuery.data
      ? getPageAvailability(
          pricingQuery.data.basePrice + pricingQuery.data.premium,
          accountBalance,
          sources,
        )
      : 'unknown',
    canNext,
  })

  const onNext = async () => {
    const isSafeWallet = await queryClient
      .ensureQueryData(isSafeWalletOptions)
      .catch(() => false)
    if (isSafeWallet) {
      setIsSafeDialogOpen(true)
      return
    }
    gate(() => openTokenPicker.mutate())
  }

  return (
    <>
      <CheckoutSummaryCard
        // ETH is swapped for the ENS account, so only that route offers it.
        acceptsEth={account.signer?.type === 'rhinestone'}
        action={action}
        connect={{
          onConnect: () => openConnectModal?.(),
          isOpen: connectModalOpen,
        }}
        discount={discountAmount}
        header={
          premium > 0 && (
            <div className="mx-auto w-max space-y-2">
              <PaymentCardBaseLine basePrice={basePrice} isLoading={false} />
              <PaymentCardPremiumLine
                isLoading={false}
                premiumAmount={premium}
              />
            </div>
          )
        }
        isLoading={pricingQuery.isLoading || pricingQuery.isPlaceholderData}
        isTotalPending={accountBalance.status === 'unknown'}
        onContinue={() => void onNext()}
        summary={summary}
      />
      {sessionModal}
      <SafeWalletDialog
        isOpen={isSafeDialogOpen}
        label={label}
        onDismiss={() => setIsSafeDialogOpen(false)}
        onUseDifferentWallet={async () => {
          setIsSafeDialogOpen(false)
          await disconnect()
          openConnectModal?.()
        }}
      />
    </>
  )
}
