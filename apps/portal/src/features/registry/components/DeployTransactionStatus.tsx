import { CheckCircle } from 'lucide-react'
import type { ReactElement } from 'react'
import type { Hash } from 'viem'
import { CopyableRecord } from '@/components/CopyableRecord'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { getTransactionErrorInfo } from '@/features/registry/utils/transactionErrorMessage'
import { TransactionErrorAlert } from '@/features/transactions/components/TransactionErrorAlert'
import { cn } from '@/lib/utils'

interface DeployTransactionStatusProps {
  readonly txHash: Hash | undefined
  readonly isConfirming: boolean
  readonly isConfirmed: boolean
  readonly txError: unknown | null
  readonly pendingTitle?: string
  readonly successTitle?: string
  readonly pendingDescription?: string
  readonly successDescription?: string
  readonly txHashLabel?: string
}

export const DeployTransactionStatus = ({
  txHash,
  isConfirming,
  isConfirmed,
  txError,
  pendingTitle = 'Deploying Subregistry',
  successTitle = 'Subregistry Deployed',
  pendingDescription = 'Waiting for confirmation...',
  successDescription = 'Deploy transaction confirmed!',
  txHashLabel = 'Deploy tx hash:',
}: DeployTransactionStatusProps): ReactElement | null => {
  if (txError) {
    const { summary, details } = getTransactionErrorInfo(txError)
    return (
      <TransactionErrorAlert
        title="Transaction Failed"
        summary={summary}
        details={details}
        txHash={txHash}
        txHashLabel={txHashLabel}
      />
    )
  }

  if (!txHash) {
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
          isConfirming && 'animate-pulse',
          isConfirmed && 'text-green-600',
        )}
      />
      <AlertTitle>{isConfirming ? pendingTitle : successTitle}</AlertTitle>
      <AlertDescription className="break-all whitespace-normal max-w-full overflow-wrap-anywhere">
        <div className="flex flex-col gap-2">
          <span>{isConfirming ? pendingDescription : successDescription}</span>
          {txHash && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                {txHashLabel}
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
