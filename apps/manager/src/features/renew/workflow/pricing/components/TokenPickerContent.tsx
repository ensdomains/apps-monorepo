import { authorizedPaymentAmount } from '@ens-apps/transaction-manager/machines/registration/registration.actors'
import { normalizeReferrer } from '@ens-apps/utils/referrer'
import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'
import { useSelector } from '@xstate/react'
import { match, P } from 'ts-pattern'
import type { WalletClient } from 'viem'
import { useConnection } from 'wagmi'
import { getL2FundingSource } from '@/features/register-v2/service/l2FundingSource'
import { TokenPickerContentBase } from '@/features/register-v2/workflow/pricing/components/TokenPickerContent'
import { useRenewalBalances } from '@/features/renew/data/queries/renewalBalances.query'
import { getRenewPriceQueryOptions } from '@/features/renew/data/queries/renewPricing.query'
import { useRenewalSigner } from '@/features/renew/hooks/useRenewalSigner'
import { useRenewalUiContext } from '@/features/renew/state/renewalUi.context'
import {
  useIsAwaitingRenewalApproval,
  useRenewalPaymentUpdate,
} from '@/features/renew/state/renewalUi.selectors'
import { getRenewalPaymentScreen } from '@/features/renew/utils/renewalFunding'
import { getRenewalPaymentRoute } from '@/features/renew/utils/renewalPaymentRoute'
import { ENS_LABS_REFERRER } from '@/lib/referrer'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { type RENEWAL_TOKEN, TOKENS } from '@/lib/tokens'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { useRenewalIntentFunding } from '../useRenewalIntentFunding'
import { useRenewalL2Payment } from '../useRenewalL2Payment'
import { PaymentUpdateNotice } from './PaymentUpdateNotice'

