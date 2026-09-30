import { Trans } from '@lingui/react/macro'
import { Wallet } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { truncateAddress } from '@/lib/utils'
import { RegisterV2Context } from '../../../state/registrationUi.context'

/**
 * Shown on the pricing screen when a stored registration for this name exists
 * and no wallet is connected, to say which wallet picks it back up. Connecting
 * that wallet resumes the flow on its own. A different connected wallet sees
 * nothing: the registration is not theirs, so it stays out of sight until its
 * owner reconnects.
 */
export const ResumeConnectWalletBanner = () => {
  const { resume, label } = RegisterV2Context.use()

  if (resume.status !== 'no-wallet') return null

  return (
    <Alert variant="warning">
      <Wallet className="h-4 w-4" />
      <AlertTitle>
        <Trans>Unfinished registration</Trans>
      </AlertTitle>
      <AlertDescription>
        <Trans>
          Connect wallet {truncateAddress(resume.expectedOwner)} to resume
          registering {label}.eth. Starting over from another wallet would
          abandon the payment already made.
        </Trans>
      </AlertDescription>
    </Alert>
  )
}
