import { backendClient } from '@/utils/backend-client'

/**
 * Fire-and-forget search capture feeding the "unique searches in the last 30
 * days" stat on the price-cooldown banner. Deduped server-side per searcher
 * per day, so calling on every suggestion click is safe. Never blocks or
 * fails navigation.
 */
export const recordNameSearch = (name: string) => {
  backendClient.names[':name'].searches.$post({ param: { name } }).catch(() => {
    // Non-critical analytics write — ignore failures.
  })
}
