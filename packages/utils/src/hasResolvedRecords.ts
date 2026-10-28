type ResolvedRecords = {
  readonly texts?: readonly { readonly value: string }[]
  readonly coins?: readonly { readonly value: string }[]
  readonly contentHash?: unknown
  readonly abi?: unknown
}

/**
 * Whether resolution returned any record. A wildcard (CCIP-Read) resolver
 * answers for every subname, so its address alone does not show that one exists.
 */
export const hasResolvedRecords = (
  records: ResolvedRecords | null | undefined,
): boolean =>
  Boolean(
    records?.texts?.some(({ value }) => value) ||
      records?.coins?.some(({ value }) => value) ||
      records?.contentHash ||
      records?.abi,
  )
