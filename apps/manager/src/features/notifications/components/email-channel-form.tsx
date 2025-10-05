import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, Mail } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addEmailChannelMutationOptions } from '../queries/channels'

interface EmailChannelFormProps {
  onSuccess: () => void
  onCancel: () => void
}

export function EmailChannelForm({
  onSuccess,
  onCancel,
}: EmailChannelFormProps) {
  const [email, setEmail] = useState('')
  const addEmailChannelMutation = useMutation(addEmailChannelMutationOptions)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email.trim()) {
      toast.error('Please enter an email address')
      return
    }

    addEmailChannelMutation.mutate(
      { email: email.trim() },
      {
        onSuccess: () => {
          toast.success('Verification email sent! Check your inbox.')
          onSuccess()
        },
        onError: (error: any) => {
          const errorMessage = error?.message || 'Failed to add email channel'
          toast.error(errorMessage)
        },
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email Address</Label>
        <div className="relative">
          <Mail className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
          {/** biome-ignore lint/correctness/useUniqueElementIds: <explanation> */}
          <Input
            id="email"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-10"
            disabled={addEmailChannelMutation.isPending}
            required
          />
        </div>
      </div>

      <Alert>
        <Mail className="h-4 w-4" />
        <AlertDescription>
          We'll send a verification email to confirm this address. Check your
          spam folder if you don't see it.
        </AlertDescription>
      </Alert>

      <div className="flex gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={addEmailChannelMutation.isPending}
          className="flex-1"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          type="submit"
          disabled={addEmailChannelMutation.isPending || !email.trim()}
          className="flex-1"
        >
          {addEmailChannelMutation.isPending
            ? 'Sending...'
            : 'Send Verification'}
        </Button>
      </div>
    </form>
  )
}
