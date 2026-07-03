import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { getDurationInSecondsFromYears } from '@/features/register-v2/utils/time'

type DurationPresetStyle = 'citrine' | 'peridot' | 'garnet'

export type DurationPresetOption = {
  years: number
  title: MessageDescriptor
  subtitle: MessageDescriptor
  kind: 'default' | 'mostPopular'
  color: DurationPresetStyle
}

export type DurationPresetData = DurationPresetOption & {
  duration: number
}

export const PRESET_YEAR_OPTIONS: DurationPresetOption[] = [
  {
    years: 1,
    title: msg`Starter`,
    subtitle: msg`Try it out`,
    kind: 'default',
    color: 'citrine',
  },
  {
    years: 3,
    title: msg`Committed`,
    subtitle: msg`Make it yours`,
    kind: 'mostPopular',
    color: 'peridot',
  },
  {
    years: 6,
    title: msg`Long-term identity`,
    subtitle: msg`Best yearly price`,
    kind: 'default',
    color: 'garnet',
  },
]

export const getComputedDurationPresets = (
  referenceDate?: Date,
): DurationPresetData[] =>
  PRESET_YEAR_OPTIONS.map((preset) => ({
    ...preset,
    duration: getDurationInSecondsFromYears(preset.years, referenceDate),
  }))
