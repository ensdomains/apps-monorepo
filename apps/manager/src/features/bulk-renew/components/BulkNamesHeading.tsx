import { Plural } from '@lingui/react/macro'
import type { ReactNode } from 'react'

/** Heads the bulk payment sheet with the count and duration; the names were reviewed on the step before. */
export const BulkNamesHeading = ({
  count,
  durationLabel,
}: {
  readonly count: number
  readonly durationLabel: ReactNode
}) => (
  <div className="flex w-full min-w-0 flex-col items-center gap-1 px-5 text-center">
    <span className="font-medium font-semi-mono text-2xl text-ens-gray leading-ens-none">
      <Plural one="# name" other="# names" value={count} />
    </span>
    <span className="font-sans text-ens-quartz-500 text-sm">
      for <span className="text-ens-lapis-core">{durationLabel}</span>
    </span>
  </div>
)
