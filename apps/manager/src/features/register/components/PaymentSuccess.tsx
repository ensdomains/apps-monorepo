'use client'

import { BellIcon, CheckCircleIcon, MailIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

interface PaymentSuccessProps {
  domainName: string
  onComplete: () => void
}

export function PaymentSuccess({
  domainName: _domainName,
  onComplete,
}: PaymentSuccessProps) {
  const [email, setEmail] = useState('')
  const [nameExpiryReminders, setNameExpiryReminders] = useState(true)

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      {/* Payment Success */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center gap-2">
          <CheckCircleIcon className="h-5 w-5 text-gray-600" />
          <span className="font-medium text-gray-800">Payment Successful!</span>
        </div>
        <p className="mt-1 text-gray-700 text-sm">
          Your registration is being processed
        </p>
        <div className="mt-3 h-2 w-full rounded-full bg-gray-200">
          <div className="h-2 w-3/4 rounded-full bg-gray-600"></div>
        </div>
      </div>

      {/* Email Notifications */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BellIcon className="h-5 w-5 text-gray-600" />
          <h3 className="font-medium text-gray-900">Email Notifications</h3>
        </div>
        <p className="text-gray-600 text-sm">
          Stay updated about important events related to your domain
        </p>

        <div className="space-y-3">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block font-medium text-gray-700 text-sm"
            >
              Email
            </label>
            <Input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full"
            />
          </div>
        </div>
      </div>

      {/* Name Expiry Reminders */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MailIcon className="h-5 w-5 text-gray-600" />
            <div>
              <h3 className="font-medium text-gray-900">
                Name Expiry Reminders
              </h3>
              <p className="text-gray-600 text-sm">
                Get notified when your name is expiring
              </p>
            </div>
          </div>
          <Switch
            checked={nameExpiryReminders}
            onCheckedChange={setNameExpiryReminders}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        <Button onClick={onComplete} className="w-full" disabled={!email}>
          Confirm Notifications
        </Button>
        <Button onClick={onComplete} variant="ghost" className="w-full">
          Skip →
        </Button>
      </div>

      {/* Registration Status */}
      <div className="mt-6 text-center">
        <div className="flex items-center justify-center gap-2">
          <CheckCircleIcon className="h-4 w-4 text-green-600" />
          <span className="font-medium text-gray-900 text-sm">
            Registration in progress
          </span>
        </div>
        <div className="mt-2 h-1 w-full rounded-full bg-gray-200">
          <div className="h-1 w-1/3 rounded-full bg-gray-600"></div>
        </div>
      </div>
    </div>
  )
}
