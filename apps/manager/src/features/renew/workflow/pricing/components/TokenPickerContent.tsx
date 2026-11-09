import { normalizeReferrer } from '@ens-apps/utils/referrer'
import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'
import { useSelector } from '@xstate/react'
import { match, P } from 'ts-pattern'
import type { WalletClient } from 'viem'
import { useConnection } from 'wagmi'
import { getL2FundingSource } from '@/features/register-v2/service/l2FundingSource'
import type { FundingSourceOrigin } from '@/features/register-v2/state/registrationUi.machine'
import { TokenPickerContentBase } from '@/features/register-v2/workflow/pricing/components/TokenPickerContent'
import {
  getPaymentBalances,
  useRenewalBalances,
} from '@/features/renew/data/queries/renewalBalances.query'
import { getRenewPriceQueryOptions } from '@/features/renew/data/queries/renewPricing.query'
import { useRenewalSigner } from '@/features/renew/hooks/useRenewalSigner'
import { useRenewalUiContext } from '@/features/renew/state/renewalUi.context'
import {
  useIsAwaitingRenewalApproval,
  useRenewalPaymentUpdate,
} from '@/features/renew/state/renewalUi.selectors'
import {
  getRenewalPaymentScreen,
  getRenewalReceiptTotalRaw,
  isRenewalReceiptReady,
} from '@/features/renew/utils/renewalFunding'
import { getRenewalPaymentRoute } from '@/features/renew/utils/renewalPaymentRoute'
import { getRenewalStartFunding } from '@/features/renew/utils/renewalStartFunding'
import { ENS_LABS_REFERRER } from '@/lib/referrer'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { type RENEWAL_TOKEN, TOKENS } from '@/lib/tokens'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { useRenewalEthPayment } from '../useRenewalEthPayment'
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
    paymentAsset,
  ] = useSelector(
    uiActor,
    (state) =>
      [
        state.context.duration,
        state.context.selectedToken,
        state.context.renewerAddress,
        state.context.fundingSourceChainId,
        state.context.fundingSourceOrigin,
        state.context.paymentAsset,
      ] as const,
  )
  const token = selectedToken ?? TOKENS.USDC.symbol
  const credit = getPaymentBalances(balances, {
    isPaidWithEth: paymentAsset === 'eth',
    l2ChainId: fundingSourceChainId,
  })
  const isAwaitingApproval = useIsAwaitingRenewalApproval(uiActor)
  const paymentUpdate = useRenewalPaymentUpdate(uiActor)
  const isReviewingPayment = paymentUpdate?.status === 'reviewing'
  // The wallet is only waiting on a signature once the user has accepted.
  const isBusy = isAwaitingApproval && !isReviewingPayment

  const pricingQuery = useQuery({
    ...getRenewPriceQueryOptions(label, duration, token, protocol),
    select: (data) => {
      const decimals = TOKENS[token].decimals
      const price = decimalBigintToNumber(data.amount, decimals)
      // The intent route moves exactly the price into the account.
      return {
        rawPrice: data.amount,
        price,
        fundedRaw: data.amount,
        funded: price,
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
      accountCredit: credit.accountCredit,
      accountCreditRaw: credit.accountCreditRaw,
    })
  // An L2 or ETH pays a USDC renewal into the account on the intent route.
  // Sized on the fee, so a failed fee quote leaves the wallet alone.
  const isUsdcMethodQuotable =
    isIntentRoute &&
    token === TOKENS.USDC.symbol &&
    (quote.isQuoting || feeRaw !== undefined)
  const l2Payment = useRenewalL2Payment({
    isEnabled: isUsdcMethodQuotable,
    rentTotalRaw: pricingQuery.data?.fundedRaw,
    feeRaw,
    hcaBalanceRaw: balances.circleCreditRaw,
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

  const ethPayment = useRenewalEthPayment({
    isEnabled: isUsdcMethodQuotable,
    rentTotalRaw: pricingQuery.data?.fundedRaw,
    feeRaw,
    hcaBalanceRaw: balances.circleCreditRaw,
    isSelected: paymentAsset === 'eth',
    onSelect: () =>
      uiActor.send({ type: 'pricing.paymentAsset.select', asset: 'eth' }),
    onFallbackSelect: () =>
      uiActor.send({
        type: 'pricing.paymentAsset.select',
        asset: 'eth',
        origin: 'fallback',
      }),
  })
  const isPaidWithEth = ethPayment?.isSelected === true

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

  const onSelectCoin = (coin: RENEWAL_TOKEN, origin?: FundingSourceOrigin) => {
    uiActor.send({
      type: 'pricing.token.select',
      token: coin,
      ...(origin ? { origin } : {}),
    })
  }

  // As registration's: the review keeps its own wording, the wallet route renews directly.
  const nextMessage = match({
    isReviewingPayment,
    isApprovalRequired,
    isAwaitingApproval,
    isIntentRoute,
    isQuoting,
    isPaidWithEth,
  })
    .with({ isReviewingPayment: true, isApprovalRequired: true }, () => (
      <Trans>Sign payment approval</Trans>
    ))
    .with({ isReviewingPayment: true }, () => <Trans>Sign renewal</Trans>)
    .with({ isAwaitingApproval: true }, () => <Trans>Renewing...</Trans>)
    .with({ isQuoting: true }, () => <Trans>Loading...</Trans>)
    .with({ isIntentRoute: true, isPaidWithEth: true }, () => (
      <Trans>Swap and Renew</Trans>
    ))
    .with({ isIntentRoute: true }, () => <Trans>Sign approval</Trans>)
    .otherwise(() => <Trans>Renew name</Trans>)

  const checkoutTotalRaw = getRenewalReceiptTotalRaw({
    prompt: paymentUpdate?.prompt,
    fundedRaw: pricingQuery.data?.fundedRaw,
    accountBalanceRaw: credit.accountCreditRaw[token],
    decimals: TOKENS[token].decimals,
  })

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
    const funding = getRenewalStartFunding({
      isIntentRoute,
      displayedDebit,
      // Bridged from the L2, bounded by the charge this screen showed.
      l2Funding: l2Source && {
        source: l2Source,
        displayedCharge: selectedL2?.amountInRaw,
      },
      isPaidWithEth,
      // Swapped from ETH, bounded by the ETH shown.
      ethFunding: ethPayment?.funding,
    })
    if (funding.status === 'refused') return
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
      // amount shown here without a second confirmation.
      ...funding.fields,
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
      accountCredit={funding ? undefined : credit.accountCredit}
      // After a Cancel the fee re-quotes; Continue waits for it and for the receipt's total.
      canProceed={
        canStart &&
        !funding?.isLoading &&
        isRenewalReceiptReady({ isIntentRoute, checkoutTotalRaw })
      }
      {...(isIntentRoute
        ? {
            checkoutReceipt: {
              totalRaw: checkoutTotalRaw,
              totalLabel: <Trans>Renewal total</Trans>,
            },
          }
        : {})}
      {...(isIntentRoute && pricingQuery.data
        ? { fundedAmount: pricingQuery.data.funded }
        : {})}
      ethPayment={ethPayment}
      fullyCoveredMessage={
        <Trans>
          No additional payment needed. You'll still need to sign the renewal.
        </Trans>
      }
      funding={funding}
      hasBudgetQuoteFailed={hasQuoteFailed}
      helpMessage={match({ isIntentRoute, l2ChainName, isPaidWithEth })
        .with({ isPaidWithEth: true }, () => (
          <Trans>
            You will be wrapping your ETH into WETH, swapping WETH for USDC,
            which will then be used to renew the name. The final price can shift
            slightly with the market price.
          </Trans>
        ))
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
      isLoadingBalances={balances.isLoading}
      isMethodListHidden={isReviewingPayment}
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
      shortfallLabel={<Trans>Renew name</Trans>}
      showNetworkFeeDetails={isIntentRoute}
      stablecoinBalances={balances.wallet}
      totalLabel={<Trans>Renewal total</Trans>}
      walletDebitFor={walletDebitFor}
    />
  )
}
