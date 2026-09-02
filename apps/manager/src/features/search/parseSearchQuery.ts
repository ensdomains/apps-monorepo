import { type Address, isAddress } from 'viem'
import type { ParsedSearchQuery } from './search.types'

export const parseSearchQuery = (input: string): ParsedSearchQuery => {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) return { type: 'empty' }

  if (isAddress(trimmed, { strict: false })) {
    return { type: 'address', value: trimmed as Address }
  }

  const value = trimmed.endsWith('.eth') ? trimmed : `${trimmed}.eth`
  return { type: 'name', value }
}
