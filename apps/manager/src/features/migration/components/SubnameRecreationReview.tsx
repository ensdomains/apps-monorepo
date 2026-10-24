import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { useId } from 'react'
import { CopyableButton } from '@/components/atoms/CopyableButton/CopyableButton'
import { MSymbol } from '@/components/ui/material-symbol'
import { cn, truncateAddress } from '@/lib/utils'
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
  const { t } = useLingui()
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
    { dateStyle: 'medium', timeStyle: 'short' },
  )

  return (
    <section
      aria-labelledby={titleId}
      className="motion-safe:fade-in w-full max-w-189 shrink-0 rounded-xl border border-ens-garnet-900/10 bg-white/60 p-4 text-ens-garnet-900 motion-safe:animate-in motion-safe:duration-200 sm:p-5"
    >
      <h2 className="font-medium text-base" id={titleId}>
        <Plural
          one="Review # subname"
          other="Review # subnames"
          value={children.length}
        />
      </h2>
      <div
        className="mt-2 space-y-2 text-ens-garnet-900/75 text-sm leading-relaxed"
        id={descriptionId}
      >
        <p>
          <Trans>
            Subnames keep the owners and resolvers shown below. You retain
            control through the parent name.
          </Trans>
        </p>
      </div>
      <ul className="my-3 max-h-72 divide-y divide-ens-garnet-900/10 overflow-y-auto border-ens-garnet-900/10 border-y">
        {children.map((child) => (
          <li className="py-3" key={child.domain.id}>
            <p className="wrap-anywhere font-medium text-sm">
              {child.domain.name}
            </p>
            <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-xs leading-5">
              <div className="flex items-center gap-2">
                <dt className="text-ens-garnet-900/70">
                  <Trans>Owner</Trans>
                </dt>
                <dd>
                  <CopyableButton
                    aria-label={t`Copy owner ${child.tokenHolder}`}
                    className="h-8 px-1 font-semi-mono text-xs hover:bg-ens-garnet-900/5"
                    value={child.tokenHolder}
                    variant="ghost"
                  >
                    {truncateAddress(child.tokenHolder)}
                  </CopyableButton>
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="text-ens-garnet-900/70">
                  <Trans>Resolver</Trans>
                </dt>
                <dd>
                  {child.v1ResolverAddress ? (
                    <CopyableButton
                      aria-label={t`Copy resolver ${child.v1ResolverAddress}`}
                      className="h-8 px-1 font-semi-mono text-xs hover:bg-ens-garnet-900/5"
                      value={child.v1ResolverAddress}
                      variant="ghost"
                    >
                      {truncateAddress(child.v1ResolverAddress)}
                    </CopyableButton>
                  ) : (
                    <Trans>No resolver set</Trans>
                  )}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
      <p className="text-ens-garnet-900/75 text-xs leading-relaxed">
        <Trans>
          We check again before sending. Changes during signing or confirmation
          may be missed. Later ENSv1 changes will not sync to these subnames.
        </Trans>
      </p>
      <details className="text-ens-garnet-900/70 text-xs">
        <summary className="min-h-11 cursor-pointer py-3 font-medium focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ens-garnet-900">
          <Trans>Checked {cutoff}</Trans>
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
          className="peer sr-only"
          onChange={(event) => onReviewChange(event.target.checked)}
          type="checkbox"
        />
        <span
          aria-hidden
          className={cn(
            'mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-sm border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ens-garnet-900 peer-focus-visible:ring-offset-2',
            isReviewed
              ? 'border-ens-garnet-500 bg-ens-garnet-500'
              : 'border-ens-quartz-500',
          )}
        >
          <MSymbol
            className={cn(
              'size-3.25 text-xs leading-none',
              isReviewed ? 'text-ens-garnet-100' : 'text-transparent',
            )}
            symbol="check"
          />
        </span>
        <span>
          <Trans>
            I have reviewed these owners, resolvers and snapshot timing.
          </Trans>
        </span>
      </label>
    </section>
  )
}
