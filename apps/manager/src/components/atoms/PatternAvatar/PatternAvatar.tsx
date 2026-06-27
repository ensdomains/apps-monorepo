import {
  generatePatternDataURI,
  type PatternName,
  type PatternOptions,
} from '@ensdomains/etherloom'
import { useMemo } from 'react'

import { tw } from '@/utils/tailwind'

const etherloomPattern: PatternName = 'ENS Vertical Pairs'
const etherloomColor = '#0080BC'
const etherloomOptions = {
  cellSize: 8,
  height: 96,
  width: 96,
} satisfies PatternOptions

export type PatternAvatarProps = {
  readonly name: string
  readonly className?: string
}

export const PatternAvatar = ({ name, className }: PatternAvatarProps) => {
  const src = useMemo(
    () =>
      generatePatternDataURI(
        name,
        etherloomPattern,
        etherloomColor,
        etherloomOptions,
      ),
    [name],
  )

  return (
    <div
      className={tw(
        'flex h-full w-full items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-100 p-1 shadow-inner',
        className,
      )}
    >
      <img
        alt={`${name} pattern`}
        className="h-full w-full object-cover"
        draggable={false}
        src={src}
      />
    </div>
  )
}
