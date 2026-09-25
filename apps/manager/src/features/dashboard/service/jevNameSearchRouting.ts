export const looksLikeJevNameSearchRequest = (query: string): boolean =>
  /\s/.test(query) ||
  /\b(expir\w*|grace|owner|manager|upgrade\w*|eligible|ineligible|favou?rite\w*|primary|oldest|newest|alphabetic\w*|sort\w*|order\w*|(?:ens)?v[12])\b/i.test(
    query,
  )
