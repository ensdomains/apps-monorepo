import { decryptName, saveName } from '@ensdomains/ensjs/utils'

// ensjs keeps labels by labelhash in localStorage (`ensjs:labels`), the cache
// the legacy app fills too. A label no indexer knows heals once it is opened.

/** Remembers the labels of a name the user opened, for {@link healName}. */
export const rememberName = (name: string) => {
  try {
    saveName(name)
  } catch {
    // Storage full or blocked: the name just stays unhealed elsewhere.
  }
}

/** Swaps each `[labelhash]` label this browser has seen for the label itself. */
export const healName = (name: string) => {
  try {
    return decryptName(name)
  } catch {
    return name
  }
}
