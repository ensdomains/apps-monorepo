'use client'

import { CheckCircleIcon } from 'lucide-react'
import * as React from 'react'

interface RegistrationInProgressProps {
  domainName: string
  onRegistrationSuccess: () => void
}

export const RegistrationInProgress = ({
  domainName,
  onRegistrationSuccess,
}: RegistrationInProgressProps) => {
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
      </div>
    </div>
  )
}
