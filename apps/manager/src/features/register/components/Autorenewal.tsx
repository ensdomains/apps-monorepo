'use client'

import { Button } from '@/components/ui/button'

interface AutorenewalProps {
  domainName: string
  duration: number
  onSkipAutorenewal: () => void
}

export const Autorenewal = ({
  domainName,
  duration,
  onSkipAutorenewal,
}: AutorenewalProps) => {
  // Calculate expiry date based on actual duration selected
  const currentDate = new Date()
  const expiryDate = new Date(
    currentDate.getTime() + duration * 365.25 * 24 * 60 * 60 * 1000,
  )
  const expiryDateString = expiryDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="mx-auto max-w-md space-y-8 p-6 text-center">
      {/* QR-like pattern placeholder - same as previous screens */}
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

      {/* Domain name with expiry */}
      <div className="space-y-2">
        <div className="flex justify-center">
          <div className="inline-flex items-center rounded bg-gray-800 px-4 py-2 font-medium font-mono text-white">
            {domainName}
          </div>
        </div>
        <p className="text-gray-600 text-sm">expires {expiryDateString}</p>
      </div>

      {/* Autorenewal card */}
      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 text-left">
        <h3 className="font-medium text-gray-900">
          Protect your name with autorenewal
        </h3>
        <p className="text-gray-600 text-sm">
          Your name expires on {expiryDateString}. Add a credit card to renew it
          automatically. You can pause or cancel anytime.
        </p>
      </div>

      {/* Action buttons */}
      <div className="space-y-3">
        <Button className="w-full bg-gray-900 text-white hover:bg-gray-800">
          Add credit card
        </Button>
        <Button
          onClick={onSkipAutorenewal}
          variant="ghost"
          className="w-full text-gray-600"
        >
          Skip →
        </Button>
      </div>
    </div>
  )
}
