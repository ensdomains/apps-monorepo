import type { Signer } from '@ens-apps/transaction-manager'
import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import type { WalletClient } from 'viem'
import { ConfirmPurchaseBase } from '@/features/register-v2/workflow/pricing/components/ConfirmPurchase'
import { getRenewPriceQueryOptions } from '@/features/renew/data/queries/renewPricing.query'
import { useRenewalUiContext } from '@/features/renew/state/renewalUi.context'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { TOKENS } from '@/lib/tokens'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'

export const ConfirmPurchase = () => {
  const { label, uiActor, protocol } = useRenewalUiContext()
  const account = useSmartAccountContext()
  const [duration, selectedToken] = useSelector(
    uiActor,
    (state) => [state.context.duration, state.context.selectedToken] as const,
  )

  const pricingQuery = useQuery({
    ...getRenewPriceQueryOptions(label, duration, selectedToken, protocol),
    select: (data) => ({
      basePriceNumber: decimalBigintToNumber(
        data.amount,
        selectedToken ? TOKENS[selectedToken].decimals : 0,
      ),
      rawPrice: data.amount,
    }),
  })

  // Two routes. On a smart account the renewal is an owner-signed intent paid
  // in USDC out of the HCA, with the connected wallet only signing typed data.
  // Otherwise it falls back to the direct-wallet route, where the EOA approves
  // and renews itself as `msg.sender`.
  const walletClient = account.walletClient as WalletClient | undefined
  const ownerAddress = account.ownerAddress ?? null

  // The account context's signer already reflects the active route: a
  // rhinestone signer with an HCA configured, an EOA signer without one.
  const renewalSigner: Signer | undefined =
    account.signer ?? (walletClient ? { type: 'eoa', walletClient } : undefined)

  return (
    <ConfirmPurchaseBase
      canNext={
        !!pricingQuery.data &&
        selectedToken !== undefined &&
        !pricingQuery.isLoading &&
        !!renewalSigner &&
        !!ownerAddress &&
        !!walletClient
      }
      label={label}
      nextMessage={<Trans>Renew Name</Trans>}
      onNext={() => {
        if (
          !pricingQuery.data ||
          !selectedToken ||
          !renewalSigner ||
          !ownerAddress ||
          !walletClient
        ) {
          return
        }

        uiActor.send({
          type: 'renewal.start',
          label,
          signer: renewalSigner,
          ownerAddress,
          walletClient,
          duration,
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
