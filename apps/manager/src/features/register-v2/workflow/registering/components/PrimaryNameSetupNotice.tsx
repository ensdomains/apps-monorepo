import { Trans } from '@lingui/react/macro'
import { CircleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { RegisterV2Context } from '../../../state/registrationUi.context'

const usePostRegistrationSetupFailed = RegisterV2Context.createSelector(
  (state) => state.context.postRegistrationSetupFailed,
)

/**
 * Shown when the name registered successfully but the optional primary-name
 * setup step failed or was rejected in the wallet.
 */
export const PrimaryNameSetupNotice = () => {
  const { uiActor } = RegisterV2Context.use()
  const setupFailed = usePostRegistrationSetupFailed(uiActor)

  if (!setupFailed) return null

  return (
    <Alert icon={<CircleAlert className="size-4" />} variant="warning">
      <AlertDescription>
        <Trans>
          Your name was registered, but we couldn't set it as your primary name.
          You can set it anytime from your profile.
        </Trans>
      </AlertDescription>
    </Alert>
  )
}
