import { Trans } from '@lingui/react/macro'
import { CircleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface PrimaryNameV1WarningProps {
  readonly isError: boolean
  readonly upgradeableNameCount: number
}

export const PrimaryNameV1Warning = ({
  isError,
  upgradeableNameCount,
}: PrimaryNameV1WarningProps) => {
  if (!isError && upgradeableNameCount === 0) return null

  return (
    <Alert icon={<CircleAlert className="size-4" />} variant="warning">
      <AlertTitle>
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
