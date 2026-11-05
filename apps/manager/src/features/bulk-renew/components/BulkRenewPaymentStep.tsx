import { Trans } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { match, P } from 'ts-pattern'
import type { FundingSourceOrigin } from '@/features/register-v2/state/registrationUi.machine'
import { TokenPickerContentBase } from '@/features/register-v2/workflow/pricing/components/TokenPickerContent'
import { RenewalBufferNote } from '@/features/renew/workflow/pricing/components/RenewalBufferNote'
import type { RENEWAL_TOKEN } from '@/lib/tokens'
import type { UseBulkRenewResult } from '../hooks/useBulkRenew'

/** The bulk confirm step: the payment picker registration and single renewal use, under the names. */
export const BulkRenewPaymentStep = ({
  header,
  grandTotal,
  payment,
  selectedToken,
  onSelectCoin,
  onConfirm,
}: {
  /** The names being renewed, in place of a single name's heading. */
  readonly header: ReactNode
  readonly grandTotal: number
  readonly payment: UseBulkRenewResult['payment']
  readonly selectedToken: RENEWAL_TOKEN
  readonly onSelectCoin: (
    coin: RENEWAL_TOKEN,
    origin?: FundingSourceOrigin,
  ) => void
  readonly onConfirm: () => void
}) => {
  const { intentFunding, selectedL2, ethPayment } = payment
  const isPaidWithEth = ethPayment?.isSelected === true
  const { isIntentRoute, isQuoting, funding, walletDebitFor } = intentFunding
  const l2ChainName = selectedL2?.option.source.chain.name

  const nextMessage = match({ isIntentRoute, isQuoting, isPaidWithEth })
    .with({ isQuoting: true }, () => <Trans>Loading...</Trans>)
    .with({ isIntentRoute: true, isPaidWithEth: true }, () => (
      <Trans>Swap and Renew</Trans>
    ))
    .with({ isIntentRoute: true }, () => <Trans>Sign approval</Trans>)
    .otherwise(() => <Trans>Renew names</Trans>)

  return (
    <TokenPickerContentBase
      // With a funding summary the credit is already inside it.
      accountCredit={funding ? undefined : payment.accountCredit}
      canProceed={payment.canProceed}
      {...(isIntentRoute
        ? {
            checkoutReceipt: {
              totalRaw: payment.checkoutTotalRaw,
              totalLabel: <Trans>Renewal total</Trans>,
              isUpTo: true,
              upToNote: <RenewalBufferNote />,
            },
          }
        : {})}
      {...(isIntentRoute && payment.pricesReady
        ? { fundedAmount: payment.fundedTotal }
        : {})}
      ethPayment={ethPayment}
      fullyCoveredMessage={
        <Trans>
          No additional payment needed. You'll still need to sign the renewal.
        </Trans>
      }
      funding={funding}
      header={header}
      helpMessage={match({ isIntentRoute, l2ChainName, isPaidWithEth })
        .with({ isPaidWithEth: true }, () => (
          <Trans>
            You will be wrapping your ETH into WETH, swapping WETH for USDC,
            which will then be used to renew the names. The final price can
            shift slightly with the market price.
          </Trans>
        ))
        .with({ l2ChainName: P.string }, ({ l2ChainName }) => (
          <Trans>
            Your wallet first asks you to sign a payment of the amount shown on{' '}
            {l2ChainName}. Once it arrives, you sign the renewal, once for every
            25 names.
          </Trans>
        ))
        .with({ isIntentRoute: true }, () => (
          <Trans>
            If your wallet needs to pay, it first asks you to sign a payment
            approval for up to the amount due. You then sign the renewal, once
            for every 25 names.
          </Trans>
        ))
        .otherwise(() => (
          <Trans>
            Your wallet asks you to approve the payment if needed, then to
            confirm each name's renewal.
          </Trans>
        ))}
      isConnected={payment.isConnected}
      isEstimate={isIntentRoute}
      isLoadingBalances={payment.isLoadingBalances}
      isQuotingFunding={isQuoting}
      l2Payment={payment.l2Payment}
      nextMessage={nextMessage}
      onNext={onConfirm}
      onSelectCoin={onSelectCoin}
      pricingData={grandTotal}
      pricingLoading={!payment.pricesReady}
      selectedToken={selectedToken}
      shortfallLabel={<Trans>Renew names</Trans>}
      showNetworkFeeDetails={isIntentRoute}
      stablecoinBalances={payment.stablecoinBalances}
      totalLabel={<Trans>Renewal total</Trans>}
      walletDebitFor={walletDebitFor}
    />
  )
}
