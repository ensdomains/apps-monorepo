type ResolvedRecords = {
  readonly texts?: readonly { readonly value: string }[]
  readonly coins?: readonly { readonly value: string }[]
  readonly contentHash?: unknown
  readonly abi?: unknown
}

/** A wildcard resolver address alone does not prove that a name has records. */
export const hasResolvedRecords = (
  records: ResolvedRecords | null | undefined,
): boolean =>
  Boolean(
    records?.texts?.some(({ value }) => value) ||
      records?.coins?.some(({ value }) => value) ||
      records?.contentHash ||
      records?.abi,
  )
