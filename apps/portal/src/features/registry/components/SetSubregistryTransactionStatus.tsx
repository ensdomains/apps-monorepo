import { AlertCircle, CheckCircle } from 'lucide-react'
import type { Hash } from 'viem'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface SetSubregistryTransactionStatusProps {
  txHash: Hash | undefined
  isSettingSubregistry: boolean
  isConfirming: boolean
  isConfirmed: boolean
  isReverted: boolean
  txError: string | null
  receiptError: string | null
}

export const SetSubregistryTransactionStatus = ({
  txHash,
  isSettingSubregistry,
  isConfirming,
  isConfirmed,
  isReverted,
  txError,
  receiptError,
}: SetSubregistryTransactionStatusProps) => {
  const hasError = txError || receiptError || isReverted

  if (hasError) {
    return (
      <Alert variant="destructive" className="max-w-full">
        <AlertCircle />
        <AlertTitle>Set Subregistry Failed</AlertTitle>
        <AlertDescription className="break-all whitespace-normal max-w-full overflow-wrap-anywhere">
          <div className="flex flex-col gap-2">
            <span>
              {txError ||
                receiptError ||
                'Transaction reverted - you may not have permission to set the subregistry on this registry.'}
            </span>
            {txHash && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Tx hash:</span>
                <CopyableRecord
                  value={txHash}
                  href={`https://sepolia.etherscan.io/tx/${txHash}`}
                  className="text-xs"
                  truncate={false}
                />
              </div>
            )}
          </div>
        </AlertDescription>
      </Alert>
    )
  }

  if (!isSettingSubregistry && !txHash) {
    return null
  }

  return (
    <Alert className="max-w-full">
      <CheckCircle
        className={isSettingSubregistry || isConfirming ? 'animate-pulse' : ''}
      />
      <AlertTitle>
        {isSettingSubregistry
          ? 'Setting Subregistry'
          : isConfirming
            ? 'Confirming...'
            : isConfirmed
              ? 'Subregistry Set'
              : 'Setting Subregistry'}
      </AlertTitle>
      <AlertDescription className="break-all whitespace-normal max-w-full overflow-wrap-anywhere">
        <div className="flex flex-col gap-2">
          <span>
            {isSettingSubregistry
              ? 'Please confirm the transaction in your wallet...'
              : isConfirming
                ? 'Waiting for confirmation...'
                : isConfirmed
                  ? 'Subregistry successfully set!'
                  : 'Processing...'}
          </span>
          {txHash && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                Set subregistry tx hash:
              </span>
              <CopyableRecord
                value={txHash}
                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                className="text-xs"
                truncate={false}
              />
            </div>
          )}
        </div>
      </AlertDescription>
    </Alert>
  )
}
