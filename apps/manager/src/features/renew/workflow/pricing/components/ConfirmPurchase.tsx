import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { getRenewPriceQueryOptions } from '@/features/register-v2/data/queries/pricing.query'
import { ConfirmPurchaseBase } from '@/features/register-v2/workflow/pricing/components/ConfirmPurchase'
import { useRenewalUiContext } from '@/features/renew/state/renewalUi.context'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'

export const ConfirmPurchase = () => {
  const { label, uiActor } = useRenewalUiContext()
  const account = useSmartAccountContext()
  const [duration, selectedToken] = useSelector(
    uiActor,
    (state) => [state.context.duration, state.context.selectedToken] as const,
  )

  const pricingQuery = useQuery({
    ...getRenewPriceQueryOptions(label, duration, selectedToken),
    select: (data) => ({
      basePriceNumber: decimalBigintToNumber(
        data.amount,
        selectedToken ? TOKENS[selectedToken].decimals : 0,
      ),
      rawPrice: data.amount,
    }),
  })

  return (
    <ConfirmPurchaseBase
      canNext={
        !!pricingQuery.data &&
        selectedToken !== undefined &&
        !pricingQuery.isLoading &&
        !!account.signer &&
        !!account.accountAddress
      }
      label={label}
      nextMessage={<Trans>Renew Name</Trans>}
      onNext={() => {
        if (
          !pricingQuery.data ||
          !selectedToken ||
          !account.signer ||
          !account.accountAddress
        ) {
          return
        }

        uiActor.send({
          type: 'renewal.start',
          label,
          signer: account.signer,
          duration: BigInt(Math.ceil(duration)),
          token: selectedToken,
          priceRaw: pricingQuery.data.rawPrice,
          priceNumber: pricingQuery.data.basePriceNumber,
        })
      }}
      pricingData={pricingQuery.data?.basePriceNumber}
      selectedToken={selectedToken}
      title={<Trans>Renewing</Trans>}
    />
  )
}
