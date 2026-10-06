import type { IneligibleName } from '@ens-apps/migration'
import { Trans } from '@lingui/react/macro'

export const UnavailableMigrationNames = ({
  names,
}: {
  readonly names: readonly IneligibleName[]
}) => {
  if (names.length === 0) return null
  return (
    <ul className="w-full max-w-160 space-y-2 text-ens-garnet-900 text-sm">
      {names.map(({ domain, reason }) => (
        <li key={domain.id}>
          <span className="font-medium">{domain.name}</span>
          {': '}
          {reason === 'not-reserved' ? (
            <Trans>No ENSv2 reservation is available for this name yet.</Trans>
          ) : (
            <Trans>No ENSv1 registration was found for this name.</Trans>
          )}
        </li>
      ))}
    </ul>
  )
}
