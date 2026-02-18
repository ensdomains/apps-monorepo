import { ERC20_ABI } from '@ens-apps/transaction-manager/contracts/abis/ERC20.abi'
import { useQueries } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
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
import {
  getRegistrationPriceQueryOptions,
  type RegistrationPriceResult,
} from '@/features/register/hooks/useRegistrationPrice'
import { SUPPORTED_TOKENS } from '@/lib/constants/tokens'
import { cn } from '@/lib/utils'

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

function isPriceResult(value: unknown): value is RegistrationPriceResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'base' in value &&
    'total' in value &&
    'totalRaw' in value
  )
}

type PaymentTokenModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  duration: number
  onConfirm: (selectedToken: Address) => void
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

  const handleConfirm = () => {
    if (selectedToken && hasSufficientBalance) {
      onConfirm(selectedToken)
      onOpenChange(false)
      setSelectedToken(null)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) setSelectedToken(null)
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select payment token</DialogTitle>
        </DialogHeader>

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
                  <div className="flex size-10 shrink-0 items-center justify-center">
                    <token.Icon className="size-8" />
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
          onClick={handleConfirm}
          disabled={
            !selectedToken ||
            !hasSufficientBalance ||
            isPriceLoading ||
            !address
          }
        >
          {selectedToken
            ? `Continue with ${selectedTokenData?.symbol ?? ''}`
            : 'Select a token'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
