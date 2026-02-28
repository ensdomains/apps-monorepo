import { CheckCircle } from 'lucide-react'
import type { ReactElement } from 'react'
import { match, P } from 'ts-pattern'
import { CopyableRecord } from '@/components/CopyableRecord'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { getTransactionErrorInfo } from '@/features/registry/utils/transactionErrorMessage'
import { TransactionErrorAlert } from '@/features/transactions/components/TransactionErrorAlert'
import type { TransactionStatusProps } from '@/lib/types/transaction'
import { cn } from '@/lib/utils'

interface SetSubregistryTransactionStatusProps extends TransactionStatusProps {
  readonly isSettingSubregistry: boolean
}

export const SetSubregistryTransactionStatus = ({
  txHash,
  isSettingSubregistry,
  isConfirming,
  isConfirmed,
  isReverted,
  txError,
  receiptError,
}: SetSubregistryTransactionStatusProps): ReactElement | null => {
  const hasError = txError || receiptError || isReverted

  if (hasError) {
    const errorInfo = match({ txError, receiptError })
      .with({ txError: P.not(P.nullish) }, ({ txError }) =>
        getTransactionErrorInfo(txError),
      )
      .with({ receiptError: P.not(P.nullish) }, ({ receiptError }) =>
        getTransactionErrorInfo(receiptError),
      )
      .otherwise(() => null)
    return (
      <TransactionErrorAlert
        title="Set Subregistry Failed"
        summary={
          errorInfo?.summary ||
          'Transaction reverted - you may not have permission to set the subregistry on this registry.'
        }
        details={errorInfo?.details}
        txHash={txHash}
      />
    )
  }

  if (!isSettingSubregistry && !txHash) {
    return null
  }

  return (
    <Alert
      className={cn(
        'max-w-full',
        isConfirmed && 'border-green-500 bg-green-50 dark:bg-green-950/20',
      )}
    >
      <CheckCircle
        className={cn(
          (isSettingSubregistry || isConfirming) && 'animate-pulse',
          isConfirmed && 'text-green-600',
        )}
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
