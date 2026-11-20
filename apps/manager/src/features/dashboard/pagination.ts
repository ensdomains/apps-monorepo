export type PageWindowItem = number | 'ellipsis'

export const getDashboardSearch = (
  search: Readonly<Record<string, unknown>>,
): { readonly page?: number } => {
  const { page } = search
  return {
    page:
      typeof page === 'number' && Number.isSafeInteger(page) && page > 1
        ? page
        : undefined,
  }
}

export const getPageWindow = (
  current: number,
  total: number,
): PageWindowItem[] => {
  if (total <= 1) return [1]
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const safeCurrent = Math.min(Math.max(current, 1), total)
  const pages = new Set<number>([1, total])
  for (let p = safeCurrent - 1; p <= safeCurrent + 1; p++) {
    if (p >= 1 && p <= total) pages.add(p)
  }

  const sorted = Array.from(pages).sort((a, b) => a - b)
  const result: PageWindowItem[] = []
  let previous = 0
  for (const page of sorted) {
    if (previous && page - previous > 1) result.push('ellipsis')
    result.push(page)
    previous = page
  }
  return result
}
