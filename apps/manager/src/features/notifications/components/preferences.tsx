import { useMutation, useQuery } from '@tanstack/react-query'
import { Calendar, Info } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
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

export const NotificationPreferences = () => {
  const { data: channels = [] } = useQuery(channelsQueryOptions)
  const { data } = useQuery(preferencesQueryOptions)
  const updatePreferenceMutation = useMutation(updatePreferenceMutationOptions)

  const [hasAutoRenew] = useState(false) // This would come from user data

  const verifiedChannels = channels.filter(
    (channel) => channel.status === 'verified',
  )
  const hasVerifiedChannels = verifiedChannels.length > 0

  const settings = data?.settings ?? {
    ownedNameExpiry: false,
    favouritedNameExpiry: false,
    ensLabsUpdates: false,
  }

  const handlePreferenceChange = (patch: {
    ownedNameExpiry?: boolean
    favouritedNameExpiry?: boolean
    ensLabsUpdates?: boolean
  }) => {
    updatePreferenceMutation.mutate(patch, {
      onSuccess: () => {
        toast.success('Preference updated')
      },
      onError: (error: Error) => {
        toast.error(error.message || 'Failed to update preference')
      },
    })
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
            Choose which notifications you want delivered to email/telegram. You
            will still see critical notifications in-app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <Label className="font-medium">Owned name expiry</Label>
                </div>
                <p className="text-muted-foreground text-sm">
                  Get expiry reminders for names you own.
                </p>
              </div>
              <Switch
                checked={settings.ownedNameExpiry}
                disabled={!hasVerifiedChannels}
                onCheckedChange={(checked) =>
                  handlePreferenceChange({ ownedNameExpiry: checked })
                }
              />
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <Label className="font-medium">Favourited name expiry</Label>
                </div>
                <p className="text-muted-foreground text-sm">
                  Get expiry reminders for names you’ve favourited.
                </p>
              </div>
              <Switch
                checked={settings.favouritedNameExpiry}
                disabled={!hasVerifiedChannels}
                onCheckedChange={(checked) =>
                  handlePreferenceChange({ favouritedNameExpiry: checked })
                }
              />
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  <Label className="font-medium">ENS Labs updates</Label>
                </div>
                <p className="text-muted-foreground text-sm">
                  General ENS updates (blog posts, protocol updates, etc.).
                </p>
              </div>
              <Switch
                checked={settings.ensLabsUpdates}
                disabled={!hasVerifiedChannels}
                onCheckedChange={(checked) =>
                  handlePreferenceChange({ ensLabsUpdates: checked })
                }
              />
            </div>

            {hasVerifiedChannels && (
              <p className="text-muted-foreground text-xs">
                Delivery channels:{' '}
                {verifiedChannels.map((c) => c.label).join(', ')}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
