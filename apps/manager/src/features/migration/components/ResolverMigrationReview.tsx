import { Trans } from '@lingui/react/macro'
import { ChevronDown, CircleAlert } from 'lucide-react'
import { useId } from 'react'
import type { MigrationResolverReview } from '../service/migrationResolverReview'

export const ResolverMigrationReview = ({
  review,
}: {
  readonly review: MigrationResolverReview
}) => {
  const titleId = useId()
  if (review.groups.length === 0) return null
  const hasUnsupported = review.groups.some(
    ({ kind }) => kind === 'unsupported',
  )

  return (
    <section
      aria-labelledby={titleId}
      className="w-full max-w-189 rounded-xl border border-ens-garnet-900/15 bg-white/40 p-4 text-ens-garnet-900 text-sm leading-5"
    >
      <div className="flex items-start gap-2">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 space-y-2">
          <h2 className="font-medium" id={titleId}>
            <Trans>Some records will stay on their current resolvers</Trans>
          </h2>
          {hasUnsupported ? (
            <p>
              <Trans>
                We can&apos;t automatically copy records from some of these
                resolvers. We can&apos;t verify that they will keep working or
                let you edit records after the upgrade. Review the affected
                names before continuing.
              </Trans>
            </p>
          ) : (
            <p>
              <Trans>
                These subnames will keep their existing resolvers. Their records
                will not be copied to a new resolver by this upgrade.
              </Trans>
            </p>
          )}
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ens-garnet-900 [&::-webkit-details-marker]:hidden">
              <Trans>Show affected names and resolvers</Trans>
              <ChevronDown
                aria-hidden="true"
                className="size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
              />
            </summary>
            <ul className="space-y-4 pt-1">
              {review.groups.map(({ resolver, kind, names }) => (
                <li className="min-w-0 space-y-1" key={resolver}>
                  <p className="font-medium">
                    {kind === 'unsupported' ? (
                      <Trans>Automatic record copying is unavailable</Trans>
                    ) : (
                      <Trans>Subnames keep this resolver</Trans>
                    )}
                  </p>
                  <code className="block break-all text-xs">{resolver}</code>
                  <p className="wrap-anywhere">{names.join(', ')}</p>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    </section>
  )
}
