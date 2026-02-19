import { ERC20_ABI } from '@ens-apps/transaction-manager/contracts/abis/ERC20.abi'
import { useQueries } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { formatUnits } from 'viem'
import { useConnection, useReadContract } from 'wagmi'
import { DAIcon } from '@/assets/dai-icon'
import { USDCIcon } from '@/assets/usdc-icon'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { getRegistrationPriceQueryOptions } from '@/features/register/hooks/useRegistrationPrice'
import { isPriceResult } from '@/features/register/utils/registrationPrice'
import { SUPPORTED_TOKENS } from '@/lib/constants/tokens'
import { cn } from '@/lib/utils'

enum PaymentModalStep {
  SelectToken = 'select_token',
  ConfirmPurchase = 'confirm_purchase',
}

const PAYMENT_TOKENS = [
  {
    symbol: 'USDC',
    address: SUPPORTED_TOKENS.USDC,
    decimals: 6,
    Icon: USDCIcon,
  },
  {
    symbol: 'DAI',
    address: SUPPORTED_TOKENS.DAI,
    decimals: 18,
    Icon: DAIcon,
  },
] as const

type PaymentTokenModalProps = {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly name: string
  readonly duration: number
  readonly onConfirm: (selectedToken: Address, tokenPrice: bigint) => void
}

export const PaymentTokenModal = ({
  open,
  onOpenChange,
  name,
  duration,
  onConfirm,
}: PaymentTokenModalProps) => {
  const { address } = useConnection()
  const [selectedToken, setSelectedToken] = useState<Address | null>(null)
  const [step, setStep] = useState<PaymentModalStep>(
    PaymentModalStep.SelectToken,
  )

  const priceQueries = useQueries({
    queries: PAYMENT_TOKENS.map((token) =>
      getRegistrationPriceQueryOptions({
        name,
        durationYears: duration,
        token: token.address,
      }),
    ),
  })

  const usdcPriceQuery = priceQueries[0]
  const daiPriceQuery = priceQueries[1]

  const { data: usdcBalance } = useReadContract({
    address: SUPPORTED_TOKENS.USDC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) && open },
  })

  const { data: daiBalance } = useReadContract({
    address: SUPPORTED_TOKENS.DAI,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) && open },
  })

  const tokenData = useMemo(() => {
    const usdcPrice = usdcPriceQuery.data
    const daiPrice = daiPriceQuery.data

    const defaultPrice = {
      total: '$0',
      totalRaw: 0n,
      base: '$0',
      premium: '$0',
      hasPremium: false,
    }

    return [
      {
        ...PAYMENT_TOKENS[0],
        price: usdcPrice && isPriceResult(usdcPrice) ? usdcPrice : defaultPrice,
        balance: typeof usdcBalance === 'bigint' ? usdcBalance : 0n,
      },
      {
        ...PAYMENT_TOKENS[1],
        price: daiPrice && isPriceResult(daiPrice) ? daiPrice : defaultPrice,
        balance: typeof daiBalance === 'bigint' ? daiBalance : 0n,
      },
    ]
  }, [usdcPriceQuery.data, daiPriceQuery.data, usdcBalance, daiBalance])

  const selectedTokenData = selectedToken
    ? tokenData.find((t) => t.address === selectedToken)
    : null

  const hasSufficientBalance =
    selectedTokenData &&
    selectedTokenData.balance >= selectedTokenData.price.totalRaw

  const isPriceLoading = usdcPriceQuery.isLoading || daiPriceQuery.isLoading

  const handleContinueToConfirm = () => {
    if (selectedToken && hasSufficientBalance) {
      setStep(PaymentModalStep.ConfirmPurchase)
    }
  }

  const handleBuyName = () => {
    if (selectedToken && hasSufficientBalance && selectedTokenData) {
      onConfirm(selectedToken, selectedTokenData.price.totalRaw)
      onOpenChange(false)
      setSelectedToken(null)
      setStep(PaymentModalStep.SelectToken)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedToken(null)
      setStep(PaymentModalStep.SelectToken)
    }
    onOpenChange(newOpen)
  }

  const isContinueDisabled =
    !selectedToken || !hasSufficientBalance || isPriceLoading || !address

  const currentContent = match(step)
    .with(PaymentModalStep.SelectToken, () => (
      <>
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
            const priceReady = token.price && isPriceResult(token.price)
            const hasInsufficient = Boolean(
              priceReady && token.balance < token.price.totalRaw,
            )

            return (
              <button
                key={token.symbol}
                type="button"
                onClick={() => setSelectedToken(token.address)}
                disabled={hasInsufficient}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg border p-4 text-left transition-colors',
                  selectedToken === token.address
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted/50',
                  hasInsufficient && 'cursor-not-allowed opacity-60',
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden">
                    <token.Icon className="size-8 min-w-0 shrink-0" />
                  </div>
                  <div>
                    <p className="font-medium">{token.symbol}</p>
                    <p className="text-muted-foreground text-sm">
                      {priceReady ? (
                        <>
                          Balance:{' '}
                          {Number(
                            formatUnits(token.balance, token.decimals),
                          ).toLocaleString()}
                        </>
                      ) : (
                        <Skeleton className="h-4 w-20" />
                      )}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {priceReady ? (
                    <>
                      <p className="font-medium">{token.price.total} USD</p>
                      {hasInsufficient && (
                        <p className="text-destructive text-xs">
                          Insufficient balance
                        </p>
                      )}
                    </>
                  ) : (
                    <Skeleton className="h-5 w-14" />
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
    .with(PaymentModalStep.ConfirmPurchase, () =>
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
              <span className="text-muted-foreground text-sm">for</span>
              <div className="flex items-baseline gap-1">
                <selectedTokenData.Icon className="size-6 shrink-0" />
                <span className="font-medium text-2xl tracking-tight">
                  {selectedTokenData.price.total}
                </span>
                <span className="text-muted-foreground text-lg">
                  {selectedTokenData.symbol}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              className="h-12 w-full mt-8"
              onClick={handleBuyName}
              disabled={!selectedToken || !hasSufficientBalance}
            >
              Buy name
            </Button>
          </div>
        </div>
      ) : null,
    )
    .exhaustive()

  const stepTitle = match(step)
    .with(PaymentModalStep.SelectToken, () => 'Select payment token')
    .with(PaymentModalStep.ConfirmPurchase, () => 'Confirm purchase')
    .exhaustive()

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{stepTitle}</DialogTitle>
        </DialogHeader>
        {currentContent}
      </DialogContent>
    </Dialog>
  )
}
