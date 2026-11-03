import { Trans } from '@lingui/react/macro'
import { match } from 'ts-pattern'

/** Below the receipt once a renewal's payment went up: before and after the user accepts it. */
export const PaymentUpdateNotice = ({
  status,
  needsApproval,
}: {
  readonly status: 'reviewing' | 'accepted'
  /** The wallet signs a payment approval before the renewal itself. */
  readonly needsApproval: boolean
}) => (
  <div className="flex w-full flex-col gap-1" role="status">
    <p className="font-medium text-ens-quartz-900 text-sm">
      <Trans>Payment amount updated</Trans>
    </p>
    <p className="text-ens-quartz-500 text-sm">
      {match({ status, needsApproval })
        .with({ status: 'reviewing' }, () => (
          <Trans>
            The amount due increased. Review the updated total before signing.
          </Trans>
        ))
        .with({ needsApproval: true }, () => (
          <Trans>
            Confirm the payment approval and renewal in your wallet.
          </Trans>
        ))
        .otherwise(() => (
          <Trans>Confirm the renewal in your wallet.</Trans>
        ))}
    </p>
  </div>
)
