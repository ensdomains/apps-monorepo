import { Loader2 } from 'lucide-react'
import { Alert } from '@/components/molecules/Alert'

interface UpdateStatusPanelProps {
  isSaving?: boolean
  isSuccess?: boolean
  errorMessage?: string
  txHash?: string
  hasValidationIssues?: boolean
}

export const UpdateStatusPanel = ({
  isSaving,
  isSuccess,
  errorMessage,
  txHash,
  hasValidationIssues,
}: UpdateStatusPanelProps) => {
  if (!isSaving && !isSuccess && !errorMessage) {
    return null
  }

  const renderTxLink = () => {
    if (!txHash) return null

    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-gray-700">Transaction:</span>
        <a
          href={`https://sepolia.etherscan.io/tx/${txHash}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-blue-600 underline-offset-2 hover:underline"
        >
          {txHash.slice(0, 10)}...{txHash.slice(-8)}
        </a>
      </div>
    )
  }

  if (isSaving) {
    return (
      <div className="mb-3">
        <Alert
          variant="info"
          title="Updating profile"
          description="Submitting your ENS profile update. This may take a few moments."
        >
          <div className="mt-2 flex items-center gap-2 text-blue-700 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Waiting for the transaction to be confirmed…</span>
          </div>
          {renderTxLink()}
        </Alert>
      </div>
    )
  }

  if (errorMessage && !hasValidationIssues) {
    return (
      <div className="mb-3">
        <Alert
          variant="destructive"
          title="Update failed"
          description={errorMessage}
        >
          {renderTxLink()}
        </Alert>
      </div>
    )
  }

  if (isSuccess) {
    return (
      <div className="mb-3">
        <Alert
          variant="success"
          title="Profile updated"
          description="Your profile changes have been confirmed on-chain."
        >
          {renderTxLink()}
        </Alert>
      </div>
    )
  }

  return null
}
