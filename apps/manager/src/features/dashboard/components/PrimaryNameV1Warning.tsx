import { Trans } from '@lingui/react/macro'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface PrimaryNameV1WarningProps {
  readonly isV1Error: boolean
  readonly v1NameCount: number
}

export const PrimaryNameV1Warning = ({
  isV1Error,
  v1NameCount,
}: PrimaryNameV1WarningProps) => {
  if (!isV1Error && v1NameCount === 0) return null

  return (
    <Alert variant="warning">
      <AlertCircle />
      <AlertTitle className="line-clamp-none">
        <Trans>Only ENSv2 Names Supported</Trans>
      </AlertTitle>
      <AlertDescription>
        <Trans>
          You own names that need to be upgraded to ENSv2 before they can be set
          as your Primary Name
        </Trans>
      </AlertDescription>
    </Alert>
  )
}
