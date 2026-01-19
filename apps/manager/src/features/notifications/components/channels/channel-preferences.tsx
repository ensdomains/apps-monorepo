import { useQuery } from '@tanstack/react-query'
import {
  ArrowRightLeft,
  Calendar,
  Clock,
  Info,
  type LucideIcon,
  Mail,
  MessageSquare,
  Smartphone,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { channelsQueryOptions } from '../../queries/channels'

interface NotificationKind {
  id: string
  icon: LucideIcon
  label: string
  description: string
  category: string
  recommended?: boolean
  threshold?: string
}

const NOTIFICATION_KINDS: NotificationKind[] = [
  // Domain lifecycle
  {
    id: 'name-expiry-owned',
    icon: Calendar,
    label: 'Name Expiry (Owned)',
    description: 'Get notified when your domains are about to expire',
    category: 'Domain Lifecycle',
    recommended: true,
    threshold: '30, 7, 1 days before expiry',
  },
  {
    id: 'name-expiry-favorited',
    icon: Calendar,
    label: 'Name Expiry (Favorited)',
    description: 'Get notified when your favorited domains are about to expire',
    category: 'Domain Lifecycle',
    recommended: true,
    threshold: '30, 7, 1 days before expiry',
  },
  {
    id: 'renewal-upcoming',
    icon: Clock,
    label: 'Renewal Upcoming',
    description: 'Get notified when auto-renewal is scheduled',
    category: 'Domain Lifecycle',
    recommended: true,
  },
  {
    id: 'renewal-charged',
    icon: Clock,
    label: 'Renewal Charged/Failed',
    description: 'Get notified when auto-renewal succeeds or fails',
    category: 'Domain Lifecycle',
    recommended: true,
  },
  // Transactions
  {
    id: 'tx-success',
    icon: ArrowRightLeft,
    label: 'Transaction Success',
    description: 'Get notified when your transactions succeed',
    category: 'Transactions',
    recommended: true,
  },
  {
    id: 'tx-failed',
    icon: ArrowRightLeft,
    label: 'Transaction Failed',
    description: 'Get notified when your transactions fail',
    category: 'Transactions',
    recommended: true,
  },
  // Security/Ownership
  {
    id: 'name-transfer',
    icon: ArrowRightLeft,
    label: 'Name Transfer',
    description: 'Get notified when your domains are transferred',
    category: 'Security/Ownership',
    recommended: true,
  },
  {
    id: 'manager-permissions',
    icon: Info,
    label: 'Manager Permissions Changed',
    description: 'Get notified when manager permissions are modified',
    category: 'Security/Ownership',
    recommended: true,
  },
  // ENS Labs Updates
  {
    id: 'blog-post',
    icon: Info,
    label: 'ENS Labs Updates',
    description: 'Get updated on the latest releases and news from ENS Labs',
    category: 'ENS Labs Updates',
  },
]

const CHANNEL_ICONS = {
  email: Mail,
  telegram: MessageSquare,
  web_push: Smartphone,
} as const

type ChannelType = keyof typeof CHANNEL_ICONS

interface PreferenceState {
  [kindId: string]: {
    [channel: string]: boolean
  }
}

export const NotificationPreferences = () => {
  const { data: channels = [] } = useQuery(channelsQueryOptions)
  const [preferences, setPreferences] = useState<PreferenceState>({})
  const [hasAutoRenew] = useState(false) // This would come from user data

  const verifiedChannels = channels.filter(
    (channel) => channel.status === 'verified',
  )
  const hasVerifiedChannels = verifiedChannels.length > 0

  const groupedKinds = NOTIFICATION_KINDS.reduce(
    (acc, kind) => {
      if (!acc[kind.category]) {
        acc[kind.category] = []
      }
      // biome-ignore lint/style/noNonNullAssertion: The above check ensures it's not null
      acc[kind.category]!.push(kind)
      return acc
    },
    {} as Record<string, NotificationKind[]>,
  )

  const handlePreferenceChange = (
    kindId: string,
    channel: string,
    enabled: boolean,
  ) => {
    setPreferences((prev) => ({
      ...prev,
      [kindId]: {
        ...prev[kindId],
        [channel]: enabled,
      },
    }))

    // TODO: Call API to update preference
    toast.success('Preference updated')
  }

  const getChannelIcon = (channel: string) => {
    return CHANNEL_ICONS[channel as ChannelType] || Mail
  }

  // const isChannelAvailable = (channel: string) => {
  //   return verifiedChannels.some(c => c.channel === channel)
  // }

  return (
    <div className="space-y-6">
      {/* Auto-renew info */}
      {hasAutoRenew && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            For names with auto-renew enabled, we'll send 'renewal
            scheduled/charged' notifications instead of 'name expiring'
            notifications.
          </AlertDescription>
        </Alert>
      )}

      {/* No channels warning */}
      {!hasVerifiedChannels && (
        <Alert variant="destructive">
          <Info className="h-4 w-4" />
          <AlertDescription>
            Add a delivery channel to receive notifications for these
            preferences.
          </AlertDescription>
        </Alert>
      )}

      {/* Preferences by category */}
      {Object.entries(groupedKinds).map(([category, kinds]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle>{category}</CardTitle>
            <CardDescription>
              Configure notifications for {category.toLowerCase()} events
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {kinds.map((kind) => {
              const Icon = kind.icon
              return (
                <div className="space-y-4" key={kind.id}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Label className="font-medium">{kind.label}</Label>
                        {kind.recommended && (
                          <Badge className="text-xs" variant="secondary">
                            Recommended
                          </Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground text-sm">
                        {kind.description}
                      </p>
                      {kind.threshold && (
                        <p className="text-muted-foreground text-xs">
                          We'll notify {kind.threshold}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Channel toggles */}
                  <div className="ml-11 space-y-3">
                    {verifiedChannels.map((channel) => {
                      const ChannelIcon = getChannelIcon(channel.channel)
                      const isEnabled =
                        preferences[kind.id]?.[channel.channel] ??
                        kind.recommended ??
                        false

                      return (
                        <div
                          className="flex items-center justify-between"
                          key={channel.id}
                        >
                          <div className="flex items-center gap-2">
                            <ChannelIcon className="h-4 w-4" />
                            <span className="text-sm capitalize">
                              {channel.channel}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              ({channel.label})
                            </span>
                          </div>
                          <Switch
                            checked={isEnabled}
                            disabled={!hasVerifiedChannels}
                            onCheckedChange={(enabled) =>
                              handlePreferenceChange(
                                kind.id,
                                channel.channel,
                                enabled,
                              )
                            }
                          />
                        </div>
                      )
                    })}

                    {!hasVerifiedChannels && (
                      <p className="text-muted-foreground text-xs">
                        Add a channel to enable notifications
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
