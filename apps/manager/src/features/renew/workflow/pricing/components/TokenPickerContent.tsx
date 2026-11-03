import { authorizedPaymentAmount } from '@ens-apps/transaction-manager/machines/registration/registration.actors'
import { normalizeReferrer } from '@ens-apps/utils/referrer'
import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'
import { useSelector } from '@xstate/react'
import { match } from 'ts-pattern'
import type { WalletClient } from 'viem'
import { useConnection } from 'wagmi'
import { TokenPickerContentBase } from '@/features/register-v2/workflow/pricing/components/TokenPickerContent'
import { useRenewalBalances } from '@/features/renew/data/queries/renewalBalances.query'
import { getRenewPriceQueryOptions } from '@/features/renew/data/queries/renewPricing.query'
import { useRenewalUiContext } from '@/features/renew/state/renewalUi.context'
import {
  useIsAwaitingRenewalApproval,
  useRenewalPaymentUpdate,
} from '@/features/renew/state/renewalUi.selectors'
import { getRenewalPaymentScreen } from '@/features/renew/utils/renewalFunding'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { type RENEWAL_TOKEN, TOKENS } from '@/lib/tokens'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { useRenewalIntentFunding } from '../useRenewalIntentFunding'
import { PaymentUpdateNotice } from './PaymentUpdateNotice'

