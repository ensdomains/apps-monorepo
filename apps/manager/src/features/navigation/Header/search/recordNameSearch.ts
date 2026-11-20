import { getAnalyticsNameProperties } from '@ens-apps/utils/posthog/nameProperties'
import { track } from '@/lib/posthog/events'

export const recordNameSearch = (name: string) => {
  try {
    const normalizedName = name.trim().toLowerCase()
    track('name_search:result_select', {
      ...getAnalyticsNameProperties(name),
      source: 'header_search',
      result_type: 'name',
      name_length: normalizedName.length,
    })
    track('name:search_selected', {
      name: normalizedName,
      source: 'header_search',
    })
  } catch {
    // Non-critical analytics write — ignore failures.
  }
}
