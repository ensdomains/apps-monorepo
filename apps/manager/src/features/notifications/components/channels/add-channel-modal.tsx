import { Mail, MessageSquare, Smartphone, X } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmailChannelForm } from './email'
import { TelegramChannelForm } from './telegram'

interface AddChannelModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type ChannelType = 'email' | 'telegram' | 'web_push' | null

const channelOptions = [
  {
    type: 'email' as const,
    title: 'Email',
    description: 'Receive notifications via email',
    icon: Mail,
    available: true,
  },
  {
    type: 'telegram' as const,
    title: 'Telegram',
    description: 'Get instant notifications via Telegram bot',
    icon: MessageSquare,
    available: true,
  },
  {
    type: 'web_push' as const,
    title: 'Browser Notifications',
    description: 'Push notifications in your browser',
    icon: Smartphone,
    available: false,
  },
]

export function AddChannelModal({ open, onOpenChange }: AddChannelModalProps) {
  const [selectedType, setSelectedType] = useState<ChannelType>(null)

  const handleClose = () => {
    setSelectedType(null)
    onOpenChange(false)
  }

  const handleSuccess = () => {
    handleClose()
  }

  if (selectedType) {
    return (
      <Dialog
        open={open}
        onOpenChange={() => {
          const confirmed = confirm(
            'Are you sure you want to close this modal?',
          )
          if (confirmed) {
            handleClose()
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>
                Add {selectedType === 'email' ? 'Email' : 'Telegram'} Channel
              </DialogTitle>
            </div>
            <DialogDescription>
              {selectedType === 'email'
                ? 'Enter your email address to receive notifications'
                : 'Connect your Telegram account to receive notifications'}
            </DialogDescription>
          </DialogHeader>

          {selectedType === 'email' && (
            <EmailChannelForm
              onSuccess={handleSuccess}
              onCancel={() => setSelectedType(null)}
            />
          )}

          {selectedType === 'telegram' && (
            <TelegramChannelForm
              onSuccess={handleSuccess}
              onCancel={() => setSelectedType(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Delivery Channel</DialogTitle>
          <DialogDescription>
            Choose how you'd like to receive notifications
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {channelOptions.map((option) => {
            const Icon = option.icon
            return (
              <Card
                key={option.type}
                className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                  !option.available ? 'cursor-not-allowed opacity-50' : ''
                }`}
                onClick={() => option.available && setSelectedType(option.type)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{option.title}</span>
                          {!option.available && (
                            <Badge variant="secondary" className="text-xs">
                              Coming Soon
                            </Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground text-sm">
                          {option.description}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
