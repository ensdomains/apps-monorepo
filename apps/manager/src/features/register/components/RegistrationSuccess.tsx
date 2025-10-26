'use client'

import { CheckCircleIcon, PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface RegistrationSuccessProps {
  domainName: string
  onSetupAutorenewal: () => void
}

export function RegistrationSuccess({
  domainName,
  onSetupAutorenewal,
}: RegistrationSuccessProps) {

  return (
    <div className="mx-auto max-w-md space-y-8 p-6 text-center">
      {/* QR-like pattern placeholder - same as registration in progress */}
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

      {/* Registration success status */}
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-2">
          <CheckCircleIcon className="h-5 w-5 text-green-600" />
          <span className="font-semibold text-gray-900 text-lg">
            Registration Successful!
          </span>
        </div>
        
        <div className="text-gray-600 text-sm">
          Your domain has been successfully registered and is now active.
        </div>

        <div className="h-1 w-full rounded-full bg-gray-200">
          <div className="h-1 w-full rounded-full bg-green-600"></div>
        </div>

        {/* Action buttons */}
        <div className="space-y-3">
          <Button 
            onClick={onSetupAutorenewal}
            className="w-full"
            size="lg"
          >
            <PlusIcon className="mr-2 h-4 w-4" />
            Setup Auto-Renewal
          </Button>
          
          <div className="text-gray-500 text-xs">
            Automatically redirecting in 3 seconds...
          </div>
        </div>
      </div>
    </div>
  )
}
