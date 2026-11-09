import { match } from 'ts-pattern'
import {
  getNameStatus,
  MS_PER_DAY,
  type NameStatusInput,
} from '@/features/renew/utils/nameExtension'

export type PaletteNameRow = NameStatusInput & {
  readonly id: string
  readonly isSelectable: boolean
}

export type PaletteSelectionMode = 'shown' | 'expiring' | 'grace'

export const isSamePaletteSelection = (
  expected: readonly string[],
  current: readonly string[],
) =>
  expected.length === current.length &&
  expected.every((id) => current.includes(id))

export const selectPaletteNameRows = ({
  rows,
  mode,
  now,
}: {
  readonly rows: readonly PaletteNameRow[]
  readonly mode: PaletteSelectionMode
  readonly now: Date
}): Record<string, boolean> =>
  Object.fromEntries(
    rows
      .filter((row) => row.isSelectable)
      .filter((row) =>
        match(mode)
          .with('shown', () => true)
          .with('grace', () => getNameStatus(row, now) === 'grace')
          .with(
            'expiring',
            () =>
              getNameStatus(row, now) === 'registered' &&
              row.expiryDate != null &&
              row.expiryDate.getTime() >= now.getTime() &&
              row.expiryDate.getTime() <= now.getTime() + 30 * MS_PER_DAY,
          )
          .exhaustive(),
      )
      .map(({ id }) => [id, true]),
  )
