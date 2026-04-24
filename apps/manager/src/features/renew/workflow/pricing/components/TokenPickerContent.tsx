import {
  type SUPPORTED_TOKEN,
  TOKENS,
} from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { zeroAddress } from 'viem'
import { getPricingQueryOptions } from '@/features/register-v2/data/queries/pricing.query'
import { TokenPickerContentBase } from '@/features/register-v2/workflow/pricing/components/TokenPickerContent'
import { useRenewalUiContext } from '@/features/renew/state/renewalUi.context'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'

export const TokenPickerContent = () => {
  const { label, uiActor } = useRenewalUiContext()
  const { stablecoinBalances, isLoadingBalances, isConnected } =
    useSmartAccountContext()
  const [duration, selectedToken] = useSelector(
    uiActor,
    (state) => [state.context.duration, state.context.selectedToken] as const,
  )

  const pricingQuery = useQuery({
    ...getPricingQueryOptions(
      label,
      // Zero address used to ignore temporary premium since it's not applicable for renewal
      zeroAddress,
      duration,
      TOKENS.USDC.symbol,
    ),
    select: (data) =>
      decimalBigintToNumber(data.totalPrice, TOKENS.USDC.decimals),
  })

  const onSelectCoin = (coin: SUPPORTED_TOKEN) => {
    uiActor.send({ type: 'pricing.token.select', token: coin })
  }

  return (
    <TokenPickerContentBase
      isConnected={isConnected}
      isLoadingBalances={isLoadingBalances}
      label={label}
      onNext={() => uiActor.send({ type: 'pricing.step.next' })}
      onSelectCoin={onSelectCoin}
      pricingData={pricingQuery.data}
      pricingLoading={pricingQuery.isLoading}
      selectedToken={selectedToken}
      stablecoinBalances={stablecoinBalances}
    />
  )
}
