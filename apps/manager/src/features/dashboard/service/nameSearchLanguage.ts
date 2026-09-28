type NegativeFacet = 'favorites' | 'primary'

const property =
  '(?:(?:my|the|any)\\s+)?(?:(?:favou?rites?|starred|bookmarked)(?:\\s+names?)?|(?:primary|main|reverse)(?:\\s+names?)?)'
const boundary = '(?![\\p{L}\\p{N}_@/:-])'
const negativePairs = [
  new RegExp(
    `\\bneither\\s+(${property})\\s+nor\\s+(${property})${boundary}`,
    'giu',
  ),
  new RegExp(
    `\\b(?:not|aren['’]t|isn['’]t|without)\\s+either\\s+(${property})\\s+or\\s+(${property})${boundary}`,
    'giu',
  ),
  new RegExp(
    `\\b(?:exclude|excluding|except|without)\\s+both\\s+(${property})\\s+and\\s+(${property})${boundary}`,
    'giu',
  ),
]

const readNegativeFacet = (text: string): NegativeFacet =>
  /\b(?:favou?rites?|starred|bookmarked)\b/i.test(text)
    ? 'favorites'
    : 'primary'

const normalizeNegativePair = (text: string): string =>
  negativePairs.reduce(
    (current, pattern) =>
      current.replace(
        pattern,
        (original: string, first: string, second: string, offset: number) => {
          if (
            /\b(?:not|never|without|don['’]t|isn['’]t|aren['’]t)\s+$/i.test(
              current.slice(0, offset),
            )
          )
            return original
          const left = readNegativeFacet(first)
          const right = readNegativeFacet(second)
          return left === right ? original : `not ${left} and not ${right}`
        },
      ),
    text,
  )

/**
 * A shared negation of either supported property excludes both properties.
 * Bare "not favourites or primary" stays ambiguous and is never rewritten.
 * Exact identifiers and quoted profile values retain their original bytes.
 */
export const normalizeNegativeNameSelection = (query: string): string =>
  query
    .split(/("[^"]*"|“[^”]*”|‘[^’]*’|(?<![\p{L}\p{N}])'[^']*'|\S*[.@/]\S+)/gu)
    .map((part, index) =>
      index % 2 === 0 ? normalizeNegativePair(part) : part,
    )
    .join('')
