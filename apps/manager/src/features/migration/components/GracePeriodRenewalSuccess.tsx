import type { V1Domain } from '@ens-apps/migration'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { Trans } from '@lingui/react/macro'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { refreshV1NameAfterRenewal } from '../service/refreshV1NameAfterRenewal'

export const GracePeriodRenewalSuccess = ({
  domain,
  minimumExpiry,
  transactionId,
  onClose,
}: {
  readonly domain: V1Domain
  readonly minimumExpiry: bigint
  readonly transactionId: string | undefined
  readonly onClose: () => void
}) => {
  const queryClient = useQueryClient()
  const refresh = useQuery({
    ...resultQueryOptions({
      queryKey: qk('migration', 'renewal_refresh', {
        renewalName: domain.name,
        transactionId,
      }),
      queryFn: () =>
        refreshV1NameAfterRenewal({ queryClient, domain, minimumExpiry }),
    }),
    retry: 2,
  })

  return (
    <div className="flex flex-col gap-4">
      <p role="status">
        <Trans>Renewal complete</Trans>
      </p>
      {refresh.isPending ? (
        <p role="status">
          <Trans>Updating your names for upgrade...</Trans>
        </p>
      ) : refresh.isError ? (
        <>
          <p role="alert">
            <Trans>
              Your renewal succeeded, but we couldn't refresh your names. Try
              refreshing again before upgrading.
            </Trans>
          </p>
          <Button onClick={() => refresh.refetch()} type="button">
            <Trans>Refresh names</Trans>
          </Button>
        </>
      ) : (
        <p>
          <Trans>
            Your name is out of grace. Return to your names to continue
            upgrading.
          </Trans>
        </p>
      )}
      <Button
        disabled={!refresh.isSuccess}
        onClick={onClose}
        type="button"
        variant="blue"
      >
        <Trans>Continue to upgrade</Trans>
      </Button>
    </div>
  )
}
