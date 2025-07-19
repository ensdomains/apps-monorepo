'use client'

import { ExternalLinkIcon, LoaderIcon } from 'lucide-react'
import * as React from 'react'

interface PaymentInProgressProps {
  domainName: string
  selectedCrypto?: string
  commitTxHash?: string
  isCommitConfirming?: boolean
  onPaymentSuccess: () => void
}

export function PaymentInProgress({
  domainName,
  selectedCrypto = 'USDC',
  commitTxHash,
  isCommitConfirming = false,
  onPaymentSuccess,
}: PaymentInProgressProps) {
  // Add debugging
  React.useEffect(() => {
    console.log('PaymentInProgress mounted:', {
      domainName,
      selectedCrypto,
      commitTxHash,
      isCommitConfirming,
    })
  }, [domainName, selectedCrypto, commitTxHash, isCommitConfirming])

  // Auto-advance to success when we get a transaction hash
  React.useEffect(() => {
    if (commitTxHash) {
      console.log('Got commit transaction hash:', commitTxHash)
      // Give user time to see the transaction, then auto-advance
      const timer = setTimeout(() => {
        console.log('Auto-advancing to payment success')
        onPaymentSuccess()
      }, 3000) // 3 seconds delay
      return () => clearTimeout(timer)
    }
  }, [commitTxHash, onPaymentSuccess])

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      {/* Processing Payment */}
      <div className="space-y-4 text-center">
        <div className="flex justify-center">
          <LoaderIcon className="h-12 w-12 animate-spin text-primary" />
        </div>

        <div>
          <h2 className="font-bold text-foreground text-xl">
            {commitTxHash && !isCommitConfirming 
              ? 'Transaction Confirmed' 
              : commitTxHash 
              ? 'Confirming Transaction' 
              : 'Processing Payment'}
          </h2>
          <p className="mt-2 text-muted-foreground text-sm">
            {commitTxHash && !isCommitConfirming
              ? 'Your transaction has been confirmed on the blockchain'
              : commitTxHash
              ? 'Waiting for blockchain confirmation...'
              : 'Please confirm the transaction in your wallet'}
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
          <span className="text-muted-foreground text-sm">Payment Method</span>
          <span className="font-medium text-foreground text-sm">
            ETH (via {selectedCrypto})
          </span>
        </div>

        {commitTxHash && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                Transaction Hash
              </span>
            </div>
            <div className="flex items-center gap-2 rounded bg-muted p-2">
              <span className="break-all font-mono text-xs">
                {commitTxHash}
              </span>
              <a
                href={`http://localhost:4000/tx/${commitTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0"
              >
                <ExternalLinkIcon className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Debug info */}
      {process.env.NODE_ENV === 'development' && (
        <div className="space-y-2 rounded bg-gray-100 p-3 text-xs">
          <div>
            <strong>Debug Info:</strong>
          </div>
          <div>Domain: {domainName}</div>
          <div>Selected Crypto: {selectedCrypto}</div>
          <div>Commit TX: {commitTxHash || 'Waiting...'}</div>
          <div>Confirming: {isCommitConfirming ? 'Yes' : 'No'}</div>
        </div>
      )}

      {/* Progress Steps */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-green-500"></div>
          <span className="text-green-600 text-sm">
            Commit transaction initiated
          </span>
        </div>

        <div className="flex items-center gap-3">
          {commitTxHash && !isCommitConfirming ? (
            <div className="h-2 w-2 rounded-full bg-green-500"></div>
          ) : commitTxHash ? (
            <LoaderIcon className="h-2 w-2 animate-spin text-blue-500" />
          ) : (
            <LoaderIcon className="h-2 w-2 animate-spin text-yellow-500" />
          )}
          <span
            className={`text-sm ${
              commitTxHash && !isCommitConfirming
                ? 'text-green-600'
                : commitTxHash
                ? 'text-blue-600'
                : 'text-yellow-600'
            }`}
          >
            {commitTxHash && !isCommitConfirming
              ? 'Commit confirmed on blockchain'
              : commitTxHash
              ? 'Confirming on blockchain...'
              : 'Waiting for blockchain confirmation'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-gray-300"></div>
          <span className="text-muted-foreground text-sm">
            Wait period (1 min) then registration
          </span>
        </div>
      </div>

      {/* Warning */}
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
        <p className="text-sm text-yellow-800">
          <strong>Important:</strong> Do not close this tab or refresh the page
          while the transaction is being processed.
        </p>
      </div>
    </div>
  )
}
