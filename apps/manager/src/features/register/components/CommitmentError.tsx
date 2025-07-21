'use client'

import { AlertCircleIcon, RefreshCwIcon } from 'lucide-react'
import { QRPattern } from '@/components/atoms'
import { Button } from '@/components/ui/button'

interface CommitmentErrorProps {
  domainName: string
  onRetry: () => void
}

export function CommitmentError({ domainName, onRetry }: CommitmentErrorProps) {
  return (
    <div className="mx-auto max-w-md space-y-8 p-6 text-center">
      <div className="flex justify-center">
        <QRPattern />
      </div>

      {/* Domain name */}
      <div className="flex justify-center">
        <div className="inline-flex items-center rounded bg-gray-800 px-4 py-2 font-medium font-mono text-white">
          {domainName}
        </div>
      </div>

      {/* Error status */}
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-2">
          <AlertCircleIcon className="h-6 w-6 text-red-600" />
          <span className="font-medium text-lg text-red-900">
            Transaction Failed
          </span>
        </div>

        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-left">
          <p className="mt-2 text-red-700 text-sm">
            The commitment transaction was rejected or failed. You can try again
            or start over.
          </p>
        </div>

        {/* Action buttons */}
        <div className="space-y-3">
          <Button
            onClick={onRetry}
            className="flex w-full items-center justify-center gap-2 bg-background text-foreground hover:bg-background/80"
          >
            <RefreshCwIcon className="h-4 w-4" />
            Try Again
          </Button>
        </div>
      </div>
    </div>
  )
}
