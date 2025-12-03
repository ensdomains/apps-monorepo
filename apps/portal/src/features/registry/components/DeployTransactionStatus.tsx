import { AlertCircle, CheckCircle } from 'lucide-react'
import type { Hash } from 'viem'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface DeployTransactionStatusProps {
  txHash: Hash | undefined
  isConfirming: boolean
  txError: string | null
}

export const DeployTransactionStatus = ({
  txHash,
  isConfirming,
  txError,
}: DeployTransactionStatusProps) => {
  if (txError) {
    return (
      <Alert variant="destructive" className="max-w-full">
        <AlertCircle />
        <AlertTitle>Transaction Failed</AlertTitle>
        <AlertDescription className="break-all whitespace-normal max-w-full overflow-wrap-anywhere">
          {txError}
        </AlertDescription>
      </Alert>
    )
  }

  if (!txHash) {
    return null
  }

  return (
    <Alert className="max-w-full">
      <CheckCircle className={isConfirming ? 'animate-pulse' : ''} />
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
