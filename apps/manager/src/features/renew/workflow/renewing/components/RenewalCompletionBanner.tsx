import { Trans } from '@lingui/react/macro'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export const RenewalCompletionBanner = () => (
  <Alert variant="success">
    <AlertTitle>
      <Trans>Renewal Complete!</Trans>
    </AlertTitle>
    <AlertDescription>
      <Trans>The ENS domain has been successfully renewed.</Trans>
    </AlertDescription>
  </Alert>
)
