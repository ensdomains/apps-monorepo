import { ERC20_ABI } from '@ens-apps/transaction-manager/contracts/abis/ERC20.abi'
import { useQueries } from '@tanstack/react-query'
import { useState } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { formatUnits } from 'viem'
import { useConnection, useReadContracts } from 'wagmi'
import { DAIcon } from '@/assets/dai-icon'
import { USDCIcon } from '@/assets/usdc-icon'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { getRegistrationPriceQueryOptions } from '@/features/register/hooks/useRegistrationPrice'
import {
  EST_GAS_USD,
  formatTotalWithGas,
} from '@/features/register/utils/registrationPrice'
import { buildTokenData } from '@/features/register/utils/tokenData'
import {
  DAI_DECIMALS,
  SUPPORTED_TOKENS,
  USDC_DECIMALS,
} from '@/lib/constants/tokens'
import { cn } from '@/lib/utils'
import { sepoliaWithEns } from '@/lib/wagmi'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'

type PaymentModalStep = 'select_token' | 'confirm_purchase'

type PaymentTokenModalProps = {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly name: string
  readonly duration: number
  readonly onConfirm: (selectedToken: Address, tokenPrice: bigint) => void
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

export const PaymentTokenModal = ({
  open,
  onOpenChange,
  name,
  duration,
  onConfirm,
}: PaymentTokenModalProps) => {
  const { address } = useConnection()
  const [selectedToken, setSelectedToken] = useState<Address | null>(null)

  const [step, setStep] = useState<PaymentModalStep>('select_token')

  const { data: balances = [], isLoading: isLoadingBalances } =
    useReadContracts({
      contracts: PAYMENT_TOKENS.map((token) => ({
        address: token.address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        chainId: sepoliaWithEns.id,
      })),
      query: {
        enabled: Boolean(address),
        // App default staleTime is 1h; token balances must reflect chain state after funding.
        staleTime: 0,
        refetchOnMount: 'always',
      },
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

  const usdcPriceQuery = priceQueries[0]
  const daiPriceQuery = priceQueries[1]

  const [usdcBalance, daiBalance] = balances.map((balance) => {
    if (balance.status === 'success' && balance.result !== undefined) {
      return BigInt(balance.result)
    }

    return 0n
  })

  const tokenData = buildTokenData(
    PAYMENT_TOKENS,
    [usdcPriceQuery.data, daiPriceQuery.data],
    [usdcBalance, daiBalance],
  )

  const selectedTokenData = selectedToken
    ? tokenData.find((t) => t.address === selectedToken)
    : null

  const isPriceLoading =
    usdcPriceQuery.isLoading || daiPriceQuery.isLoading || isLoadingBalances

  const noSupportedTokenHasSufficientBalance =
    !isPriceLoading &&
    tokenData.every((token) => token.balance < token.price.total)

  const resetState = () => {
    setSelectedToken(null)
    setStep('select_token')
  }

  const handleContinueToConfirm = () => {
    if (selectedToken) {
      setStep('confirm_purchase')
    }
  }

  const handleBuyName = () => {
    if (selectedToken && selectedTokenData) {
      onConfirm(selectedToken, selectedTokenData.price.total)
      onOpenChange(false)
      resetState()
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) resetState()
    onOpenChange(newOpen)
  }

  const isContinueDisabled = !selectedToken || isPriceLoading || !address

  const currentContent = match(step)
    .with('select_token', () => (
      <>
        {noSupportedTokenHasSufficientBalance ? (
          <Alert variant="warning" className="mb-4">
            <AlertTitle>Insufficient balance</AlertTitle>
            <AlertDescription>
              <p>
                We auto-fund wallets with USDC and DAI when you connect. If you
                just connected, please wait a moment and try again.
              </p>
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="flex items-center gap-2">
          <p className="text-muted-foreground text-sm">
            Choose USDC or DAI to pay for your registration.
          </p>
          <div className="flex items-center gap-1">
            <USDCIcon className="size-5" />
            <DAIcon className="size-5" />
          </div>
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
                          EST_GAS_USD,
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

        <Button
          className="w-full"
          onClick={handleContinueToConfirm}
          disabled={isContinueDisabled}
        >
          {selectedTokenData?.symbol
            ? `Continue with ${selectedTokenData.symbol}`
            : 'Select a token'}
        </Button>
      </>
    ))
    .with('confirm_purchase', () =>
      selectedTokenData ? (
        <div className="flex min-h-[320px] flex-col justify-between gap-6">
          <div className="flex flex-col items-center gap-6">
            <div className="flex w-full min-w-0 flex-col items-center gap-4 rounded-xl bg-muted/50 px-6 py-8">
              <span
                className="w-full min-w-0 text-center font-medium text-2xl leading-tight tracking-tight"
                title={name}
              >
                {name}
              </span>
            </div>

            <div className="flex flex-col items-center gap-1">
              <span className="text-muted-foreground text-sm">Est. total</span>
              <div className="flex items-baseline gap-1">
                <selectedTokenData.Icon className="size-6 shrink-0" />
                <span className="font-medium text-2xl tracking-tight">
                  {formatTotalWithGas(
                    selectedTokenData.price.base,
                    selectedTokenData.price.premium,
                    EST_GAS_USD,
                    selectedTokenData.price.decimals,
                  )}
                </span>
                <span className="text-muted-foreground text-lg">USD</span>
              </div>
            </div>

            <dl className="w-full space-y-2 border-t border-border pt-4">
              <div className="flex items-center justify-between text-sm">
                <dt className="text-muted-foreground">Est. gas cost</dt>
                <dd className="font-mono">~{formatUsd(EST_GAS_USD)}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2 font-medium">
                <dt>Est. total</dt>
                <dd className="font-mono">
                  {formatTotalWithGas(
                    selectedTokenData.price.base,
                    selectedTokenData.price.premium,
                    EST_GAS_USD,
                    selectedTokenData.price.decimals,
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              className="h-12 w-full mt-8"
              onClick={handleBuyName}
              disabled={!selectedToken}
            >
              Buy name
            </Button>
          </div>
        </div>
      ) : null,
    )
    .exhaustive()

  const stepTitle = match(step)
    .with('select_token', () => 'Select payment token')
    .with('confirm_purchase', () => 'Confirm purchase')
    .exhaustive()

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{stepTitle}</DialogTitle>
        </DialogHeader>
        {currentContent}
      </DialogContent>
    </Dialog>
  )
}
