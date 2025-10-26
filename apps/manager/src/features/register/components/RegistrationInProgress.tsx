'use client'

import { CheckCircleIcon, ExternalLink } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import type { RhinestoneTransactionResult } from '@/lib/rhinestone/utils'

interface RegistrationInProgressProps {
  domainName: string
  onRegistrationSuccess: () => void
  registerTxHash?: RhinestoneTransactionResult | null
}

export function RegistrationInProgress({
  domainName,
  onRegistrationSuccess,
  registerTxHash,
}: RegistrationInProgressProps) {
  React.useEffect(() => {
    // Mock registration process - simulate contract calls
    const processRegistration = async () => {
      // Simulate network delay for contract interactions
      // This would be where actual ENS registration contract calls happen
      await new Promise((resolve) => setTimeout(resolve, 4000))

      // Simulate successful registration
      onRegistrationSuccess()
    }

    processRegistration()
  }, [onRegistrationSuccess])

  return (
    <div className="mx-auto max-w-md space-y-8 p-6 text-center">
      {/* QR-like pattern placeholder */}
      <div className="flex justify-center">
        <div className="grid h-32 w-32 grid-cols-8 gap-1">
          {/* Creating a QR-like pattern */}
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-200" />
          <div className="h-3 w-3 bg-gray-800" />
          <div className="h-3 w-3 bg-gray-200" />
        </div>
      </div>

      {/* Domain name */}
      <div className="flex justify-center">
        <div className="inline-flex items-center rounded bg-gray-800 px-4 py-2 font-medium font-mono text-white">
          {domainName}
        </div>
      </div>

      {/* Spacer */}
      <div className="h-32" />

      {/* Registration status */}
      <div className="space-y-2">
        <div className="flex items-center justify-center gap-2">
          <CheckCircleIcon className="h-4 w-4 text-gray-600" />
          <span className="font-medium text-gray-900 text-sm">
            Registration in progress
          </span>
        </div>
        <div className="h-1 w-full rounded-full bg-gray-200">
          <div className="h-1 w-2/3 animate-pulse rounded-full bg-gray-600"></div>
        </div>

        {registerTxHash?.hash && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <span className="text-muted-foreground text-xs">TX:</span>
            <span className="font-mono text-gray-700 text-xs">
              {registerTxHash.hash.slice(0, 8)}...
              {registerTxHash.hash.slice(-6)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => {
                window.open(
                  `https://sepolia.etherscan.io/tx/${registerTxHash.hash}`,
                  '_blank',
                )
              }}
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
