'use client'

import { ExternalLink, LoaderIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RhinestoneTransactionResult } from '@/lib/rhinestone/utils'

interface ApprovalInProgressProps {
  domainName: string
  selectedToken: string
  commitTxHash?: RhinestoneTransactionResult | null
}

export function ApprovalInProgress({
  domainName,
  selectedToken,
  commitTxHash,
}: ApprovalInProgressProps) {
  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      {/* Approving Token */}
      <div className="space-y-4 text-center">
        <div className="flex justify-center">
          <LoaderIcon className="h-12 w-12 animate-spin text-primary" />
        </div>

        <div>
          <h2 className="font-bold text-foreground text-xl">Approving Token</h2>
          <p className="mt-2 text-muted-foreground text-sm">
            Please confirm the token approval in your wallet
          </p>
        </div>
      </div>

      {/* Transaction Details */}
      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">Domain</span>
          <div className="inline-flex items-center rounded bg-foreground px-2 py-1 font-bold text-background text-sm">
            {domainName}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">Token</span>
          <span className="font-medium text-foreground text-sm">
            {selectedToken}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">Status</span>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500"></div>
            <span className="font-medium text-blue-600 text-sm">
              Approving...
            </span>
          </div>
        </div>

        {commitTxHash?.hash && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">Commit TX</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-foreground text-xs">
                {commitTxHash.hash.slice(0, 8)}...{commitTxHash.hash.slice(-6)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => {
                  window.open(
                    `https://sepolia.etherscan.io/tx/${commitTxHash.hash}`,
                    '_blank',
                  )
                }}
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Progress Steps */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-green-500"></div>
          <span className="text-green-600 text-sm">Payment committed</span>
        </div>

        <div className="flex items-center gap-3">
          <LoaderIcon className="h-2 w-2 animate-spin text-blue-500" />
          <span className="text-blue-600 text-sm">
            Approving {selectedToken} for registration
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-gray-300"></div>
          <span className="text-muted-foreground text-sm">Register domain</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-gray-300"></div>
          <span className="text-muted-foreground text-sm">
            Registration complete
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
        <p className="text-blue-800 text-sm">
          <strong>Step 2 of 3:</strong> Approving the registrar contract to
          spend your {selectedToken} tokens. This is required before
          registration.
        </p>
      </div>
    </div>
  )
}
