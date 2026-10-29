import { useQueries, useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { type Address, erc20Abi } from 'viem'
import { useConfig, useConnection } from 'wagmi'
import { readContractsQueryOptions } from 'wagmi/query'
import { MessageCard } from '@/components/ui/message-card'
import {
  type PaymentTokenDisplay,
  PaymentTokenList,
} from '@/features/register/components/PaymentTokenList'
import { PAYMENT_TOKENS } from '@/features/register/constants/paymentTokens'
import { getRenewalPriceQueryOptions } from '@/features/register/hooks/useRenewalPrice'
import { useReportPaymentSelection } from '@/features/register/hooks/useReportPaymentSelection'
import { isPriceResult } from '@/features/register/utils/registrationPrice'
import { getSelectedPaymentToken } from '@/features/register/utils/tokenData'
import type {
  MultiRenewalEntry,
  RenewerPayment,
} from '../../hooks/useRenewalTransactions'
import { getRenewerAddress } from '../../utils/renewer'
import {
  computeRenewerPayments,
  distinctRenewers,
} from '../../utils/renewerPayments'

// The chosen payment token plus its per-renewer approval breakdown. A mixed
// v1+v2 batch yields two payments (ETHRenewerV1 + v2 ETHRegistrar); a same-kind
// batch yields one. Threaded up to seed the renewal flow's approval step(s).
export type MultiNameTokenSelection = {
  readonly tokenAddress: Address
  readonly payments: readonly RenewerPayment[]
}

const Skeleton = () => (
  <div className="space-y-4">
    <div className="h-5 w-40 bg-muted animate-pulse rounded-md" />
    <div className="space-y-2">
      <div className="h-16 w-full bg-muted animate-pulse rounded-sm" />
      <div className="h-16 w-full bg-muted animate-pulse rounded-sm" />
    </div>
  </div>
)

type MultiNamePaymentTokenPickerProps = {
  readonly renewals: readonly MultiRenewalEntry[]
  readonly onSelectionChange: (
    selection: MultiNameTokenSelection | null,
  ) => void
}

export const MultiNamePaymentTokenPicker = ({
  renewals,
  onSelectionChange,
}: MultiNamePaymentTokenPickerProps) => {
  const config = useConfig()
  const { address } = useConnection()
  const [chosenToken, setChosenToken] = useState<Address | null>(null)
  const hasAddress = Boolean(address)

  // Distinct renewer contracts among the selected names — the ERC-20 spenders we
  // price against and read allowances for (one for a same-kind batch, two for a
  // mixed v1+v2 batch).
  const renewers = distinctRenewers(renewals)

  const balancesQuery = useQuery({
    ...readContractsQueryOptions(config, {
      contracts: PAYMENT_TOKENS.map((token) => ({
        address: token.address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address],
      })),
    }),
    enabled: hasAddress,
  })

  // Allowance per (payment token × renewer), flattened so a mixed batch reads
  // both spenders. Indexed as tokenIndex * renewers.length + renewerIndex.
  const allowancesQuery = useQuery({
    ...readContractsQueryOptions(config, {
      contracts: PAYMENT_TOKENS.flatMap((token) =>
        renewers.map((renewer) => ({
          address: token.address,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address, renewer],
        })),
      ),
    }),
    enabled: hasAddress && renewers.length > 0,
  })

  // Price each name against its own renewer so v1 names are quoted by
  // ETHRenewerV1 and v2 names by the v2 ETHRegistrar. One useQueries over the
  // payment tokens, flattened (one block per token) the same way as the
  // allowance reads above, then sliced back into per-token views.
  const priceQueries = useQueries({
    queries: PAYMENT_TOKENS.flatMap((token) =>
      renewals.map((renewal) =>
        getRenewalPriceQueryOptions({
          name: renewal.selectedName.name,
          duration: renewal.duration,
          token: token.address,
          renewerAddress: getRenewerAddress(renewal.selectedName.isV2),
        }),
      ),
    ),
  })
  const priceQueriesByToken = PAYMENT_TOKENS.map((_, tokenIndex) =>
    priceQueries.slice(
      tokenIndex * renewals.length,
      (tokenIndex + 1) * renewals.length,
    ),
  )

  const isLoading =
    balancesQuery.isLoading ||
    allowancesQuery.isLoading ||
    priceQueries.some((q) => q.isLoading)

  const balances = (balancesQuery.data ?? []).map((balance) =>
    balance.status === 'success' && balance.result !== undefined
      ? BigInt(balance.result)
      : 0n,
  )

  const allowanceResults = (allowancesQuery.data ?? []).map((allowance) =>
    allowance.status === 'success' && allowance.result !== undefined
      ? BigInt(allowance.result)
      : 0n,
  )

  const allowanceFor = (tokenIndex: number, renewerIndex: number): bigint =>
    allowanceResults[tokenIndex * renewers.length + renewerIndex] ?? 0n

  const sumTotal = (queries: typeof priceQueries): bigint =>
    queries.reduce(
      (sum, q) => (q.data && isPriceResult(q.data) ? sum + q.data.total : sum),
      0n,
    )

  // Per-renewer approval breakdown for a token: group each name's charge by its
  // renewer, then attach that renewer's current allowance (by position in the
  // `renewers` list, matching the flattened allowance reads above).
  const buildPayments = (queries: typeof priceQueries, tokenIndex: number) =>
    computeRenewerPayments(
      renewals.map((renewal, i) => {
        const q = queries[i]
        return {
          renewer: getRenewerAddress(renewal.selectedName.isV2),
          total: q?.data && isPriceResult(q.data) ? q.data.total : 0n,
        }
      }),
      (renewer) => allowanceFor(tokenIndex, renewers.indexOf(renewer)),
    )

  const paymentsByToken: readonly (readonly RenewerPayment[])[] =
    priceQueriesByToken.map((queries, tokenIndex) =>
      buildPayments(queries, tokenIndex),
    )

  const tokenData: PaymentTokenDisplay[] = PAYMENT_TOKENS.map(
    (token, tokenIndex) => ({
      ...token,
      balance: balances[tokenIndex] ?? 0n,
      price: { total: sumTotal(priceQueriesByToken[tokenIndex] ?? []) },
    }),
  )

  // A settled-but-errored price read must NOT be treated as 0: that would
  // understate a renewer's approval total (risking an on-chain revert) and make
  // a token look affordable when it isn't. If any name's price failed to resolve,
  // block selection and prompt a retry rather than price the batch wrong.
  const pricesResolved = priceQueries.every(
    (q) => q.data && isPriceResult(q.data),
  )

  // A missing allowance would read as zero, so nothing is selected until every read is in.
  const selectedToken =
    pricesResolved && !isLoading
      ? getSelectedPaymentToken(tokenData, chosenToken)
      : null
  const selectedIndex = PAYMENT_TOKENS.findIndex(
    (token) => token.address === selectedToken?.address,
  )
  const selectedPayments = paymentsByToken[selectedIndex]
  const selection =
    selectedToken && selectedPayments
      ? { tokenAddress: selectedToken.address, payments: selectedPayments }
      : null
  useReportPaymentSelection(
    selection,
    selection &&
      `${selection.tokenAddress}:${selection.payments
        .map(
          ({ renewer, total, allowance }) => `${renewer}=${total}/${allowance}`,
        )
        .join(',')}`,
    onSelectionChange,
  )

  if (isLoading) return <Skeleton />

  if (!pricesResolved) {
    return (
      <MessageCard
        variant="warning"
        icon={<AlertTriangle className="size-6" />}
        title="Couldn't load renewal prices"
        className="xl:min-w-none"
        description="We couldn't fetch the renewal price for one or more names. Please try again in a moment."
      />
    )
  }

  const noSupportedTokenHasSufficientBalance = tokenData.every(
    (token) => token.balance < token.price.total,
  )

  const handleSelect = (token: PaymentTokenDisplay) =>
    setChosenToken(token.address)

  return (
    <>
      <h2 className="text-base font-medium">Select payment method</h2>
      {noSupportedTokenHasSufficientBalance ? (
        <MessageCard
          variant="warning"
          icon={<AlertTriangle className="size-6" />}
          title="Insufficient balance"
          className="xl:min-w-none"
          description="You'll need to hold USDC in your connected wallet to complete the renewal."
        />
      ) : (
        <PaymentTokenList
          tokenData={tokenData}
          selectedToken={selectedToken?.address}
          isRegistering={false}
          onSelect={handleSelect}
        />
      )}
    </>
  )
}
