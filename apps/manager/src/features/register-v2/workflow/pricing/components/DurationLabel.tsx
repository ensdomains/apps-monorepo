import { Plural } from '@lingui/react/macro'
import { Fragment } from 'react'
import {
  type DurationDisplayParts,
  getDurationDisplayParts,
} from '@/features/register-v2/utils/time'

const renderPart = (
  unit: keyof DurationDisplayParts,
  value: number,
  index: number,
) => {
  if (value <= 0) {
    return null
  }

  return (
    <Fragment key={`${unit}-${value.toString()}`}>
      {index > 0 ? ' ' : null}
      {unit === 'years' ? (
        <Plural one="# year" other="# years" value={value} />
      ) : null}
      {unit === 'months' ? (
        <Plural one="# month" other="# months" value={value} />
      ) : null}
      {unit === 'weeks' ? (
        <Plural one="# week" other="# weeks" value={value} />
      ) : null}
      {unit === 'days' ? (
        <Plural one="# day" other="# days" value={value} />
      ) : null}
    </Fragment>
  )
}

export const DurationLabel = ({
  duration,
  referenceDate,
}: {
  duration: number
  referenceDate?: Date
}) => {
  const parts = getDurationDisplayParts(duration, referenceDate)
  const orderedParts = [
    ['years', parts.years],
    ['months', parts.months],
    ['weeks', parts.weeks],
    ['days', parts.days],
  ] as const
  const nonZeroParts = orderedParts.filter(([, value]) => value > 0)

  return nonZeroParts.map(([unit, value], index) =>
    renderPart(unit, value, index),
  )
}
