import { ERC20_ABI } from '@ens-apps/transaction-manager/contracts/abis/ERC20.abi'
import { useQueries } from '@tanstack/react-query'
import { Fragment, useState } from 'react'
import type { Address } from 'viem'
import { formatUnits } from 'viem'
import { useConnection, useReadContracts } from 'wagmi'
import { DAIcon } from '@/assets/dai-icon'
import { USDCIcon } from '@/assets/usdc-icon'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getRegistrationPriceQueryOptions } from '@/features/register/hooks/useRegistrationPrice'
import { formatTotalWithGas } from '@/features/register/utils/registrationPrice'
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
]

export const PaymentTokenSection = ({
  name,
  duration,
  onConfirm,
  onConnectWallet,
  isConnected,
}: PaymentTokenSectionProps) => {
  const { address } = useConnection()
  const [selectedToken, setSelectedToken] = useState<Address | null>(null)

  const { data: balances = [], isLoading: isLoadingBalances } =
    useReadContracts({
      contracts: PAYMENT_TOKENS.map((token) => ({
        address: token.address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        chainId: sepoliaWithEns.id,
      })),
      query: { enabled: Boolean(address) },
    })

  const priceQueries = useQueries({
    queries: PAYMENT_TOKENS.map((token) =>
      getRegistrationPriceQueryOptions({
        name,
        duration,
        token: token.address,
      }),
    ),
  })

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

  const isPriceLoading =
    priceQueries[0].isLoading || priceQueries[1].isLoading || isLoadingBalances

  const noSupportedTokenHasSufficientBalance =
    !isPriceLoading &&
    tokenData.every((token) => token.balance < token.price.total)

  const handleBuyName = () => {
    if (selectedToken && selectedTokenData) {
      onConfirm(selectedToken, selectedTokenData.price.total)
    }
  }

  const isRegisterDisabled =
    !selectedToken || isPriceLoading || !address || !selectedTokenData

  if (!isConnected) {
    return (
      <div>
        <Button
          className="w-full h-12"
          onClick={onConnectWallet}
          disabled={typeof onConnectWallet !== 'function'}
          type="button"
        >
          {typeof onConnectWallet === 'function'
            ? 'Connect Wallet'
            : 'Wallet not connected'}
        </Button>
      </div>
    )
  }

  return (
    <section
      className="border border-border rounded-lg bg-card p-5 space-y-4"
      aria-labelledby="payment-heading"
    >
      {noSupportedTokenHasSufficientBalance ? (
        <Alert variant="warning">
          <AlertTitle>Insufficient balance</AlertTitle>
          <AlertDescription>
            <p>
              We auto-fund wallets with USDC and DAI when you connect. If you
              just connected, please wait a moment and try again.
            </p>
          </AlertDescription>
        </Alert>
      ) : (
        <Fragment>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-medium">Select payment method</h2>
          </div>
          <div className="space-y-2">
            {tokenData.map((token) => {
              const hasSufficientBalance = token.balance >= token.price.total

              return (
                <button
                  key={token.symbol}
                  type="button"
                  onClick={() => setSelectedToken(token.address)}
                  disabled={!hasSufficientBalance}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg border p-4 text-left transition-colors',
                    selectedToken === token.address
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50',
                    !hasSufficientBalance && 'cursor-not-allowed opacity-60',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden">
                      <token.Icon className="size-8 min-w-0 shrink-0" />
                    </div>
                    <div>
                      <p className="font-medium">{token.symbol}</p>
                      <p className="text-muted-foreground text-sm">
                        {isPriceLoading ? (
                          <Skeleton className="h-4 w-20" />
                        ) : (
                          <>
                            Balance:{' '}
                            {Number(
                              formatUnits(token.balance, token.decimals),
                            ).toLocaleString()}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {isPriceLoading ? (
                      <Skeleton className="h-5 w-14" />
                    ) : (
                      <>
                        <p className="font-medium">
                          {formatTotalWithGas(
                            token.price.base,
                            token.price.premium,
                            token.price.decimals,
                          )}{' '}
                          USD
                        </p>
                        <p className="text-muted-foreground text-xs">
                          incl. est. gas & network fee
                        </p>
                        {!hasSufficientBalance && (
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
        </Fragment>
      )}

      <Button
        className="w-full h-12"
        onClick={handleBuyName}
        disabled={isRegisterDisabled}
      >
        {selectedTokenData?.symbol
          ? `Register with ${selectedTokenData.symbol}`
          : 'Select a token'}
      </Button>
    </section>
  )
}
