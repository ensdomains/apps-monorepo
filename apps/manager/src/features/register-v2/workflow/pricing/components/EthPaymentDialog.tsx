import { Trans } from '@lingui/react/macro'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { type Address, formatUnits } from 'viem'
import ethereumIcon from '@/assets/icons/ethereum-color.svg'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatEthQuote, getEthSwapQuote } from '../../../service/ethPayment'
import {
  executeEthPayment,
  hasPendingEthPayment,
} from '../../../service/executeEthPayment'

const actionLabel = (
  isPending: boolean,
  canContinue: boolean,
  hasPendingSwap: boolean,
) => {
  if (isPending) return <Trans>Swapping ETH…</Trans>
  if (canContinue) return <Trans>Continue to registration</Trans>
  if (hasPendingSwap) return <Trans>Confirm previous ETH swap</Trans>
  return <Trans>Swap ETH and continue</Trans>
}

const canSubmit = ({
  owner,
  isLoadingAmount,
  isReady,
  amountError,
  hasPendingSwap,
  quoteError,
  isPending,
}: {
  owner: Address | null
  isLoadingAmount: boolean
  isReady: boolean
  amountError?: string
  hasPendingSwap: boolean
  quoteError: Error | null
  isPending: boolean
}) =>
  !!owner &&
  !isLoadingAmount &&
  isReady &&
  !amountError &&
  (hasPendingSwap || !quoteError) &&
  !isPending

export const EthPaymentDialog = ({
  open,
  onOpenChange,
  onFunded,
  owner,
  amountOut,
  isLoadingAmount,
  amountError,
  onRetryAmount,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onFunded: () => void
  readonly owner: Address | null
  readonly amountOut: bigint | undefined
  readonly isLoadingAmount: boolean
  readonly amountError?: string
  readonly onRetryAmount: () => void
}) => {
  const queryClient = useQueryClient()
  const isSubmitting = useRef(false)
  const hasPendingSwap = owner !== null && hasPendingEthPayment(owner)
  const quote = useQuery({
    queryKey: ['eth-payment-quote', amountOut?.toString()],
    queryFn: () => getEthSwapQuote(amountOut ?? 0n),
    enabled:
      open &&
      owner !== null &&
      amountOut !== undefined &&
      amountOut > 0n &&
      !hasPendingSwap,
    refetchInterval: 20_000,
    staleTime: 15_000,
    retry: false,
  })
  const payment = useMutation({
    mutationFn: () => {
      if (!owner || amountOut === undefined) {
        throw new Error('The connected wallet is unavailable')
      }
      return executeEthPayment(owner, amountOut, quote.data?.maximumEth)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [{ $scope: 'wallet', $action: 'stablecoinBalances' }],
      })
      onOpenChange(false)
      onFunded()
    },
    onSettled: () => {
      isSubmitting.current = false
    },
  })

  const canContinue = amountOut === 0n
  const isReady =
    canContinue || hasPendingSwap || (!!quote.data && !quote.isFetching)
  const error =
    payment.error ?? (hasPendingSwap ? null : quote.error) ?? amountError

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!payment.isPending) onOpenChange(nextOpen)
      }}
      open={open}
    >
      <DialogContent showCloseButton={!payment.isPending}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <img alt="" className="h-7 w-7" src={ethereumIcon} />
            <Trans>Pay with ETH</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              ENS collects USDC. Swap ETH for the exact amount needed, then
              approve the registration with your wallet. Unused ETH is refunded
              in the swap transaction.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        {amountOut !== undefined && (
          <p className="text-ens-gray text-sm">
            <Trans>USDC to fund:</Trans> {formatUnits(amountOut, 6)} USDC
          </p>
        )}
        {quote.data && amountOut !== 0n && (
          <p className="text-ens-gray text-sm">
            <Trans>Estimated swap:</Trans> {formatEthQuote(quote.data)}
          </p>
        )}
        {error && (
          <p className="text-ens-signal-danger-800 text-sm" role="alert">
            {error instanceof Error ? error.message : String(error)}
          </p>
        )}
        {error && !payment.isPending && (
          <Button
            className="w-full"
            onClick={() => {
              payment.reset()
              if (amountError) onRetryAmount()
              else void quote.refetch()
            }}
            type="button"
            variant="outline"
          >
            <Trans>Refresh quote</Trans>
          </Button>
        )}
        {canContinue && (
          <p className="text-ens-gray text-sm">
            <Trans>Your ENS account already has enough USDC to register.</Trans>
          </p>
        )}
        {hasPendingSwap && (
          <p className="text-ens-gray text-sm">
            <Trans>Your previous ETH swap is awaiting confirmation.</Trans>
          </p>
        )}
        <Button
          className="w-full"
          disabled={
            !canSubmit({
              owner,
              isLoadingAmount,
              isReady,
              amountError,
              hasPendingSwap,
              quoteError: quote.error,
              isPending: payment.isPending,
            })
          }
          onClick={() => {
            if (canContinue) {
              onOpenChange(false)
              onFunded()
            } else {
              if (isSubmitting.current) return
              isSubmitting.current = true
              payment.mutate()
            }
          }}
          type="button"
          variant="blue"
        >
          {actionLabel(payment.isPending, canContinue, hasPendingSwap)}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
