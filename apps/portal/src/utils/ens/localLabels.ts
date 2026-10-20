import { checkLabel, saveName } from '@ensdomains/ensjs/utils'
import { type Hex, labelhash } from 'viem'
import { isEncodedLabelhash } from '@/utils/token/isNormalized'

// ensjs keeps labels by labelhash in localStorage (`ensjs:labels`), the cache
// the legacy app fills too. A label no indexer knows heals once it is opened.

/** Remembers the labels of a name the user opened, for {@link healSubname}. */
export const rememberName = (name: string) => {
  try {
    saveName(name)
  } catch {
    // Storage full or blocked: the name just stays unhealed elsewhere.
  }
}

const readLabel = (encoded: string) => {
  try {
    return checkLabel(encoded)
  } catch {
    return encoded
  }
}

/**
 * Swaps a subname's own `[labelhash]` label for the one this browser has seen,
 * only when it is the row's real labelhash: a label written literally as
 * `[<hex>]` is served the same way (WEB-1458) and must stay as written.
 */
export const healSubname = (name: string, rowLabelhash: Hex | undefined) => {
  const [encoded = '', ...parent] = name.split('.')
  if (
    !rowLabelhash ||
    !isEncodedLabelhash(encoded) ||
    `0x${encoded.slice(1, -1)}` !== rowLabelhash.toLowerCase()
  )
    return name
  const label = readLabel(encoded)
  return label !== encoded && labelhash(label) === rowLabelhash.toLowerCase()
    ? [label, ...parent].join('.')
    : name
}
