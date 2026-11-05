import { Trans } from '@lingui/react/macro'

/** Why renewal's figures read "up to": the approval's 2% buffer (`authorizedPaymentAmount`). */
export const RenewalBufferNote = () => (
  <Trans>
    Includes a 2% buffer, since the renewal price is set when the renewal runs.
    Anything not used stays in your account.
  </Trans>
)
