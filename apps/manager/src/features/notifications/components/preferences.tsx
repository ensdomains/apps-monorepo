import { useMutation, useQuery } from '@tanstack/react-query'
import { NOTIFICATION_METADATA, type Prettify } from 'api-worker/types'
import { ArrowRightLeft, Calendar, Info, type LucideIcon } from 'lucide-react'
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
import { channelsQueryOptions } from '../queries/channels'
import {
  preferencesQueryOptions,
  updatePreferenceMutationOptions,
} from '../queries/preferences'
import type { ChannelType } from '../types/preferences'

const KIND_ICONS: Record<keyof typeof NOTIFICATION_METADATA, LucideIcon> = {
  'name-expiry': Calendar,
  'name-transferred': ArrowRightLeft,
  'blog-post': Info,
}

const kindsData = Object.entries(NOTIFICATION_METADATA).map(([k, v]) => ({
  id: k,
  icon: KIND_ICONS[k as keyof typeof KIND_ICONS],
  ...v,
})) as {
  [K in keyof typeof NOTIFICATION_METADATA]: Prettify<
    (typeof NOTIFICATION_METADATA)[K] & {
      id: K
      icon: LucideIcon
    }
  >
}[keyof typeof NOTIFICATION_METADATA][]

const groupedKinds = Object.entries(
  kindsData.reduce(
    (acc, kind) => {
      if (!acc[kind.category]) {
        acc[kind.category] = []
      }
      acc[kind.category]?.push(kind)
      return acc
    },
    {} as Record<string, typeof kindsData>,
  ),
).map(([category, kinds]) => ({
  category,
  kinds,
}))

export function NotificationPreferences() {
  const { data: channels = [] } = useQuery(channelsQueryOptions)
  const { data: preferences = {} } = useQuery(preferencesQueryOptions)
  const updatePreferenceMutation = useMutation(updatePreferenceMutationOptions)

  const [hasAutoRenew] = useState(false) // This would come from user data

  const verifiedChannels = channels.filter(
    (channel) => channel.status === 'verified',
  )
  const hasVerifiedChannels = verifiedChannels.length > 0

  const handlePreferenceChange = (
    kindId: string,
    channel: ChannelType,
    enabled: boolean,
  ) => {
    updatePreferenceMutation.mutate(
      { kind: kindId, channel, enabled },
      {
        onSuccess: () => {
          toast.success('Preference updated')
        },
        onError: (error: Error) => {
          toast.error(error.message || 'Failed to update preference')
        },
      },
    )
  }

  const isPreferenceEnabled = (
    kindId: string,
    channel: ChannelType,
  ): boolean => {
    return preferences[channel]?.[kindId]?.enabled ?? true // Default to enabled
  }

  return (
    <div className="space-y-6">
      {/* Auto-renew info */}
      {hasAutoRenew && (
        <Alert className="border-blue-200 bg-blue-50 text-blue-800">
          <Info className="size-4 text-blue-600" />
          <AlertDescription>
            For names with auto-renew enabled, we'll send 'renewal
            scheduled/charged' notifications instead of 'name expiring'
            notifications.
          </AlertDescription>
        </Alert>
      )}

      {/* No channels warning */}
      {!hasVerifiedChannels && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-800">
          <Info className="size-4 text-amber-600" />
          <AlertDescription>
            Add a delivery channel to receive notifications for these
            preferences.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>
            Control what kinds of notifications you receive and on which
            channels.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[1fr_repeat(2,minmax(0,max-content))] gap-4 border-b pb-4">
            <div className="font-semibold">Notification Type</div>
            <div className="text-center font-semibold">Email</div>
            <div className="text-center font-semibold">Telegram</div>
            {/* Web Push when ready */}
          </div>

          {groupedKinds.map(({ category, kinds }) => (
            <div key={category} className="mt-6">
              <h3 className="mb-4 font-semibold text-lg">{category}</h3>
              <div className="space-y-4">
                {kinds.map((kind) => {
                  const KindIcon = kind.icon
                  return (
                    <div
                      key={kind.id}
                      className="grid grid-cols-[1fr_repeat(2,minmax(0,max-content))] items-center gap-4 border-b pb-4 last:border-b-0 last:pb-0"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          {KindIcon && <KindIcon className="h-4 w-4" />}
                          <Label className="font-medium">{kind.label}</Label>
                          {kind.recommended && (
                            <Badge variant="secondary">Recommended</Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground text-sm">
                          {kind.description}
                        </p>
                        {'thresholds' in kind && (
                          <p className="text-muted-foreground text-xs">
                            We'll notify {kind.thresholds.join(', ')} days
                            before
                          </p>
                        )}
                      </div>
                      {['email', 'telegram'].map((channelType) => {
                        const isChannelVerified = verifiedChannels.some(
                          (c) => c.channel === channelType,
                        )
                        const isEnabled = isPreferenceEnabled(
                          kind.id,
                          channelType as ChannelType,
                        )

                        return (
                          <div
                            key={channelType}
                            className="flex flex-col items-center gap-1"
                          >
                            <Switch
                              checked={isEnabled}
                              onCheckedChange={(checked) =>
                                handlePreferenceChange(
                                  kind.id,
                                  channelType as ChannelType,
                                  checked,
                                )
                              }
                              disabled={
                                !hasVerifiedChannels || !isChannelVerified
                              }
                            />
                            {!hasVerifiedChannels || !isChannelVerified ? (
                              <span className="text-center text-muted-foreground text-xs">
                                Add{' '}
                                {channelType === 'email' ? 'Email' : 'Telegram'}
                              </span>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
