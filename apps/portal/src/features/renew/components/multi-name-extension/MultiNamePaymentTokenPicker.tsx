import { useQueries, useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { type Address, erc20Abi, formatUnits } from 'viem'
import { useConfig, useConnection } from 'wagmi'
import { readContractsQueryOptions } from 'wagmi/query'
import { MessageCard } from '@/components/ui/message-card'
import { PAYMENT_TOKENS } from '@/features/register/constants/paymentTokens'
import { getRenewalPriceQueryOptions } from '@/features/register/hooks/useRenewalPrice'
import { isPriceResult } from '@/features/register/utils/registrationPrice'
import type { TokenWithPriceAndBalance } from '@/features/register/utils/tokenData'
import {
  DAI_DECIMALS,
  SUPPORTED_TOKENS,
  USDC_DECIMALS,
} from '@/lib/constants/tokens'
import { cn } from '@/lib/utils'
import type {
  MultiRenewalEntry,
  RenewerPayment,
} from '../../hooks/useRenewalTransactions'
import { getRenewerAddress } from '../../utils/renewer'
import {
  computeRenewerPayments,
  distinctRenewers,
} from '../../utils/renewerPayments'

// The selected token plus its per-renewer approval breakdown. A mixed v1+v2
// batch yields two payments (ETHRenewerV1 + v2 ETHRegistrar); a same-kind batch
// yields one. Threaded up to seed the renewal flow's approval step(s).
export type MultiNameTokenSelection = {
  readonly token: TokenWithPriceAndBalance
  readonly payments: readonly RenewerPayment[]
}

const Skeleton = () => (
  <div className="space-y-4">
    <div className="h-5 w-40 bg-muted animate-pulse rounded-md" />
    <div className="space-y-2">
      <div className="h-16 w-full bg-muted animate-pulse rounded-lg" />
      <div className="h-16 w-full bg-muted animate-pulse rounded-lg" />
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
  const [selectedToken, setSelectedToken] = useState<Address | null>(null)
  const hasAddress = Boolean(address)

  // Distinct renewer contracts among the selected names — the ERC-20 spenders we
  // price against and read allowances for (one for a same-kind batch, two for a
  // mixed v1+v2 batch).
  const renewers = distinctRenewers(renewals)

  const [balancesQuery] = useQueries({
    queries: [
      {
        ...readContractsQueryOptions(config, {
          contracts: PAYMENT_TOKENS.map((token) => ({
            address: token.address,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [address as Address],
          })),
        }),
        enabled: hasAddress,
      },
    ],
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
          args: [address as Address, renewer],
        })),
      ),
    }),
    enabled: hasAddress && renewers.length > 0,
  })

  // Price each name against its own renewer so v1 names are quoted by
  // ETHRenewerV1 and v2 names by the v2 ETHRegistrar.
  const usdcPriceQueries = useQueries({
    queries: renewals.map((renewal) =>
      getRenewalPriceQueryOptions({
        name: renewal.selectedName.name,
        duration: renewal.duration,
        token: SUPPORTED_TOKENS.USDC,
        renewerAddress: getRenewerAddress(renewal.selectedName.isV2),
      }),
    ),
  })

  const daiPriceQueries = useQueries({
    queries: renewals.map((renewal) =>
      getRenewalPriceQueryOptions({
        name: renewal.selectedName.name,
        duration: renewal.duration,
        token: SUPPORTED_TOKENS.DAI,
        renewerAddress: getRenewerAddress(renewal.selectedName.isV2),
      }),
    ),
  })

  const isLoading =
    balancesQuery.isLoading ||
    allowancesQuery.isLoading ||
    usdcPriceQueries.some((q) => q.isLoading) ||
    daiPriceQueries.some((q) => q.isLoading)

  if (isLoading) return <Skeleton />

  const rawBalances = balancesQuery.data
  const balances = Array.isArray(rawBalances)
    ? rawBalances.map((balance) =>
        balance.status === 'success' && balance.result !== undefined
          ? BigInt(balance.result)
          : 0n,
      )
    : []

  const allowanceResults = (allowancesQuery.data ?? []).map((allowance) =>
    allowance.status === 'success' && allowance.result !== undefined
      ? BigInt(allowance.result)
      : 0n,
  )

  const allowanceFor = (tokenIndex: number, renewerIndex: number): bigint =>
    allowanceResults[tokenIndex * renewers.length + renewerIndex] ?? 0n

  const sumPrice = (queries: typeof usdcPriceQueries) =>
    queries.reduce(
      (sum, q) => {
        if (!q.data || !isPriceResult(q.data)) return sum
        return {
          base: sum.base + q.data.base,
          premium: sum.premium + q.data.premium,
          total: sum.total + q.data.total,
        }
      },
      { base: 0n, premium: 0n, total: 0n },
    )

  const usdcPrice = sumPrice(usdcPriceQueries)
  const daiPrice = sumPrice(daiPriceQueries)

  // Per-renewer approval breakdown for a token: group each name's charge by its
  // renewer, then attach that renewer's current allowance (by position in the
  // `renewers` list, matching the flattened allowance reads above).
  const buildPayments = (
    queries: typeof usdcPriceQueries,
    tokenIndex: number,
  ) =>
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

  const paymentsByToken: readonly (readonly RenewerPayment[])[] = [
    buildPayments(usdcPriceQueries, 0),
    buildPayments(daiPriceQueries, 1),
  ]

  const tokenData: TokenWithPriceAndBalance[] = [
    {
      ...PAYMENT_TOKENS[0],
      price: {
        base: usdcPrice.base,
        premium: usdcPrice.premium,
        total: usdcPrice.total,
        decimals: USDC_DECIMALS,
        hasPremium: usdcPrice.premium > 0n,
      },
      balance: balances[0] ?? 0n,
      // Per-renewer allowances live in paymentsByToken; this aggregate field is
      // unused by the multi-renew flow (kept to satisfy the token type).
      allowance: 0n,
    },
    {
      ...PAYMENT_TOKENS[1],
      price: {
        base: daiPrice.base,
        premium: daiPrice.premium,
        total: daiPrice.total,
        decimals: DAI_DECIMALS,
        hasPremium: daiPrice.premium > 0n,
      },
      balance: balances[1] ?? 0n,
      allowance: 0n,
    },
  ]

  const noSupportedTokenHasSufficientBalance = tokenData.every(
    (token) => token.balance < token.price.total,
  )

  const handleSelect = (token: TokenWithPriceAndBalance, index: number) => {
    setSelectedToken(token.address)
    onSelectionChange({ token, payments: paymentsByToken[index] })
  }

  return (
    <>
      <h2 className="text-base font-medium">Select payment method</h2>
      {noSupportedTokenHasSufficientBalance ? (
        <MessageCard
          variant="warning"
          icon={<AlertTriangle className="size-6" />}
          title="Insufficient balance"
          className="xl:min-w-none"
          titleClassName="text-base text-inherit font-medium"
          descriptionClassName="text-sm text-inherit"
          description="You'll need to hold USDC or DAI in your connected wallet to complete the renewal."
        />
      ) : (
        <div className="space-y-2">
          {tokenData.map((token, index) => {
            const hasSufficientBalance = token.balance >= token.price.total

            return (
              <button
                key={token.symbol}
                type="button"
                onClick={() => handleSelect(token, index)}
                disabled={!hasSufficientBalance}
                className={cn(
                  'flex w-full cursor-pointer items-center justify-between rounded-lg border border-border p-4 text-left transition-colors',
                  selectedToken === token.address
                    ? 'bg-muted'
                    : 'hover:bg-muted/30',
                  !hasSufficientBalance && 'cursor-not-allowed opacity-60',
                )}
              >
                <div className="flex items-center gap-1">
                  <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden">
                    <token.Icon className="size-8 min-w-0 shrink-0" />
                  </div>
                  <p className="font-medium">{token.symbol}</p>
                </div>
                <div className="text-right">
                  <p className="font-normal">
                    {Number(
                      formatUnits(token.balance, token.decimals),
                    ).toLocaleString()}
                  </p>
                  {hasSufficientBalance ? (
                    <p className="text-muted-foreground text-xs">available</p>
                  ) : (
                    <p className="text-destructive text-xs">
                      Insufficient balance
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
