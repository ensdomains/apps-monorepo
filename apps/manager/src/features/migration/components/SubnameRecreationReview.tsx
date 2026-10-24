import { Plural, Trans } from '@lingui/react/macro'
import { useId } from 'react'
import type { ClassifiedName } from '../service/classifyNames'
import type { SubnameRecreationSnapshot } from '../service/subnameRecreation'

export const SubnameRecreationReview = ({
  names,
  snapshot,
  isReviewed,
  onReviewChange,
}: {
  readonly names: readonly ClassifiedName[]
  readonly snapshot: SubnameRecreationSnapshot
  readonly isReviewed: boolean
  readonly onReviewChange: (isReviewed: boolean) => void
}) => {
  const titleId = useId()
  const descriptionId = useId()
  const roots = new Set(snapshot.roots)
  const children = names.filter(
    (name) =>
      name.action === 'copy' &&
      !!name.recreationRoot &&
      roots.has(name.recreationRoot),
  )
  if (children.length === 0) return null
  const cutoff = new Date(Number(snapshot.timestamp) * 1000).toLocaleString(
    undefined,
    { dateStyle: 'medium', timeStyle: 'long' },
  )

  return (
    <section
      aria-labelledby={titleId}
      className="motion-safe:fade-in w-full max-w-189 shrink-0 rounded-xl border border-ens-garnet-900/10 bg-white/60 p-4 text-ens-garnet-900 motion-safe:animate-in motion-safe:duration-200 sm:p-5"
    >
      <h2 className="font-medium text-base" id={titleId}>
        <Plural
          one="Review # subname included in your upgrade"
          other="Review # subnames included in your upgrade"
          value={children.length}
        />
      </h2>
      <div
        className="mt-2 space-y-2 text-ens-garnet-900/75 text-sm leading-relaxed"
        id={descriptionId}
      >
        <p>
          <Trans>
            Each subname will belong to the owner shown below and keep its
            existing resolver and records. You keep control of the parent name
            and can reclaim its subnames.
          </Trans>
        </p>
        <p>
          <Trans>
            These owners and resolvers were checked as of {cutoff}. We check
            again before sending, but changes made while you approve or while
            the transaction is pending may not be included. Later ENSv1
            transfers and resolver changes will not update these copied names.
          </Trans>
        </p>
      </div>
      <ul className="mt-4 max-h-72 divide-y divide-ens-garnet-900/10 overflow-y-auto rounded-lg border border-ens-garnet-900/10 bg-white/50 px-3">
        {children.map((child) => (
          <li className="py-3" key={child.domain.id}>
            <p className="break-all font-medium text-sm">{child.domain.name}</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs leading-5">
              <dt className="text-ens-garnet-900/65">
                <Trans>Owner</Trans>
              </dt>
              <dd className="min-w-0 break-all font-semi-mono">
                {child.tokenHolder}
              </dd>
              <dt className="text-ens-garnet-900/65">
                <Trans>Resolver</Trans>
              </dt>
              <dd className="min-w-0 break-all font-semi-mono">
                {child.v1ResolverAddress ?? <Trans>No resolver set</Trans>}
              </dd>
            </dl>
          </li>
        ))}
      </ul>
      <details className="mt-3 text-ens-garnet-900/65 text-xs">
        <summary className="min-h-11 cursor-pointer py-3 font-medium focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ens-garnet-900">
          <Trans>Snapshot details</Trans>
        </summary>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pb-3 leading-5">
          <dt>
            <Trans>Block</Trans>
          </dt>
          <dd className="tabular-nums">{snapshot.blockNumber}</dd>
          <dt>
            <Trans>Block hash</Trans>
          </dt>
          <dd className="min-w-0 break-all font-semi-mono">
            {snapshot.blockHash}
          </dd>
        </dl>
      </details>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm leading-5">
        <input
          aria-describedby={descriptionId}
          checked={isReviewed}
          className="mt-0.5 size-5 shrink-0 accent-ens-garnet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ens-garnet-900 focus-visible:ring-offset-2"
          onChange={(event) => onReviewChange(event.target.checked)}
          type="checkbox"
        />
        <span>
          <Trans>
            I have reviewed these owners, resolvers and snapshot timing.
          </Trans>
        </span>
      </label>
    </section>
  )
}
