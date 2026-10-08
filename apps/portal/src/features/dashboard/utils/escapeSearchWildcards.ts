/**
 * Both name sources match search text as a SQL `LIKE` pattern, where `%` and
 * `_` are wildcards. Escaped, they match themselves.
 */
export const escapeSearchWildcards = (search: string) =>
  search.replace(/[\\%_]/g, '\\$&')