export const TokenPickerContent = () => {
  const { label, uiActor, protocol } = useRenewalUiContext()
  const account = useSmartAccountContext()
  const signer = useRenewalSigner()
  const balances = useRenewalBalances()
  const { isConnected: isEoaConnected } = useConnection()
  const isConnected =
    protocol === 'v1' || getRenewalPaymentRoute(signer) === 'wallet'
      ? isEoaConnected
      : account.isConnected
  const [
    duration,
    selectedToken,
    renewerAddress,
    fundingSourceChainId,
    fundingSourceOrigin,
  ] = useSelector(
    uiActor,
    (state) =>
      [
        state.context.duration,
        state.context.selectedToken,
        state.context.renewerAddress,
        state.context.fundingSourceChainId,
        state.context.fundingSourceOrigin,
      ] as const,
  )
  const token = selectedToken ?? TOKENS.USDC.symbol
  const isAwaitingApproval = useIsAwaitingRenewalApproval(uiActor)
  const paymentUpdate = useRenewalPaymentUpdate(uiActor)
  const isReviewingPayment = paymentUpdate?.status === 'reviewing'
  // The wallet is only waiting on a signature once the user has accepted.
  const isBusy = isAwaitingApproval && !isReviewingPayment
  // The L2 a started renewal pays from. The live selection lets go of it once
  // the payment lands and there is nothing left to bridge.
  const payingL2ChainName = useSelector(
    uiActor,
    (state) => state.context.submissionData?.l2Funding?.source.chain.name,
  )

  const pricingQuery = useQuery({
    ...getRenewPriceQueryOptions(label, duration, token, protocol),
    select: (data) => {
      const decimals = TOKENS[token].decimals
      const fundedRaw = authorizedPaymentAmount(data.amount)
      return {
        rawPrice: data.amount,
        price: decimalBigintToNumber(data.amount, decimals),
        // The intent route moves the approval's headroom into the account
        // too, so the wallet is gated on that, not on the price alone.
        fundedRaw,
        funded: decimalBigintToNumber(fundedRaw, decimals),
      }
    },
  })
  const { isIntentRoute, retryQuote, displayedDebit, feeRaw, ...quote } =
    useRenewalIntentFunding({
      items: [{ label, duration }],
      token,
      protocol,
      renewerAddress,
      account: { ...account, signer },
      pricing: pricingQuery.data,
      accountCredit: balances.accountCredit,
      accountCreditRaw: balances.accountCreditRaw,
    })
  // An L2 bridges USDC into the account, so it pays a USDC renewal on the
  // intent route. Sized on the fee, so a failed fee quote leaves the wallet alone.
  const l2Payment = useRenewalL2Payment({
    isEnabled:
      isIntentRoute &&
      token === TOKENS.USDC.symbol &&
      (quote.isQuoting || feeRaw !== undefined),
    rentTotalRaw: pricingQuery.data?.fundedRaw,
    feeRaw,
    hcaBalanceRaw: balances.accountCreditRaw.USDC,
    selectedChainId: fundingSourceChainId,
    selectedOrigin: fundingSourceOrigin,
    onSelect: (chainId) =>
      uiActor.send({ type: 'pricing.fundingSource.select', chainId }),
    onFallbackSelect: (chainId) =>
      uiActor.send({
        type: 'pricing.fundingSource.select',
        chainId,
        origin: 'fallback',
      }),
  })
  const selectedL2 = l2Payment?.rows.find(
    ({ option }) => option.source.chain.id === l2Payment.selectedChainId,
  )
  const l2ChainName = selectedL2?.option.source.chain.name

  // An increased payment replaces the receipt with the figures the wallet
  // would actually be asked for.
  const {
    funding,
    walletDebitFor,
    isQuoting,
    hasQuoteFailed,
    isApprovalRequired,
  } = getRenewalPaymentScreen({
    prompt: paymentUpdate?.prompt,
    selectedToken: token,
    quote,
  })

  // The owner wallet signs the intent and any funding permit, so the renewal
  // cannot start until the account context has both.
  const walletClient = account.walletClient as WalletClient | undefined
  const ownerAddress = account.ownerAddress ?? null
  const canStart = !!signer && !!ownerAddress && !!walletClient

  const onSelectCoin = (coin: RENEWAL_TOKEN) => {
    uiActor.send({ type: 'pricing.token.select', token: coin })
  }

  const isFullyCovered = funding?.walletDebit === 0
  const nextMessage = match({
    isReviewingPayment,
    isApprovalRequired,
    isAwaitingApproval,
    isIntentRoute,
    isQuoting,
    isFullyCovered,
    payingL2ChainName,
  })
    .with({ isReviewingPayment: true, isApprovalRequired: true }, () => (
      <Trans>Sign payment approval</Trans>
    ))
    .with({ isReviewingPayment: true }, () => <Trans>Sign renewal</Trans>)
    .with(
      { isAwaitingApproval: true, payingL2ChainName: P.string },
      ({ payingL2ChainName: l2ChainName }) => (
        <Trans>Paying from {l2ChainName}…</Trans>
      ),
    )
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
      !walletClient
    ) {
      return
    }
    const l2Source =
      selectedL2 &&
      getL2FundingSource(ownerAddress, selectedL2.option.source.chain.id)
    // The intent route signs only against an amount the user was shown: the
    // wallet debit, or the L2 charge.
    if (isIntentRoute && !displayedDebit && !l2Source) return
    uiActor.send({
      type: 'renewal.start',
      referrer: normalizeReferrer(referrer, ENS_LABS_REFERRER),
      label,
      signer,
      ownerAddress,
      walletClient,
      duration,
      token: selectedToken,
      priceRaw: pricingQuery.data.rawPrice,
      priceNumber: pricingQuery.data.price,
      // Checked against the intent's own quote, so the wallet opens on the
      // amount shown here without a second confirmation. Paying from an L2,
      // the screen showed that charge instead, so the debit is not passed.
      ...(displayedDebit && !l2Source ? { displayedDebit } : {}),
      // Paid from an L2, what the account is short is bridged in from there,
      // bounded by the charge this screen showed.
      ...(l2Source
        ? {
            l2Funding: {
              source: l2Source,
              displayedCharge: selectedL2?.amountInRaw,
            },
          }
        : {}),
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
      helpMessage={match({ isIntentRoute, l2ChainName })
        .with({ l2ChainName: P.string }, ({ l2ChainName }) => (
          <Trans>
            Your wallet first asks you to sign a payment of the amount shown on{' '}
            {l2ChainName}. Once it arrives, you sign the renewal itself.
          </Trans>
        ))
        .with({ isIntentRoute: true }, () => (
          <Trans>
            If your wallet needs to pay, it first asks you to sign a payment
            approval for up to the amount due. You then sign the renewal itself.
          </Trans>
        ))
        .otherwise(() => (
          <Trans>
            Your wallet asks you to approve the payment if needed, then to
            confirm the renewal transaction.
          </Trans>
        ))}
      isBusy={isBusy}
      isConnected={isConnected}
      isEstimate={isIntentRoute}
      isLoadingBalances={balances.isLoading}
      isQuotingFunding={isQuoting}
      l2Payment={l2Payment}
      label={label}
      nextMessage={nextMessage}
      {...paymentActions}
      onRetry={retryQuote}
      onSelectCoin={onSelectCoin}
      pricingData={pricingQuery.data?.price}
      pricingLoading={pricingQuery.isLoading}
      receiptNotice={
        paymentUpdate && (
          <PaymentUpdateNotice
            isApprovalRequired={isApprovalRequired}
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
