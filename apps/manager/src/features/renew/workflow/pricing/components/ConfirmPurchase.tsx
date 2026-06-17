import type { Signer } from '@ens-apps/transaction-manager'
import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import type { WalletClient } from 'viem'
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

  // `ETHRegistrar.renew` charges `_msgSender()`, and the registrar's HCA-aware
  // sender resolution unwraps an HCA caller back to its owner EOA. So the rent
  // is always pulled from the EOA owner — that's the address whose allowance we
  // authorize (and the one that must sign the gasless permit).
  const ownerAddress = account.ownerAddress ?? account.accountAddress

  // EOA signer used ONLY to produce the EIP-2612 permit signature on the
  // rhinestone/HCA path (the HCA can't sign a permit). `account.walletClient`
  // is the connected owner wallet; it can be briefly null during a
  // wallet/connector desync.
  const approvalSigner: Signer | undefined = account.walletClient
    ? { type: 'eoa', walletClient: account.walletClient as WalletClient }
    : undefined

  // HCA renewals authorize payment via an EOA-signed permit, so the EOA wallet
  // must be available to sign it. Disable the action (rather than stalling at
  // the permit step) when it's missing.
  const isHcaRenewal =
    account.signer?.type === 'rhinestone' &&
    !!ownerAddress &&
    !!account.accountAddress &&
    ownerAddress.toLowerCase() !== account.accountAddress.toLowerCase()

  return (
    <ConfirmPurchaseBase
      canNext={
        !!pricingQuery.data &&
        selectedToken !== undefined &&
        !pricingQuery.isLoading &&
        !!account.signer &&
        !!account.accountAddress &&
        !!ownerAddress &&
        (!isHcaRenewal || !!approvalSigner)
      }
      label={label}
      nextMessage={<Trans>Renew Name</Trans>}
      onNext={() => {
        if (
          !pricingQuery.data ||
          !selectedToken ||
          !account.signer ||
          !account.accountAddress ||
          !ownerAddress ||
          (isHcaRenewal && !approvalSigner)
        ) {
          return
        }

        uiActor.send({
          type: 'renewal.start',
          label,
          signer: account.signer,
          ownerAddress,
          approvalSigner,
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
