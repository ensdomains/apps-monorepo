import { Trans } from '@lingui/react/macro'
import { zeroAddress } from 'viem'
import type { CopyClassifiedName } from '../service/classifyNames'

export const IncludedSubnameDetails = ({
  subname,
}: {
  readonly subname: CopyClassifiedName
}) => (
  <dl className="mt-1 ml-10 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-ens-garnet-900 text-xs leading-5">
    <dt className="text-ens-garnet-900/60">
      <Trans>Owner</Trans>
    </dt>
    <dd className="break-all font-semi-mono">{subname.tokenHolder}</dd>
    <dt className="text-ens-garnet-900/60">
      <Trans>Resolver</Trans>
    </dt>
    <dd className="break-all font-semi-mono">
      {subname.v1ResolverAddress &&
      subname.v1ResolverAddress.toLowerCase() !== zeroAddress ? (
        subname.v1ResolverAddress
      ) : (
        <Trans>Not set</Trans>
      )}
    </dd>
  </dl>
)
