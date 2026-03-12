import { CheckCircle } from 'lucide-react'
import type { ReactElement } from 'react'
import { match } from 'ts-pattern'
import { CopyableRecord } from '@/components/CopyableRecord'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { TransactionErrorAlert } from '@/features/registry/components/TransactionErrorAlert'
import { getTransactionErrorInfo } from '@/features/registry/utils/transactionErrorMessage'
import type { TransactionStatusProps } from '@/lib/types/transaction'
import { useBlockExplorerTxUrl } from '@/utils/blockExplorer/useBlockExplorerUrl'

export const ChangeResolverTransactionStatus = ({
  txHash,
  isConfirming,
  isConfirmed,
  isReverted,
  txError,
  receiptError,
}: TransactionStatusProps): ReactElement | null => {
  const txUrl = useBlockExplorerTxUrl(txHash)
  if (txError) {
    const { summary, details } = getTransactionErrorInfo(txError)
    return (
      <TransactionErrorAlert
        title="Transaction Failed"
        summary={summary}
        details={details}
        txHash={txHash}
        txHashLabel="Transaction hash:"
      />
    )
  }

  if (receiptError) {
    const { summary, details } = getTransactionErrorInfo(receiptError)
    return (
      <TransactionErrorAlert
        title="Receipt Error"
        summary={summary}
        details={details}
        txHash={txHash}
        txHashLabel="Transaction hash:"
      />
    )
  }

  if (isReverted) {
    return (
      <TransactionErrorAlert
        title="Transaction Reverted"
        summary="The transaction was reverted on-chain."
        details="Please check the transaction details for more information."
        txHash={txHash}
        txHashLabel="Transaction hash:"
      />
    )
  }

  if (!txHash && !isConfirming && !isConfirmed) {
    return null
  }

  return (
    <Alert className="max-w-full">
      <CheckCircle className={isConfirming ? 'animate-pulse' : ''} />
      <AlertTitle>
        {match({ isConfirming })
          .with({ isConfirming: true }, () => 'Changing Resolver')
          .otherwise(() => 'Resolver Changed')}
      </AlertTitle>
      <AlertDescription className="break-all whitespace-normal max-w-full overflow-wrap-anywhere">
        <div className="flex flex-col gap-2">
          <span>
            {match({ isConfirming, isConfirmed })
              .with({ isConfirming: true }, () => 'Waiting for confirmation...')
              .with({ isConfirmed: true }, () => 'Transaction confirmed!')
              .otherwise(() => 'Transaction submitted')}
          </span>
          {txHash && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                Transaction hash:
              </span>
              <CopyableRecord
                value={txHash}
                href={txUrl}
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
