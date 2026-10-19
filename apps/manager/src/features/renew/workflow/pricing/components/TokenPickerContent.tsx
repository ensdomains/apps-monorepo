import { authorizedPaymentAmount } from '@ens-apps/transaction-manager/machines/registration/registration.actors'
import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { useConnection } from 'wagmi'
import { TokenPickerContentBase } from '@/features/register-v2/workflow/pricing/components/TokenPickerContent'
import { useRenewalBalances } from '@/features/renew/data/queries/renewalBalances.query'
import { getRenewPriceQueryOptions } from '@/features/renew/data/queries/renewPricing.query'
import { useRenewalUiContext } from '@/features/renew/state/renewalUi.context'
import { getRenewalPaymentRoute } from '@/features/renew/utils/renewalPaymentRoute'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { type RENEWAL_TOKEN, RENEWAL_TOKEN_SYMBOLS, TOKENS } from '@/lib/tokens'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'

export const TokenPickerContent = () => {
  const { label, uiActor, protocol } = useRenewalUiContext()
  const account = useSmartAccountContext()
  const balances = useRenewalBalances()
  const { isConnected: isEoaConnected } = useConnection()
  const isConnected = protocol === 'v1' ? isEoaConnected : account.isConnected
  const [duration, selectedToken] = useSelector(
    uiActor,
    (state) => [state.context.duration, state.context.selectedToken] as const,
  )

  const pricingQuery = useQuery({
    ...getRenewPriceQueryOptions(
      label,
      duration,
      selectedToken ?? TOKENS.USDC.symbol,
      protocol,
    ),
    select: (data) => {
      const decimals = selectedToken
        ? TOKENS[selectedToken].decimals
        : TOKENS.USDC.decimals
      return {
        price: decimalBigintToNumber(data.amount, decimals),
        // The intent route moves the approval's headroom into the account
        // too, so the wallet is gated on that, not on the rent alone.
        funded: decimalBigintToNumber(
          authorizedPaymentAmount(data.amount),
          decimals,
        ),
      }
    },
  })
  const isIntentRoute = getRenewalPaymentRoute(account.signer) === 'intent'

  const onSelectCoin = (coin: RENEWAL_TOKEN) => {
    uiActor.send({ type: 'pricing.token.select', token: coin })
  }

  return (
    <TokenPickerContentBase
      acceptedTokens={RENEWAL_TOKEN_SYMBOLS}
      accountCredit={balances.accountCredit}
      {...(isIntentRoute && pricingQuery.data
        ? { fundedAmount: pricingQuery.data.funded }
        : {})}
      isConnected={isConnected}
      isLoadingBalances={balances.isLoading}
      label={label}
      nextMessage={<Trans>Renew Name</Trans>}
      onNext={() => uiActor.send({ type: 'pricing.step.next' })}
      onSelectCoin={onSelectCoin}
      pricingData={pricingQuery.data?.price}
      pricingLoading={pricingQuery.isLoading}
      selectedToken={selectedToken}
      stablecoinBalances={balances.wallet}
    />
  )
}
