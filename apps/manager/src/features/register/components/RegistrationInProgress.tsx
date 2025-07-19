'use client'

import { LoaderIcon, ExternalLinkIcon } from 'lucide-react'
import * as React from 'react'
import { QRPattern } from '@/components/atoms'

interface RegistrationInProgressProps {
  domainName: string
  registerTxHash?: string
  isRegisterConfirming?: boolean
  onRegistrationSuccess: () => void
}

export function RegistrationInProgress({
  domainName,
  registerTxHash,
  isRegisterConfirming = false,
  onRegistrationSuccess,
}: RegistrationInProgressProps) {
  // Registration is now handled by the real registration machine

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

      {/* Spacer */}
      <div className="h-32" />

      {/* Registration status */}
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-2">
          <LoaderIcon className="h-4 w-4 text-gray-600" />
          <span className="font-medium text-gray-900 text-sm">
            {registerTxHash && !isRegisterConfirming 
              ? 'Registration confirmed!' 
              : registerTxHash 
              ? 'Confirming registration...' 
              : 'Registration in progress'}
          </span>
        </div>
        
        {registerTxHash && (
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">Transaction Hash:</p>
            <a
              href={`http://localhost:4000/tx/${registerTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 font-medium text-primary text-sm hover:underline"
            >
              {registerTxHash.slice(0, 12)}...{registerTxHash.slice(-12)}
              <ExternalLinkIcon className="h-3 w-3" />
            </a>
          </div>
        )}
        
        <div className="h-1 w-full rounded-full bg-gray-200">
          <div className={`h-1 rounded-full transition-all duration-500 ${
            registerTxHash && !isRegisterConfirming
              ? 'w-full bg-green-600'
              : registerTxHash
              ? 'w-4/5 animate-pulse bg-blue-600'
              : 'w-2/3 animate-pulse bg-gray-600'
          }`}></div>
        </div>
      </div>
    </div>
  )
}
