'use client'

import { LoaderIcon } from 'lucide-react'
import * as React from 'react'
import { QRPattern } from '@/components/atoms'

interface RegistrationInProgressProps {
  domainName: string
  onRegistrationSuccess: () => void
}

export function RegistrationInProgress({
  domainName,
  onRegistrationSuccess,
}: RegistrationInProgressProps) {
  React.useEffect(() => {
    const processRegistration = async () => {
      await new Promise((resolve) => setTimeout(resolve, 4000))
      onRegistrationSuccess()
    }

    processRegistration()
  }, [onRegistrationSuccess])

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
      <div className="space-y-2">
        <div className="flex items-center justify-center gap-2">
          <LoaderIcon className="h-4 w-4 text-gray-600" />
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
