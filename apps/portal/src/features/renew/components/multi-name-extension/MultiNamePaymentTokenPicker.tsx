import { ERC20_ABI } from '@ens-apps/transaction-manager/contracts/abis/ERC20.abi'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { useQueries, useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import type { Address } from 'viem'
import { formatUnits } from 'viem'
import { useConfig, useConnection } from 'wagmi'
import { readContractsQueryOptions } from 'wagmi/query'
import { DAIcon } from '@/assets/dai-icon'
import { USDCIcon } from '@/assets/usdc-icon'
import { MessageCard } from '@/components/ui/message-card'
import { PAYMENT_TOKENS } from '@/features/register/constants/paymentTokens'
import { getRegistrationPriceQueryOptions } from '@/features/register/hooks/useRegistrationPrice'
import { isPriceResult } from '@/features/register/utils/registrationPrice'
import type { TokenWithPriceAndBalance } from '@/features/register/utils/tokenData'
import {
  DAI_DECIMALS,
  SUPPORTED_TOKENS,
  USDC_DECIMALS,
} from '@/lib/constants/tokens'
import { cn } from '@/lib/utils'
import { sepoliaWithEns } from '@/lib/wagmi'
import type { MultiRenewalEntry } from '../../hooks/useRenewalTransactions'

const ethRegistrar = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensEthRegistrar',
})

const Skeleton = () => (
  <div className="space-y-4">
    <div className="h-5 w-40 bg-quartz-100 animate-pulse rounded-md" />
    <div className="space-y-2">
      <div className="h-16 w-full bg-quartz-100 animate-pulse rounded-lg" />
      <div className="h-16 w-full bg-quartz-100 animate-pulse rounded-lg" />
    </div>
  </div>
)

type MultiNamePaymentTokenPickerProps = {
  readonly renewals: readonly MultiRenewalEntry[]
  readonly onSelectionChange: (token: TokenWithPriceAndBalance | null) => void
}

export const MultiNamePaymentTokenPicker = ({
  renewals,
  onSelectionChange,
}: MultiNamePaymentTokenPickerProps) => {
  const config = useConfig()
  const { address } = useConnection()
  const [selectedToken, setSelectedToken] = useState<Address | null>(null)
  const hasAddress = Boolean(address)

  const [balancesQuery] = useQueries({
    queries: [
      {
        ...readContractsQueryOptions(config, {
          contracts: PAYMENT_TOKENS.map((token) => ({
            address: token.address,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address as Address],
            chainId: sepoliaWithEns.id,
          })),
        }),
        enabled: hasAddress,
      },
    ],
  })

  const allowancesQuery = useQuery({
    ...readContractsQueryOptions(config, {
      contracts: PAYMENT_TOKENS.map((token) => ({
        address: token.address,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address as Address, ethRegistrar],
        chainId: sepoliaWithEns.id,
      })),
    }),
    enabled: hasAddress,
  })

  const usdcPriceQueries = useQueries({
    queries: renewals.map((renewal) => ({
      ...getRegistrationPriceQueryOptions({
        name: renewal.selectedName.name,
        duration: renewal.duration,
        token: SUPPORTED_TOKENS.USDC,
        owner: address,
      }),
      enabled: hasAddress,
    })),
  })

  const daiPriceQueries = useQueries({
    queries: renewals.map((renewal) => ({
      ...getRegistrationPriceQueryOptions({
        name: renewal.selectedName.name,
        duration: renewal.duration,
        token: SUPPORTED_TOKENS.DAI,
        owner: address,
      }),
      enabled: hasAddress,
    })),
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

  const allowances = (allowancesQuery.data ?? []).map((allowance) =>
    allowance.status === 'success' && allowance.result !== undefined
      ? BigInt(allowance.result)
      : 0n,
  )

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
      allowance: allowances[0] ?? 0n,
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
      allowance: allowances[1] ?? 0n,
    },
  ]

  const noSupportedTokenHasSufficientBalance = tokenData.every(
    (token) => token.balance < token.price.total,
  )

  const handleSelect = (token: TokenWithPriceAndBalance) => {
    setSelectedToken(token.address)
    onSelectionChange(token)
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
          {tokenData.map((token) => {
            const hasSufficientBalance = token.balance >= token.price.total

            return (
              <button
                key={token.symbol}
                type="button"
                onClick={() => handleSelect(token)}
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
