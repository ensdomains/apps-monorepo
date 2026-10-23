import { authorizedPaymentAmount } from '@ens-apps/transaction-manager/machines/registration/registration.actors'
import { Trans } from '@lingui/react/macro'

/** The renewer's allowance headroom, as a whole percentage, from the policy itself. */
export const RENEWAL_HEADROOM_PERCENT = Number(
  authorizedPaymentAmount(100n) - 100n,
)

export const RenewalPaymentNote = () => (
  <p className="text-ens-quartz-500 text-xs">
    <Trans>
      Includes network fees and a {RENEWAL_HEADROOM_PERCENT}% price buffer. Any
      unused funds remain available for future payments.
    </Trans>
  </p>
)
