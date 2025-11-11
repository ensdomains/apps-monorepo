import {
  ArrowRightLeft,
  Calendar,
  Clock,
  type LucideIcon,
  MailIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

const NOTIFICATION_OPTIONS: {
  icon?: LucideIcon
  label: string
  description: string
  recommended?: boolean
}[] = [
  {
    icon: ArrowRightLeft,
    label: 'Name Transfers',
    description: 'Get notified when your domains are transferred',
    recommended: true,
  },
  {
    icon: Calendar,
    label: 'Name Expiry',
    description:
      'Get notified when your domains are expired. 30, 7, 1 days before expiry',
    recommended: true,
  },
  {
    icon: Clock,
    label: 'ENS Labs Updates',
    description:
      'Get updated on the latest releases and news from the ENS Labs team.',
  },
]

export const NotificationSettings = () => {
  return (
    <div>
      <h1 className="font-normal text-2xl">Notification Settings</h1>
      <p>
        Manage your notification preferences for your name(s) and ENS-related
        updates.
      </p>

      <div className="mt-4 rounded-md bg-gray-200 p-5">
        <div className="mb-5">
          <h2 className="mb-2 flex items-center gap-2 font-medium text-gray-900 text-lg">
            <MailIcon className="size-5" />
            Email Notifications
          </h2>
          <p>Receive notifications via email for important domain events</p>
        </div>

        <div className="mb-8 space-y-4">
          <div className="font-medium">Notification Email Address</div>
          <div className="flex gap-2">
            <Input />
            <Button>Save</Button>
          </div>
        </div>

        <div className="space-y-4">
          {NOTIFICATION_OPTIONS.map((option) => (
            <div
              key={option.label}
              // bottom border if isn't last
              className="space-y-3 border-gray-300 not-last:border-b not-last:pb-4"
            >
              <div className="flex items-center gap-2">
                {option.icon && <option.icon className="size-4" />}
                <div>{option.label}</div>
                {option.recommended && (
                  <Badge variant="secondary">Recommended</Badge>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 font-normal text-neutral-500">
                <Label className="font-normal text-sm">
                  {option.description}
                </Label>
                <Switch />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <Button className="w-full">Save Settings</Button>
      </div>
    </div>
  )
}
