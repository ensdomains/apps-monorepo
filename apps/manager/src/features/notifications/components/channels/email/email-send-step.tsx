import { Mail, XCircle } from 'lucide-react'
import { useId, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface EmailSendStepProps {
  isSendingEmail: boolean
  emailError: string | null
  onSendEmail: (email: string) => void
  onCancel: () => void
}

export function EmailSendStep({
  isSendingEmail,
  emailError,
  onSendEmail,
  onCancel,
}: EmailSendStepProps) {
  const [email, setEmail] = useState('')
  const emailId = useId()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (email.trim()) {
      onSendEmail(email.trim())
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor={emailId}>Email Address</Label>
        <div className="relative">
          <Mail className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-10"
            disabled={isSendingEmail}
            id={emailId}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            type="email"
            value={email}
          />
        </div>
      </div>

      {emailError && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{emailError}</AlertDescription>
        </Alert>
      )}

      <Alert>
        <Mail className="h-4 w-4" />
        <AlertDescription>
          We'll send a verification email to confirm this address. Check your
          spam folder if you don't see it.
        </AlertDescription>
      </Alert>

      <div className="flex gap-2 pt-4">
        <Button
          className="flex-1"
          disabled={isSendingEmail}
          onClick={onCancel}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <Button
          className="flex-1"
          disabled={isSendingEmail || !email.trim()}
          type="submit"
        >
          {isSendingEmail ? 'Sending...' : 'Send Verification'}
        </Button>
      </div>
    </form>
  )
}
