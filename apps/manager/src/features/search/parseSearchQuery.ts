import { type Address, isAddress } from 'viem'
import { normalize } from 'viem/ens'
import type { ParsedSearchQuery } from './search.types'

export const parseSearchQuery = (input: string): ParsedSearchQuery => {
  const trimmed = input.trim()
  if (!trimmed) return { type: 'empty' }

  if (isAddress(trimmed, { strict: false })) {
    return { type: 'address', value: trimmed.toLowerCase() as Address }
  }

  const candidate = /\.eth$/i.test(trimmed) ? trimmed : `${trimmed}.eth`

  try {
    return { type: 'name', value: normalize(candidate) }
  } catch {
    return { type: 'name', value: candidate.toLowerCase() }
  }
}
