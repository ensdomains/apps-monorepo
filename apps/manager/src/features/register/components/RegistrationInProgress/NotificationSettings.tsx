'use client'

import { ArrowLeftRight, Clock, Heart, Mail, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

interface NotificationSettingsProps {
  onConfirm: (settings: NotificationPreferences) => void
  onSkip: () => void
  className?: string
}

export interface NotificationPreferences {
  email: string
  emailVerified: boolean
  telegramConnected: boolean
  nameExpiry: boolean
  nameTransfers: boolean
  ensLabsUpdates: boolean
}

export const NotificationSettings = ({
  onConfirm,
  onSkip,
  className,
}: NotificationSettingsProps) => {
  const [email, setEmail] = useState('')
  const [nameExpiry, setNameExpiry] = useState(true)
  const [nameTransfers, setNameTransfers] = useState(true)
  const [ensLabsUpdates, setEnsLabsUpdates] = useState(false)

  const handleConfirm = () => {
    const preferences: NotificationPreferences = {
      email,
      emailVerified: false,
      telegramConnected: false,
      nameExpiry,
      nameTransfers,
      ensLabsUpdates,
    }

    // TODO: Send notification preferences to API
    console.log('Notification preferences:', preferences)

    onConfirm(preferences)
  }

  const handleTelegramSignup = () => {
    // TODO: Implement Telegram signup flow
    console.log('Telegram signup clicked')
  }

  return (
    <div className={cn('flex flex-col gap-6 bg-gray-100 px-5 py-6', className)}>
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl text-ens-blue-dark leading-9 tracking-tight">
          Notification Settings
        </h2>
        <p className="text-base text-ens-gray leading-[19.6px]">
          Manage your notification preferences for your name(s) and ENS-related
          updates.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 rounded-lg border border-ens-gray-two bg-white p-5">
          <div className="flex items-start gap-2">
            <Mail className="h-5 w-5 shrink-0 text-ens-gray" />
            <div className="flex flex-1 flex-col gap-1.5">
              <p className="text-base text-ens-blue-dark leading-6">
                Email Notifications
              </p>
              <p className="text-ens-gray text-sm leading-[19.6px]">
                Receive notifications via email for important domain events
              </p>
            </div>
          </div>
          <Input
            type="email"
            placeholder="enter email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 rounded border-ens-gray-two text-sm placeholder:text-ens-gray-three"
          />
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleTelegramSignup}
            className="flex w-fit items-center justify-center gap-3.5 rounded-full bg-ens-lapis-core px-4 py-2.5"
          >
            <MessageCircle className="h-5 w-5 text-white" />
            <span className="font-medium text-base text-white leading-[15.36px] tracking-tight">
              Sign up with Telegram
            </span>
          </button>
          <p className="text-ens-gray text-sm leading-[19.6px]">
            Get instant updates through Telegram for your domains
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between rounded-lg border border-ens-gray-two bg-white p-4">
          <div className="flex items-start gap-2">
            <Clock className="h-5 w-5 shrink-0 text-ens-gray" />
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <p className="text-ens-blue-dark text-sm leading-[22.5px]">
                  Name Expiry
                </p>
                <span className="rounded bg-ens-lapis-dust px-2 py-0.5 text-ens-blue-dark text-xs leading-[16.5px]">
                  Recommended
                </span>
              </div>
              <p className="text-ens-gray text-xs leading-[18.2px]">
                You&apos;ll be notified 30, 7, and 1 day before expiry.
              </p>
            </div>
          </div>
          <Switch
            checked={nameExpiry}
            onCheckedChange={setNameExpiry}
            className="shrink-0"
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-ens-gray-two bg-white p-4">
          <div className="flex items-start gap-2">
            <ArrowLeftRight className="h-5 w-5 shrink-0 text-ens-gray" />
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <p className="text-ens-blue-dark text-sm leading-[22.5px]">
                  Name Transfers
                </p>
                <span className="rounded bg-ens-lapis-dust px-2 py-0.5 text-ens-blue-dark text-xs leading-[16.5px]">
                  Recommended
                </span>
              </div>
              <p className="text-ens-gray text-xs leading-[18.2px]">
                Get notified when your domains are transferred to another wallet
              </p>
            </div>
          </div>
          <Switch
            checked={nameTransfers}
            onCheckedChange={setNameTransfers}
            className="shrink-0"
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-ens-gray-two bg-white p-4">
          <div className="flex items-start gap-2">
            <Heart className="h-5 w-5 shrink-0 text-ens-gray" />
            <div className="flex flex-col gap-1.5">
              <p className="text-ens-blue-dark text-sm leading-[22.5px]">
                ENS Labs Updates
              </p>
              <p className="text-ens-gray text-xs leading-[18.2px]">
                Get updated on the latest releases and features
              </p>
            </div>
          </div>
          <Switch
            checked={ensLabsUpdates}
            onCheckedChange={setEnsLabsUpdates}
            className="shrink-0"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Button
          onClick={handleConfirm}
          className="h-[74px] w-full rounded bg-ens-gray-two font-medium font-mono text-ens-gray text-sm uppercase tracking-wider hover:bg-ens-gray-two"
        >
          Confirm Preferences
        </Button>
        <Button
          variant="outline"
          onClick={onSkip}
          className="h-[74px] w-full rounded border-ens-blue bg-ens-white font-medium font-mono text-ens-blue text-sm uppercase tracking-wider hover:bg-ens-white"
        >
          Skip
        </Button>
      </div>
    </div>
  )
}