export const TokenPickerContent = () => {
  const { label, uiActor, protocol } = useRenewalUiContext()
  const account = useSmartAccountContext()
  const balances = useRenewalBalances()
  const { isConnected: isEoaConnected } = useConnection()
  const isConnected = protocol === 'v1' ? isEoaConnected : account.isConnected
  const [duration, selectedToken, renewerAddress] = useSelector(
    uiActor,
    (state) =>
      [
        state.context.duration,
        state.context.selectedToken,
        state.context.renewerAddress,
      ] as const,
  )
  const token = selectedToken ?? TOKENS.USDC.symbol
  const isAwaitingApproval = useIsAwaitingRenewalApproval(uiActor)
  const paymentUpdate = useRenewalPaymentUpdate(uiActor)
  const isReviewingPayment = paymentUpdate?.status === 'reviewing'
  // The wallet is only waiting on a signature once the user has accepted.
  const isBusy = isAwaitingApproval && !isReviewingPayment

  const pricingQuery = useQuery({
    ...getRenewPriceQueryOptions(label, duration, token, protocol),
    select: (data) => {
      const decimals = TOKENS[token].decimals
      return {
        rawPrice: data.amount,
        price: decimalBigintToNumber(data.amount, decimals),
        // The intent route moves the approval's headroom into the account
        // too, so the wallet is gated on that, not on the rent alone.
        funded: decimalBigintToNumber(
          authorizedPaymentAmount(data.amount),
          decimals,
        ),
        fundedRaw: authorizedPaymentAmount(data.amount),
      }
    },
  })
  const { isIntentRoute, retryQuote, displayedDebit, ...quote } =
    useRenewalIntentFunding({
      label,
      duration,
      token,
      protocol,
      renewerAddress,
      account,
      pricing: pricingQuery.data,
      accountCredit: balances.accountCredit,
      accountCreditRaw: balances.accountCreditRaw,
    })

  // The owner wallet signs the intent and any funding permit, so the renewal
  // cannot start until the account context has both.
  const walletClient = account.walletClient as WalletClient | undefined
  const ownerAddress = account.ownerAddress ?? null
  const signer = account.signer ?? undefined
  const canStart = !!signer && !!ownerAddress && !!walletClient

  const onSelectCoin = (coin: RENEWAL_TOKEN) => {
    uiActor.send({ type: 'pricing.token.select', token: coin })
  }

  // An increased payment replaces the receipt with the figures the wallet
  // would actually be asked for.
  const { funding, walletDebitFor, isQuoting, hasQuoteFailed, needsApproval } =
    getRenewalPaymentScreen({
      prompt: paymentUpdate?.prompt,
      selectedToken: token,
      quote,
    })

  const isFullyCovered = funding?.walletDebit === 0
  const nextMessage = match({
    isReviewingPayment,
    needsApproval,
    isAwaitingApproval,
    isIntentRoute,
    isQuoting,
    isFullyCovered,
  })
    .with({ isReviewingPayment: true, needsApproval: true }, () => (
      <Trans>Sign payment approval</Trans>
    ))
    .with({ isReviewingPayment: true }, () => <Trans>Sign renewal</Trans>)
    .with({ isAwaitingApproval: true, isIntentRoute: true }, () => (
      <Trans>Signing renewal…</Trans>
    ))
    .with({ isAwaitingApproval: true }, () => <Trans>Approve in wallet</Trans>)
    .with({ isQuoting: true }, () => <Trans>Renew name</Trans>)
    .with({ isIntentRoute: true, isFullyCovered: true }, () => (
      <Trans>Sign renewal</Trans>
    ))
    .with({ isIntentRoute: true }, () => <Trans>Continue in wallet</Trans>)
    .otherwise(() => <Trans>Renew name</Trans>)

  const { referrer } = useSearch({ strict: false })
  const startRenewal = () => {
    if (
      !pricingQuery.data ||
      !selectedToken ||
      !signer ||
      !ownerAddress ||
      !walletClient ||
      // The intent route signs only against an amount the user was shown.
      (isIntentRoute && !displayedDebit)
    ) {
      return
    }
    uiActor.send({
      type: 'renewal.start',
      referrer: normalizeReferrer(referrer),
      label,
      signer,
      ownerAddress,
      walletClient,
      duration,
      token: selectedToken,
      priceRaw: pricingQuery.data.rawPrice,
      priceNumber: pricingQuery.data.price,
      // Checked against the intent's own quote, so the wallet opens on the
      // amount shown here without a second confirmation.
      ...(displayedDebit ? { displayedDebit } : {}),
    })
  }

  // On the updated receipt the CTA accepts the new amount; Cancel drops it.
  const paymentActions = isReviewingPayment
    ? {
        onNext: () => uiActor.send({ type: 'renewal.payment.accept' }),
        onCancel: () => {
          uiActor.send({ type: 'cancel' })
          // Back on the payment step, show the amount signing would use now.
          balances.refetch()
          retryQuote()
        },
      }
    : { onNext: startRenewal }

  return (
    <TokenPickerContentBase
      // With a funding summary the credit is already inside it.
      accountCredit={funding ? undefined : balances.accountCredit}
      canProceed={canStart}
      {...(isIntentRoute && pricingQuery.data
        ? { fundedAmount: pricingQuery.data.funded }
        : {})}
      fullyCoveredMessage={
        <Trans>
          No additional payment needed. You'll still need to sign the renewal.
        </Trans>
      }
      funding={funding}
      hasBudgetQuoteFailed={hasQuoteFailed}
      helpMessage={
        isIntentRoute ? (
          <Trans>
            If your wallet needs to pay, it first asks you to sign a payment
            approval for up to the amount due. You then sign the renewal itself.
          </Trans>
        ) : (
          <Trans>
            Your wallet asks you to approve the payment if needed, then to
            confirm the renewal transaction.
          </Trans>
        )
      }
      isBusy={isBusy}
      isConnected={isConnected}
      isEstimate={isIntentRoute}
      isLoadingBalances={balances.isLoading}
      isQuotingFunding={isQuoting}
      label={label}
      networkFeeTooltip={
        <Trans>
          An estimate of what the transaction that renews your name will cost.
          It is collected together with the renewal price, in the same approval.
        </Trans>
      }
      nextMessage={nextMessage}
      {...paymentActions}
      onRetry={retryQuote}
      onSelectCoin={onSelectCoin}
      pricingData={pricingQuery.data?.price}
      pricingLoading={pricingQuery.isLoading}
      receiptNotice={
        paymentUpdate && (
          <PaymentUpdateNotice
            needsApproval={needsApproval}
            status={paymentUpdate.status}
          />
        )
      }
      selectedToken={selectedToken}
      showNetworkFeeDetails={isIntentRoute}
      stablecoinBalances={balances.wallet}
      totalLabel={<Trans>Renewal total</Trans>}
      walletDebitFor={walletDebitFor}
    />
  )
}
