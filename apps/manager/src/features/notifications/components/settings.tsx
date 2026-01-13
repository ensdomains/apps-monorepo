import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Plus, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { channelsQueryOptions } from '../queries/channels'
import { AddChannelModal } from './channels/add-channel-modal'
import { ChannelCard } from './channels/channel-card'

export function NotificationSettings() {
  const { data: channels = [], isLoading } = useQuery(channelsQueryOptions)
  const [showAddModal, setShowAddModal] = useState(false)

  const verifiedChannels = channels.filter(
    (channel) => channel.status === 'verified',
  )
  const hasVerifiedChannels = verifiedChannels.length > 0

  return (
    <div className="space-y-6">
      {/* Global warning banner */}
      {!hasVerifiedChannels && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="block h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <div className="flex items-center justify-between gap-2">
              <span>Add a delivery channel to receive critical alerts</span>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Channels Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Delivery Channels
              </CardTitle>
              <CardDescription>
                Manage where you receive notifications
              </CardDescription>
            </div>
            <Button onClick={() => setShowAddModal(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Channel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div
                  className="h-16 animate-pulse rounded-lg bg-muted"
                  key={i}
                />
              ))}
            </div>
          ) : channels.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Smartphone className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <p>No delivery channels configured</p>
              <p className="text-sm">
                Add an email or Telegram channel to receive notifications
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {channels.map((channel) => (
                <ChannelCard channel={channel} key={channel.id} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Channel Modal */}
      <AddChannelModal onOpenChange={setShowAddModal} open={showAddModal} />
    </div>
  )
}
