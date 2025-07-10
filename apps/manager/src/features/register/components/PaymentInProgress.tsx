'use client'

import { LoaderIcon } from 'lucide-react'
import * as React from 'react'

interface PaymentInProgressProps {
  domainName: string
  selectedCrypto?: string
  onPaymentSuccess: () => void
}

export function PaymentInProgress({
  domainName,
  selectedCrypto = 'USDC',
  onPaymentSuccess,
}: PaymentInProgressProps) {
  React.useEffect(() => {
    // Mock contract call - simulate payment processing
    const processPayment = async () => {
      // Simulate network delay for contract interaction
      await new Promise((resolve) => setTimeout(resolve, 3000))

      // Simulate successful payment
      onPaymentSuccess()
    }

    processPayment()
  }, [onPaymentSuccess])

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      {/* Processing Payment */}
      <div className="space-y-4 text-center">
        <div className="flex justify-center">
          <LoaderIcon className="h-12 w-12 animate-spin text-primary" />
        </div>

        <div>
          <h2 className="font-bold text-foreground text-xl">
            Processing Payment
          </h2>
          <p className="mt-2 text-muted-foreground text-sm">
            Please confirm the transaction in your wallet
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
            {selectedCrypto}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">Status</span>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-yellow-500"></div>
            <span className="font-medium text-sm text-yellow-600">
              Confirming...
            </span>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-green-500"></div>
          <span className="text-green-600 text-sm">Payment initiated</span>
        </div>

        <div className="flex items-center gap-3">
          <LoaderIcon className="h-2 w-2 animate-spin text-yellow-500" />
          <span className="text-sm text-yellow-600">
            Waiting for blockchain confirmation
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-gray-300"></div>
          <span className="text-muted-foreground text-sm">
            Registration complete
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
