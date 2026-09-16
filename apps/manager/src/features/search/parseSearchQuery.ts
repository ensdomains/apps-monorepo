import { type Address, isAddress } from 'viem'
import { normalize } from 'viem/ens'
import type { ParsedSearchQuery } from './search.types'

export const parseSearchQuery = (input: string): ParsedSearchQuery => {
  const trimmed = input.trim()
  if (!trimmed) return { type: 'empty' }

  if (isAddress(trimmed, { strict: false })) {
    return { type: 'address', value: trimmed.toLowerCase() as Address }
  }

  // Only bare labels get the convenient `.eth` suffix. A dotted input is
  // already a complete name, so preserve it to allow unsupported TLDs to be
  // classified instead of turning `name.xyz` into `name.xyz.eth`.
  const candidate = trimmed.includes('.') ? trimmed : `${trimmed}.eth`

  try {
    return { type: 'name', value: normalize(candidate) }
  } catch {
    return { type: 'invalid', value: candidate.toLowerCase() }
  }
}
