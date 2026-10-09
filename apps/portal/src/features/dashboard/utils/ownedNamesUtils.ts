/**
 * Pure helpers for merging and ordering "Names you own" in search.
 * Ordering: 2LD names (e.g. fox.eth, arcticfox.eth) first, then subnames (e.g. big.fox.eth), alphabetically within each group.
 */

export type OwnedName = { name: string }

export type V1NameLike = { name: string | null }

/**
 * Merges V1 and V2 owned name lists and deduplicates by name (case-insensitive).
 * V1 entries with null name are skipped.
 */
export function mergeOwnedNames(
  v1: V1NameLike[],
  v2: OwnedName[],
): OwnedName[] {
  const v1Filtered = v1
    .filter((d): d is V1NameLike & { name: string } => d.name != null)
    .map((d) => ({ name: d.name }))
  const byName = new Map<string, OwnedName>()
  for (const d of [...v1Filtered, ...v2]) {
    const key = d.name.trim().toLowerCase()
    if (!byName.has(key)) byName.set(key, d)
  }
  return Array.from(byName.values())
}

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
 * The text owned names are matched against: the query lowercased, with a short
 * TLD-like suffix stripped ("dom.eth" → "dom") and longer subname labels kept
 * ("test.florin" stays "test.florin").
 */
export function getOwnedNamesMatchQuery(searchQuery: string): string {
  const q = searchQuery.trim().toLowerCase()
  const lastDot = q.lastIndexOf('.')
  if (lastDot < 0) return q
  const MAX_TLD_LENGTH = 3
  return q.length - lastDot - 1 <= MAX_TLD_LENGTH ? q.slice(0, lastDot) : q
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
  const matchQuery = getOwnedNamesMatchQuery(searchQuery)
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
