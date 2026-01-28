import { CheckCircle } from 'lucide-react'
import type { ReactElement } from 'react'
import type { Hash } from 'viem'
import { CopyableRecord } from '@/components/CopyableRecord'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { getTransactionErrorInfo } from '@/features/registry/utils/transactionErrorMessage'
import { cn } from '@/lib/utils'
import { TransactionErrorAlert } from './TransactionErrorAlert'

interface DeployTransactionStatusProps {
  readonly txHash: Hash | undefined
  readonly isConfirming: boolean
  readonly isConfirmed: boolean
  readonly txError: unknown | null
}

export const DeployTransactionStatus = ({
  txHash,
  isConfirming,
  isConfirmed,
  txError,
}: DeployTransactionStatusProps): ReactElement | null => {
  if (txError) {
    const { summary, details } = getTransactionErrorInfo(txError)
    return (
      <TransactionErrorAlert
        title="Transaction Failed"
        summary={summary}
        details={details}
        txHash={txHash}
        txHashLabel="Deploy tx hash:"
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
      <AlertTitle>
        {isConfirming ? 'Deploying Subregistry' : 'Subregistry Deployed'}
      </AlertTitle>
      <AlertDescription className="break-all whitespace-normal max-w-full overflow-wrap-anywhere">
        <div className="flex flex-col gap-2">
          <span>
            {isConfirming
              ? 'Waiting for confirmation...'
              : 'Deploy transaction confirmed!'}
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              Deploy tx hash:
            </span>
            <CopyableRecord
              value={txHash}
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              className="text-xs"
              truncate={false}
            />
          </div>
        </div>
      </AlertDescription>
    </Alert>
  )
}
