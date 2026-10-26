import { Trans } from '@lingui/react/macro'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export const RegistrationCompletionBanner = () => (
  <Alert variant="success">
    <AlertTitle>
      <Trans>Registration Complete!</Trans>
    </AlertTitle>
    <AlertDescription>
      <Trans>
        Your ENS domain has been successfully registered and is now active.
      </Trans>
    </AlertDescription>
  </Alert>
)
