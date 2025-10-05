import { useMutation } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle,
  Clock,
  ExternalLink,
  Mail,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  TestTube,
  Trash2,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  type Channel,
  deleteChannelMutationOptions,
  testChannelMutationOptions,
} from '../queries/channels'

interface ChannelCardProps {
  channel: Channel
}

const channelIcons = {
  email: Mail,
  telegram: MessageSquare,
  web_push: MessageSquare, // Placeholder
} as const

const statusConfig = {
  verified: {
    icon: CheckCircle,
    label: 'Verified',
    variant: 'default' as const,
    className: 'text-green-600 bg-green-50 border-green-200',
  },
  pending: {
    icon: Clock,
    label: 'Pending',
    variant: 'secondary' as const,
    className: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  },
  unsubscribed: {
    icon: XCircle,
    label: 'Unsubscribed',
    variant: 'destructive' as const,
    className: 'text-red-600 bg-red-50 border-red-200',
  },
  bounced: {
    icon: AlertCircle,
    label: 'Bounced',
    variant: 'destructive' as const,
    className: 'text-red-600 bg-red-50 border-red-200',
  },
} as const

export function ChannelCard({ channel }: ChannelCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const deleteChannelMutation = useMutation(deleteChannelMutationOptions)
  const testChannelMutation = useMutation(testChannelMutationOptions)

  const Icon =
    channelIcons[channel.channel as keyof typeof channelIcons] || MessageSquare
  const status =
    statusConfig[channel.status as keyof typeof statusConfig] ||
    statusConfig.pending
  const StatusIcon = status.icon

  const handleTest = async () => {
    testChannelMutation.mutate(channel.id, {
      onSuccess: () => {
        toast.success('Test notification sent successfully')
      },
      onError: () => {
        toast.error('Failed to send test notification')
      },
    })
  }

  const handleDelete = async () => {
    deleteChannelMutation.mutate(channel.id, {
      onSuccess: () => {
        toast.success('Channel removed successfully')
        setShowDeleteDialog(false)
      },
      onError: () => {
        toast.error('Failed to remove channel')
      },
    })
  }

  const formatLastSent = (lastSentAt: string | null) => {
    if (!lastSentAt) return 'Never'
    const date = new Date(lastSentAt)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return date.toLocaleDateString()
  }

  return (
    <>
      <Card className="transition-shadow hover:shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium capitalize">
                    {channel.channel}
                  </span>
                  <Badge
                    variant={status.variant}
                    className={`text-xs ${status.className}`}
                  >
                    <StatusIcon className="mr-1 h-3 w-3" />
                    {status.label}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-sm">{channel.label}</p>
                {channel.last_sent_at && (
                  <p className="text-muted-foreground text-xs">
                    Last sent: {formatLastSent(channel.last_sent_at)}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {channel.status === 'verified' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTest}
                  disabled={testChannelMutation.isPending}
                >
                  <TestTube className="mr-1 h-4 w-4" />
                  {testChannelMutation.isPending ? 'Testing...' : 'Test'}
                </Button>
              )}

              {channel.status === 'pending' &&
                channel.channel === 'telegram' && (
                  <Button size="sm" variant="outline" asChild>
                    <a
                      href={`https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'ensnotifications_bot'}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="mr-1 h-4 w-4" />
                      Start Bot
                    </a>
                  </Button>
                )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {channel.status === 'pending' && (
                    <DropdownMenuItem>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Resend Verification
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setShowDeleteDialog(true)}
                    className="text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Channel</AlertDialogTitle>
            <AlertDialogDescription>
              You may miss important alerts if you remove this channel. Are you
              sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
