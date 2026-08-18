import { Trans } from '@lingui/react/macro'
import { Wallet } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { truncateAddress } from '@/lib/utils'
import { RegisterV2Context } from '../../../state/registrationUi.context'

/**
 * Shown on the pricing screen when a stored registration for this name belongs
 * to a wallet other than the connected one. The resume decision is deliberately
 * un-latched in that case — connecting the expected wallet picks the flow back
 * up on its own — so the banner's only job is to say which wallet that is.
 */
export const ResumeWrongWalletBanner = () => {
  const { resume, label } = RegisterV2Context.use()

  if (resume.status !== 'wrong-wallet') return null

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
