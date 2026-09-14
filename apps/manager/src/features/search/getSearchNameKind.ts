import { normalize } from 'viem/ens'
import {
  getLabelLength,
  parseName,
} from '@/features/register-v2/utils/name-parser'
import type { SearchNameKind } from './search.types'

const ETH_TLD = 'eth'
const MIN_REGISTRABLE_LABEL_LENGTH = 3

export const getSearchNameKind = (name: string): SearchNameKind => {
  const trimmed = name.trim()
  if (!trimmed || trimmed.startsWith('.') || trimmed.endsWith('.')) {
    return { type: 'invalid', name, reason: 'invalid-format' }
  }

  let normalized: string
  try {
    normalized = normalize(trimmed)
  } catch {
    return { type: 'invalid', name: trimmed, reason: 'invalid-format' }
  }

  const parsedName = parseName(normalized)
  if (parsedName.isErr()) {
    return { type: 'invalid', name: normalized, reason: 'invalid-format' }
  }

  if (parsedName.value.tld !== ETH_TLD) {
    return {
      type: 'dns-name',
      name: normalized,
      isSubname: parsedName.value.subLabels.length > 0,
    }
  }

  const isSubname = parsedName.value.subLabels.length > 0
  if (
    !isSubname &&
    getLabelLength(parsedName.value.label) < MIN_REGISTRABLE_LABEL_LENGTH
  ) {
    return { type: 'invalid', name: normalized, reason: 'too-short' }
  }

  if (isSubname) {
    return { type: 'eth-subname', name: normalized }
  }

  return {
    type: 'eth-2ld',
    name: normalized,
    label: parsedName.value.label,
  }
}
