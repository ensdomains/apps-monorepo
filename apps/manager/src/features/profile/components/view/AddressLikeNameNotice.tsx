import { isAddressLikeName } from '@ens-apps/utils/addressLikeName'
import { Trans } from '@lingui/react/macro'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

/** Warns that a name shaped like a wallet address may resolve elsewhere. */
export const AddressLikeNameNotice = ({
  className,
  name,
}: {
  readonly className?: string
  readonly name: string
}) =>
  isAddressLikeName(name) ? (
    <Alert className={className} variant="warning">
      <AlertTitle>
        <Trans>This name looks like a wallet address</Trans>
      </AlertTitle>
      <AlertDescription>
        <Trans>
          Note: This name may resolve to another address, confirm the final
          address is the intended address.
        </Trans>
      </AlertDescription>
    </Alert>
  ) : null
