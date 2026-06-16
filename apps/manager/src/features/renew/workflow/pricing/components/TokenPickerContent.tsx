import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { useMemo, useState } from 'react'
import { getRenewPriceQueryOptions } from '@/features/register-v2/data/queries/pricing.query'
import { TokenPickerContentBase } from '@/features/register-v2/workflow/pricing/components/TokenPickerContent'
import { useRenewalUiContext } from '@/features/renew/state/renewalUi.context'
import type { PaymentSourceBalance } from '@/lib/payment/usePaymentSourceBalances'
import { usePaymentSourceBalances } from '@/lib/payment/usePaymentSourceBalances'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'

export const TokenPickerContent = () => {
  const { label, uiActor } = useRenewalUiContext()
  const { ownerAddress, isConnected } = useSmartAccountContext()
  const [duration, selectedToken] = useSelector(
    uiActor,
    (state) => [state.context.duration, state.context.selectedToken] as const,
  )

  // Renewal does not (yet) support cross-chain L2 payment, so it only offers
  // same-chain (L1) sources. The selection still maps to the renewal
  // machine's symbol-keyed `selectedToken`.
  const { paymentSources, isLoading: isLoadingBalances } =
    usePaymentSourceBalances(ownerAddress)
  const l1Sources = useMemo(
    () => paymentSources.filter((source) => !source.isCrossChain),
    [paymentSources],
  )

  const [selectedSourceId, setSelectedSourceId] = useState<string | undefined>(
    () => l1Sources.find((source) => source.symbol === selectedToken)?.id,
  )

  const pricingQuery = useQuery({
    ...getRenewPriceQueryOptions(
      label,
      duration,
      selectedToken ?? TOKENS.USDC.symbol,
    ),
    select: (data) =>
      decimalBigintToNumber(
        data.amount,
        selectedToken ? TOKENS[selectedToken].decimals : TOKENS.USDC.decimals,
      ),
  })

  const onSelectSource = (source: PaymentSourceBalance) => {
    setSelectedSourceId(source.id)
    uiActor.send({ type: 'pricing.token.select', token: source.symbol })
  }

  return (
    <TokenPickerContentBase
      isConnected={isConnected}
      isLoadingBalances={isLoadingBalances}
      label={label}
      nextMessage={<Trans>Renew Name</Trans>}
      onNext={() => uiActor.send({ type: 'pricing.step.next' })}
      onSelectSource={onSelectSource}
      paymentSources={l1Sources}
      pricingData={pricingQuery.data}
      pricingLoading={pricingQuery.isLoading}
      selectedSourceId={selectedSourceId}
    />
  )
}
