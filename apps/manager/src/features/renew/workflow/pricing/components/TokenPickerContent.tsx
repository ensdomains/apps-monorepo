import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { match } from 'ts-pattern'
import type { WalletClient } from 'viem'
import { useConnection } from 'wagmi'
import { TokenPickerContentBase } from '@/features/register-v2/workflow/pricing/components/TokenPickerContent'
import { RenewalPaymentNote } from '@/features/renew/components/RenewalPaymentNote'
import { useRenewalBalances } from '@/features/renew/data/queries/renewalBalances.query'
import { getRenewPriceQueryOptions } from '@/features/renew/data/queries/renewPricing.query'
import { useRenewalUiContext } from '@/features/renew/state/renewalUi.context'
import { useIsAwaitingRenewalApproval } from '@/features/renew/state/renewalUi.selectors'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { type RENEWAL_TOKEN, RENEWAL_TOKEN_SYMBOLS, TOKENS } from '@/lib/tokens'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { useRenewalIntentFunding } from '../useRenewalIntentFunding'

export const TokenPickerContent = () => {
  const { t } = useLingui()
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
  const isSigning = useSelector(
    uiActor,
    (state) => state.context.payment.stage === 'signing',
  )
  const token = selectedToken ?? TOKENS.USDC.symbol
  const isAwaitingApproval = useIsAwaitingRenewalApproval(uiActor)

  const pricingQuery = useQuery({
    ...getRenewPriceQueryOptions(label, duration, token, protocol),
    select: (data) => {
      const decimals = TOKENS[token].decimals
      return {
        rawPrice: data.amount,
        price: decimalBigintToNumber(data.amount, decimals),
      }
    },
  })
  const {
    isIntentRoute,
    isQuoting,
    funding,
    walletDebitFor,
    displayedWalletDebitUsdc,
    hasQuoteFailed,
  } = useRenewalIntentFunding({
    label,
    duration,
    token,
    protocol,
    renewerAddress,
    account,
    pricing: pricingQuery.data,
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

  const startRenewal = () => {
    if (
      !pricingQuery.data ||
      !selectedToken ||
      !signer ||
      !ownerAddress ||
      !walletClient ||
      (isIntentRoute &&
        (displayedWalletDebitUsdc === undefined || isQuoting || hasQuoteFailed))
    ) {
      return
    }
    uiActor.send({
      type: 'renewal.start',
      label,
      signer,
      ownerAddress,
      walletClient,
      duration,
      token: selectedToken,
      displayedWalletDebitUsdc,
      priceRaw: pricingQuery.data.rawPrice,
      priceNumber: pricingQuery.data.price,
    })
  }

  return (
    <TokenPickerContentBase
      acceptedTokens={RENEWAL_TOKEN_SYMBOLS}
      canProceed={canStart}
      flow="renewal"
      footer={isIntentRoute && funding ? <RenewalPaymentNote /> : undefined}
      funding={funding}
      globalErrorMessage={
        hasQuoteFailed
          ? t`We couldn’t calculate the renewal total. Please try again.`
          : undefined
      }
      hasBudgetQuoteFailed={hasQuoteFailed}
      infoMessage={
        isIntentRoute && funding && funding.walletDebit > 0
          ? t`Your wallet may ask you to sign a payment approval, then sign the renewal.`
          : undefined
      }
      isBusy={isAwaitingApproval}
      isConnected={isConnected}
      isLoadingBalances={balances.isLoading}
      isQuotingFunding={isQuoting}
      label={label}
      networkFeeTooltip={
        <Trans>
          An estimate of what the transaction that renews your name will cost.
          It is collected together with the renewal price, in the same approval.
        </Trans>
      }
      nextMessage={match({
        isAwaitingApproval,
        isSigning,
        isQuoting,
        isIntentRoute,
        hasWalletDebit: (funding?.walletDebit ?? 0) > 0,
      })
        .with({ isAwaitingApproval: true, isSigning: true }, () => (
          <Trans>Sign in wallet</Trans>
        ))
        .with({ isAwaitingApproval: true }, () => (
          <Trans>Preparing renewal...</Trans>
        ))
        .with({ isQuoting: true }, () => <Trans>Calculating cost...</Trans>)
        .with({ isIntentRoute: false }, () => <Trans>Renew name</Trans>)
        .with({ hasWalletDebit: true }, () => <Trans>Continue in wallet</Trans>)
        .otherwise(() => <Trans>Sign renewal</Trans>)}
      onNext={startRenewal}
      onSelectCoin={onSelectCoin}
      pricingData={pricingQuery.data?.price}
      pricingLoading={pricingQuery.isLoading}
      selectedToken={selectedToken}
      showNetworkFeeDetails={isIntentRoute}
      stablecoinBalances={balances.wallet}
      walletDebitFor={walletDebitFor}
    />
  )
}
