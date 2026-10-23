import type { IneligibleName } from '@ens-apps/migration'
import { Trans } from '@lingui/react/macro'
import { match } from 'ts-pattern'

/** Names the owner holds that cannot be upgraded, each with the reason. */
export const UnavailableMigrationNames = ({
  names,
}: {
  readonly names: readonly IneligibleName[]
}) => {
  if (names.length === 0) return null
  return (
    <section className="w-full max-w-189 text-ens-garnet-900 text-sm leading-5">
      <h2 className="font-medium">
        <Trans>These names can&apos;t be upgraded</Trans>
      </h2>
      <ul className="mt-2 flex flex-col gap-1">
        {names.map(({ domain, reason }) => (
          <li key={domain.id}>
            <span className="font-medium">{domain.name}</span>
            {': '}
            <span className="text-ens-garnet-900/75">
              {match(reason)
                .with('not-reserved', () => (
                  <Trans>it has no ENSv2 reservation.</Trans>
                ))
                .with('parent-upgraded', () => (
                  <Trans>its parent name was upgraded without it.</Trans>
                ))
                .otherwise(() => (
                  <Trans>no ENSv1 registration was found for it.</Trans>
                ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
