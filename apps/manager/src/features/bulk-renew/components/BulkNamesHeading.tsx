import { Plural, Trans } from '@lingui/react/macro'
import type { ReactNode } from 'react'

/** Heads the bulk payment sheet with the count and duration; the names were reviewed on the step before. */
export const BulkNamesHeading = ({
  count,
  durationLabel,
  isUntilDate,
  onChangeDuration,
}: {
  readonly count: number
  readonly durationLabel: ReactNode
  /** A "renew to date" choice reads "until"; a preset reads "for". */
  readonly isUntilDate: boolean
  /** Returns to the duration step. */
  readonly onChangeDuration: () => void
}) => {
  const duration = (
    <button
      className="rounded-xs text-ens-lapis-core underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ens-lapis-core"
      onClick={onChangeDuration}
      type="button"
    >
      {durationLabel}
    </button>
  )
  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-1 px-5 text-center">
      <span className="font-medium font-semi-mono text-2xl text-ens-gray leading-ens-none">
        <Plural one="# name" other="# names" value={count} />
      </span>
      <span className="font-sans text-ens-quartz-500 text-sm">
        {isUntilDate ? (
          <Trans>until {duration}</Trans>
        ) : (
          <Trans>for {duration}</Trans>
        )}
      </span>
    </div>
  )
}
