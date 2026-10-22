import { authorizedPaymentAmount } from '@ens-apps/transaction-manager/machines/registration/registration.actors'
import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import type { WalletClient } from 'viem'
import { useConnection } from 'wagmi'
import { TokenPickerContentBase } from '@/features/register-v2/workflow/pricing/components/TokenPickerContent'
import { useRenewalBalances } from '@/features/renew/data/queries/renewalBalances.query'
import { getRenewalFeeQueryOptions } from '@/features/renew/data/queries/renewalFee.query'
import { getRenewPriceQueryOptions } from '@/features/renew/data/queries/renewPricing.query'
import { useRenewalUiContext } from '@/features/renew/state/renewalUi.context'
import { getRenewalPaymentRoute } from '@/features/renew/utils/renewalPaymentRoute'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { type RENEWAL_TOKEN, RENEWAL_TOKEN_SYMBOLS, TOKENS } from '@/lib/tokens'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'

const USDC_DECIMALS = TOKENS.USDC.decimals

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
      }
    },
  })
  const isIntentRoute = getRenewalPaymentRoute(account.signer) === 'intent'

  const feeQuery = useQuery(
    getRenewalFeeQueryOptions({
      label,
      duration,
      token,
      protocol,
      renewerAddress,
      signer:
        isIntentRoute && account.signer?.type === 'rhinestone'
          ? account.signer
          : null,
      ownerAddress: account.ownerAddress ?? null,
    }),
  )
  const networkFee =
    feeQuery.data === null || feeQuery.data === undefined
      ? undefined
      : decimalBigintToNumber(feeQuery.data, USDC_DECIMALS)

  // Shown as "up to": the rent carries its approval headroom and the fee is
  // an estimate. The account's own balance is deducted by the base.
  const funding =
    isIntentRoute && pricingQuery.data && networkFee !== undefined
      ? {
          registration: pricingQuery.data.price,
          networkFee,
          total: pricingQuery.data.funded + networkFee,
          walletDebit: pricingQuery.data.funded + networkFee,
          hcaCredit: 0,
          isLoading: feeQuery.isFetching,
        }
      : undefined

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
      !walletClient
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
      priceRaw: pricingQuery.data.rawPrice,
      priceNumber: pricingQuery.data.price,
    })
  }

  return (
    <TokenPickerContentBase
      acceptedTokens={RENEWAL_TOKEN_SYMBOLS}
      accountCredit={balances.accountCredit}
      canProceed={canStart}
      {...(isIntentRoute && pricingQuery.data
        ? { fundedAmount: pricingQuery.data.funded }
        : {})}
      funding={funding}
      isConnected={isConnected}
      isLoadingBalances={balances.isLoading}
      isQuotingFunding={isIntentRoute && feeQuery.isLoading}
      label={label}
      networkFeeTooltip={
        <Trans>
          An estimate of what the transaction that renews your name will cost.
          It is collected together with the renewal price, in the same approval.
        </Trans>
      }
      nextMessage={<Trans>Renew name</Trans>}
      onNext={startRenewal}
      onSelectCoin={onSelectCoin}
      pricingData={pricingQuery.data?.price}
      pricingLoading={pricingQuery.isLoading}
      selectedToken={selectedToken}
      showNetworkFeeDetails={isIntentRoute}
      stablecoinBalances={balances.wallet}
    />
  )
}
