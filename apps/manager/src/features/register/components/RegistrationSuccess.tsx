'use client'

import { CheckCircleIcon } from 'lucide-react'
import * as React from 'react'
import { QRPattern } from '@/components/atoms'

interface RegistrationSuccessProps {
  domainName: string
  onSetupAutorenewal: () => void
}

export function RegistrationSuccess({
  domainName,
  onSetupAutorenewal,
}: RegistrationSuccessProps) {
  React.useEffect(() => {
    const timer = setTimeout(() => {
      onSetupAutorenewal()
    }, 3000)

    return () => clearTimeout(timer)
  }, [onSetupAutorenewal])

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

      {/* Registration success status */}
      <div className="space-y-2">
        <div className="flex items-center justify-center gap-2">
          <CheckCircleIcon className="h-4 w-4 text-green-600" />
          <span className="font-medium text-gray-900 text-sm">
            Registration successful
          </span>
        </div>
        <div className="h-1 w-full rounded-full bg-gray-200">
          <div className="h-1 w-full rounded-full bg-green-600"></div>
        </div>
      </div>
    </div>
  )
}
