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
          className="font-mono text-blue-600 underline-offset-2 hover:underline"
          href={`https://sepolia.etherscan.io/tx/${txHash}`}
          rel="noreferrer"
          target="_blank"
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
          description="Submitting your ENS profile update. This may take a few moments."
          title="Updating profile"
          variant="info"
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
          description={errorMessage}
          title="Update failed"
          variant="destructive"
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
          description="Your profile changes have been confirmed on-chain."
          title="Profile updated"
          variant="success"
        >
          {renderTxLink()}
        </Alert>
      </div>
    )
  }

  return null
}
