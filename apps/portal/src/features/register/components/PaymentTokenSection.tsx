import { ERC20_ABI } from '@ens-apps/transaction-manager/contracts/abis/ERC20.abi'
import { useQueries } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import type { Address } from 'viem'
import { formatUnits } from 'viem'
import { useConfig, useConnection } from 'wagmi'
import { readContractsQueryOptions } from 'wagmi/query'
import { DAIcon } from '@/assets/dai-icon'
import { USDCIcon } from '@/assets/usdc-icon'
import { Button } from '@/components/ui/button'
import { MessageCard } from '@/components/ui/message-card'
import { Skeleton } from '@/components/ui/skeleton'
import { getRegistrationPriceQueryOptions } from '@/features/register/hooks/useRegistrationPrice'
import { buildTokenData } from '@/features/register/utils/tokenData'
import {
  DAI_DECIMALS,
  SUPPORTED_TOKENS,
  USDC_DECIMALS,
} from '@/lib/constants/tokens'
import { cn } from '@/lib/utils'
import { sepoliaWithEns } from '@/lib/wagmi'

type PaymentTokenSectionProps = {
  readonly name: string
  readonly duration: number
  readonly onConfirm: (selectedToken: Address, tokenPrice: bigint) => void
  readonly onConnectWallet?: () => void
  readonly isConnected: boolean
  readonly isRegistering?: boolean
}

const PAYMENT_TOKENS = [
  {
    symbol: 'USDC' as const,
    address: SUPPORTED_TOKENS.USDC,
    decimals: USDC_DECIMALS,
    Icon: USDCIcon,
  },
  {
    symbol: 'DAI' as const,
    address: SUPPORTED_TOKENS.DAI,
    decimals: DAI_DECIMALS,
    Icon: DAIcon,
  },
] as const

export const PaymentTokenSection = ({
  name,
  duration,
  onConfirm,
  onConnectWallet,
  isConnected,
  isRegistering = false,
}: PaymentTokenSectionProps) => {
  const config = useConfig()
  const { address } = useConnection()
  const [selectedToken, setSelectedToken] = useState<Address | null>(null)

  const [balancesQuery, ...priceQueries] = useQueries({
    queries: [
      {
        ...readContractsQueryOptions(config, {
          contracts: PAYMENT_TOKENS.map((token) => ({
            address: token.address,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: address ? [address] : undefined,
            chainId: sepoliaWithEns.id,
          })),
        }),
        enabled: Boolean(address),
      },
      getRegistrationPriceQueryOptions({
        name,
        duration,
        token: PAYMENT_TOKENS[0].address,
        owner: address,
      }),
      getRegistrationPriceQueryOptions({
        name,
        duration,
        token: PAYMENT_TOKENS[1].address,
        owner: address,
      }),
    ],
  })

  const balances = balancesQuery.data ?? []

  const [usdcBalance, daiBalance] = balances.map((balance) => {
    if (balance.status === 'success' && balance.result !== undefined) {
      return BigInt(balance.result)
    }
    return 0n
  })

  const tokenData = buildTokenData(
    PAYMENT_TOKENS,
    [priceQueries[0].data, priceQueries[1].data],
    [usdcBalance, daiBalance],
  )

  const selectedTokenData = selectedToken
    ? tokenData.find((t) => t.address === selectedToken)
    : null

  const selectedTokenIndex = selectedToken
    ? PAYMENT_TOKENS.findIndex((t) => t.address === selectedToken)
    : -1

  const noSupportedTokenHasSufficientBalance =
    priceQueries.every((q) => !q.isLoading) &&
    !balancesQuery.isLoading &&
    tokenData.every((token) => token.balance < token.price.total)

  const handleBuyName = () => {
    if (selectedToken && selectedTokenData) {
      onConfirm(selectedToken, selectedTokenData.price.total)
    }
  }

  const isRegisterDisabled =
    !selectedToken ||
    selectedTokenIndex === -1 ||
    priceQueries[selectedTokenIndex]?.isLoading ||
    balancesQuery.isLoading ||
    !address ||
    !selectedTokenData

  if (!isConnected) {
    return (
      <Button
        className="w-full max-w-xs mx-auto"
        onClick={onConnectWallet}
        disabled={typeof onConnectWallet !== 'function'}
        type="button"
      >
        {typeof onConnectWallet === 'function'
          ? 'Connect to register'
          : 'Wallet not connected'}
      </Button>
    )
  }

  return (
    <section
      className="border border-border rounded-lg bg-card p-5 space-y-4"
      aria-labelledby="payment-heading"
    >
      <h2 id="payment-heading" className="text-base font-medium">
        Select payment method
      </h2>
      {noSupportedTokenHasSufficientBalance ? (
        <MessageCard
          variant="warning"
          icon={<AlertTriangle className="size-6" />}
          title="Insufficient balance"
          className="xl:min-w-none"
          titleClassName="text-base text-inherit font-medium"
          descriptionClassName="text-sm text-inherit"
          description="You'll need to hold USDC or DAI in your connected wallet in order to complete the registration of your ENS name."
        />
      ) : (
        <div className="space-y-2">
          {tokenData.map((token, index) => {
            const isTokenLoading =
              priceQueries[index].isLoading || balancesQuery.isLoading
            const hasSufficientBalance = token.balance >= token.price.total

            return (
              <button
                key={token.symbol}
                type="button"
                onClick={() => setSelectedToken(token.address)}
                disabled={!hasSufficientBalance || isRegistering}
                className={cn(
                  'flex w-full cursor-pointer items-center justify-between rounded-lg border-border border p-4 text-left transition-colors',
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
                  {isTokenLoading ? (
                    <Skeleton className="h-5 w-14" />
                  ) : (
                    <>
                      <p className="font-normal">
                        {Number(
                          formatUnits(token.balance, token.decimals),
                        ).toLocaleString()}
                      </p>

                      {hasSufficientBalance ? (
                        <p className="text-muted-foreground text-xs">
                          available
                        </p>
                      ) : (
                        <p className="text-destructive text-xs">
                          Insufficient balance
                        </p>
                      )}
                    </>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      <Button
        className="w-full"
        onClick={handleBuyName}
        disabled={isRegisterDisabled}
        variant={'secondary'}
      >
        {isRegistering ? 'Registering...' : 'Register'}
      </Button>
    </section>
  )
}
