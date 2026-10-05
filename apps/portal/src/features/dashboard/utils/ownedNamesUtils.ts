/**
 * Pure helpers for filtering and ordering "Names you own" in search.
 * Ordering: 2LD names (e.g. fox.eth, arcticfox.eth) first, then subnames (e.g. big.fox.eth), alphabetically within each group.
 */

export type OwnedName = { name: string }

/**
 * Number of labels in an ENS name (e.g. "fox.eth" -> 2, "big.fox.eth" -> 3).
 */
export function labelCount(name: string): number {
  return name.trim().split('.').length
}

/**
 * True when the name has exactly two labels (e.g. fox.eth, arcticfox.eth).
 */
export function is2LD(name: string): boolean {
  return labelCount(name) === 2
}

export type FilterAndSortOwnedNamesOptions = {
  /** Max number of names to return (default: no limit). */
  readonly max?: number
  /** Name to leave out, matched case-insensitively (default: none). */
  readonly exclude?: string
}

/**
 * Filters owned names by search query (includes, case-insensitive, trimmed),
 * drops `options.exclude` if given, and sorts: 2LD names first, then subnames (3+ labels), then alphabetically by name within each group.
 *
 * The TLD suffix (e.g. ".eth") is stripped from the query before matching so
 * that searching "dom.eth" still finds "dominico.eth".
 */
export function filterAndSortOwnedNames(
  ownedNames: OwnedName[],
  searchQuery: string,
  options: FilterAndSortOwnedNamesOptions = {},
): OwnedName[] {
  const q = searchQuery.trim().toLowerCase()
  if (!q) return []

  // Strip a short TLD-like suffix (e.g. "dom.eth" → "dom") but preserve longer
  // subname labels (e.g. "test.florin" stays "test.florin", not "test").
  const lastDot = q.lastIndexOf('.')
  const afterLastDot = lastDot >= 0 ? q.slice(lastDot + 1) : ''
  const MAX_TLD_LENGTH = 3
  const shouldStripSuffix =
    afterLastDot === '' || afterLastDot.length <= MAX_TLD_LENGTH
  const matchQuery = shouldStripSuffix && lastDot >= 0 ? q.slice(0, lastDot) : q
  if (!matchQuery) return []

  const normalized = (name: string) => name.trim().toLowerCase()

  const excluded = options.exclude ? normalized(options.exclude) : null

  const matching = ownedNames.filter(
    (d) =>
      normalized(d.name).includes(matchQuery) &&
      normalized(d.name) !== excluded,
  )

  const sorted = [...matching].sort((a, b) => {
    const a2 = is2LD(a.name)
    const b2 = is2LD(b.name)
    if (a2 && !b2) return -1
    if (!a2 && b2) return 1
    return normalized(a.name).localeCompare(normalized(b.name))
  })

  const { max } = options
  return max !== undefined ? sorted.slice(0, max) : sorted
}
