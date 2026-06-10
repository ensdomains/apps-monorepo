import type { MaterialSymbol } from '@/components/ui/material-symbol'
import type { ProfileRecords, TextRecordValue } from '@/features/profile/types'

export const generalShortcuts = [
  { field: 'avatar', label: 'Profile picture', symbol: 'face' },
  { field: 'header', label: 'Banner', symbol: 'wall_art' },
  { field: 'url', label: 'Custom link', symbol: 'link' },
  { field: 'description', label: 'Description', symbol: 'text_ad' },
  { field: 'name', label: 'Full name', symbol: 'badge' },
  { field: 'location', label: 'Location', symbol: 'add_location_alt' },
  { field: 'timezone', label: 'Timezone', symbol: 'captive_portal' },
  { field: 'language', label: 'Language', symbol: 'language' },
] as const satisfies readonly {
  field: string
  label: string
  symbol: MaterialSymbol
}[]

export type GeneralField = (typeof generalShortcuts)[number]['field']

export const getTextRecordValue = (
  records: readonly TextRecordValue[],
  key: string,
) => records.find((record) => record.key === key)?.value ?? ''

export const getDefaultVisibleFields = (
  records: ProfileRecords,
): ReadonlySet<GeneralField> =>
  new Set(
    generalShortcuts
      .map(({ field }) => field)
      .filter((field) => {
        if (
          field === 'avatar' ||
          field === 'header' ||
          field === 'url' ||
          field === 'description'
        ) {
          return true
        }

        if (field === 'name') {
          return false
        }

        if (field === 'location' || field === 'timezone') {
          return getTextRecordValue(records.contact, field).trim() !== ''
        }

        return (records.base[field] ?? '').trim() !== ''
      }),
  )
