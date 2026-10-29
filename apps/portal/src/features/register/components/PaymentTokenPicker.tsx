import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { useQueries, useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { type Address, erc20Abi } from 'viem'
import { useConfig, useConnection } from 'wagmi'
import { readContractsQueryOptions } from 'wagmi/query'
import { MessageCard } from '@/components/ui/message-card'
import { PaymentTokenList } from '@/features/register/components/PaymentTokenList'
import { PAYMENT_TOKENS } from '@/features/register/constants/paymentTokens'
import { getRegistrationPriceQueryOptions } from '@/features/register/hooks/useRegistrationPrice'
import { getRenewalPriceQueryOptions } from '@/features/register/hooks/useRenewalPrice'
import { useReportPaymentSelection } from '@/features/register/hooks/useReportPaymentSelection'
import { isPriceResult } from '@/features/register/utils/registrationPrice'
import { getRenewerAddress } from '@/features/renew/utils/renewer'
import { ensChain } from '@/lib/wagmi'
import {
  buildTokenData,
  getSelectedPaymentToken,
  type TokenPrice,
  type TokenWithPriceAndBalance,
} from '../utils/tokenData'

const ethRegistrar = getChainContractAddress({
  chain: ensChain,
  contract: 'ensEthRegistrar',
})

const Skeleton = () => (
  <div className="space-y-4">
    <div className="h-5 w-40 bg-muted animate-pulse rounded-md" />
    <div className="space-y-2">
      <div className="h-16 w-full bg-muted animate-pulse rounded-sm" />
      <div className="h-16 w-full bg-muted animate-pulse rounded-sm" />
    </div>
  </div>
)

const toAmounts = (
  reads:
    | readonly {
        readonly status: 'success' | 'failure'
        readonly result?: string | number | bigint
      }[]
    | undefined,
) =>
  (reads ?? []).map((read) =>
    read.status === 'success' && read.result !== undefined
      ? BigInt(read.result)
      : 0n,
  )

type ContractReads = Parameters<typeof toAmounts>[0]

const getTokenData = (
  prices: readonly TokenPrice[] | null,
  balances: ContractReads,
  allowances: ContractReads,
) =>
  prices && balances
    ? buildTokenData(
        PAYMENT_TOKENS,
        prices,
        toAmounts(balances),
        toAmounts(allowances),
      )
    : []

/**
 * Nothing is selected until every read is in, or behind a failed price: a
 * missing allowance would read as zero and a stale token could be confirmed.
 */
const getSelectablePrices = (
  prices: readonly TokenPrice[] | null,
  isReading: boolean,
  isPriceFailed: boolean,
) => (isReading || isPriceFailed ? null : prices)

const selectionKey = (token: TokenWithPriceAndBalance | null) =>
  token && `${token.address}:${token.price.total}:${token.allowance}`

type PriceErrorCardProps = {
  readonly mode: 'register' | 'renew'
  readonly isRetrying?: boolean
  readonly onRetry: () => void
}

export const PriceErrorCard = ({
  mode,
  isRetrying = false,
  onRetry,
}: PriceErrorCardProps) => (
  <MessageCard
    variant="warning"
    icon={<AlertTriangle className="size-6" />}
    title="Couldn't load price"
    className="xl:min-w-none"
    description={`We couldn't fetch the ${mode === 'renew' ? 'renewal' : 'registration'} price for this name. Please try again.`}
    actionButton={{
      label: isRetrying ? 'Retrying…' : 'Try again',
      onClick: onRetry,
    }}
  />
)

type PaymentTokenPickerProps = {
  readonly name: string
  readonly duration: number
  /**
   * A submit transaction is in flight — disables token selection while it runs.
   * Only the register flow sets this; renewals leave it unset. This is a pending
   * flag, not the register/renew discriminant — that's `mode`.
   */
  readonly isSubmitting?: boolean
  readonly onSelectionChange: (token: TokenWithPriceAndBalance | null) => void
} & (
  | {
      readonly mode: 'renew'
      /** Whether the name is v2-native/migrated; selects the renewer contract. */
      readonly isV2: boolean
    }
  | {
      readonly mode?: 'register'
      readonly isV2?: never
    }
)

export const PaymentTokenPicker = (props: PaymentTokenPickerProps) => {
  const { name, duration, isSubmitting = false, onSelectionChange } = props
  const config = useConfig()
  const { address } = useConnection()
  const [chosenToken, setChosenToken] = useState<Address | null>(null)

  const spender =
    props.mode === 'renew' ? getRenewerAddress(props.isV2) : ethRegistrar

  const balancesQuery = useQuery({
    ...readContractsQueryOptions(config, {
      contracts: PAYMENT_TOKENS.map((token) => ({
        address: token.address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address],
      })),
    }),
    enabled: Boolean(address),
    staleTime: 0,
  })

  const allowancesQuery = useQuery({
    ...readContractsQueryOptions(config, {
      contracts: PAYMENT_TOKENS.map((token) => ({
        address: token.address,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, spender],
      })),
    }),
    enabled: Boolean(address),
    staleTime: 0,
  })

  const priceQueries = useQueries({
    queries: PAYMENT_TOKENS.map((token) =>
      props.mode === 'renew'
        ? getRenewalPriceQueryOptions({
            name,
            duration,
            token: token.address,
            renewerAddress: spender,
          })
        : getRegistrationPriceQueryOptions({
            name,
            duration,
            token: token.address,
          }),
    ),
  })

  const prices = priceQueries.map((query) => query.data)
  const resolvedPrices = prices.every(isPriceResult) ? prices : null
  const isPriceLoading = priceQueries.some((query) => query.isLoading)
  // A settled price read that errored (or returned a malformed result) must
  // block checkout, as in MultiNamePaymentTokenPicker: pricing a token at zero
  // shows $0.00, skips the approval step, and the registrar still pulls its
  // live price.
  const isPriceFailed =
    !isPriceLoading &&
    (!resolvedPrices || priceQueries.some((query) => query.isError))

  const isReading =
    balancesQuery.isLoading || allowancesQuery.isLoading || isPriceLoading
  const tokenData = getTokenData(
    getSelectablePrices(resolvedPrices, isReading, isPriceFailed),
    balancesQuery.data,
    allowancesQuery.data,
  )
  const selectedToken = getSelectedPaymentToken(tokenData, chosenToken)
  useReportPaymentSelection(
    selectedToken,
    selectionKey(selectedToken),
    onSelectionChange,
  )

  if (isReading) {
    return <Skeleton />
  }

  if (!address) {
    return (
      <MessageCard
        icon={<AlertTriangle className="size-6" />}
        title="Connect your wallet"
        className="xl:min-w-none"
        description="Connect your wallet to view available payment tokens for your ENS registration."
      />
    )
  }

  if (!resolvedPrices || isPriceFailed) {
    return (
      <PriceErrorCard
        mode={props.mode ?? 'register'}
        isRetrying={priceQueries.some((query) => query.isFetching)}
        onRetry={() => {
          for (const query of priceQueries) void query.refetch()
        }}
      />
    )
  }

  if (!balancesQuery.data) {
    return null
  }

  const noSupportedTokenHasSufficientBalance = tokenData.every(
    (token) => token.balance < token.price.total,
  )

  const handleSelect = (token: TokenWithPriceAndBalance) =>
    setChosenToken(token.address)

  return (
    <>
      <h2 id="payment-heading" className="text-h3 leading-7 font-medium">
        Select payment method
      </h2>
      {noSupportedTokenHasSufficientBalance ? (
        <MessageCard
          variant="warning"
          icon={<AlertTriangle className="size-6" />}
          title="Insufficient balance"
          className="xl:min-w-none"
          description={
            props.mode === 'renew'
              ? "You'll need to hold USDC in your connected wallet in order to extend your ENS name."
              : "You'll need to hold USDC in your connected wallet in order to complete the registration of your ENS name."
          }
        />
      ) : (
        <PaymentTokenList
          tokenData={tokenData}
          selectedToken={selectedToken?.address}
          isRegistering={isSubmitting}
          onSelect={handleSelect}
        />
      )}
    </>
  )
}
