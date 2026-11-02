import type { Meta } from '@ens-apps/indexer/bigname'

/** Zero is evidence only for this complete publication and an uncontradicted tree. */
export const canSkipEmptySubtree = (params: {
  readonly shouldSkipEmptySubtrees: boolean
  readonly name: string
  readonly count: number | undefined
  readonly meta: Meta
  readonly chainId: number
  readonly selectedNames: readonly string[]
}): boolean => {
  const position = params.meta.as_of?.[String(params.chainId)]
  const chainCompleteness =
    params.meta.as_of_completeness?.[String(params.chainId)]?.completeness
  return (
    params.shouldSkipEmptySubtrees &&
    params.count === 0 &&
    (params.meta.completeness ?? 'full') === 'full' &&
    (chainCompleteness ?? 'full') === 'full' &&
    !params.meta.unsupported_fields?.length &&
    position !== undefined &&
    Number.isSafeInteger(position.block_number) &&
    position.block_number >= 0 &&
    /^0x[0-9a-f]{64}$/i.test(position.block_hash) &&
    !params.selectedNames.some((name) =>
      name.toLowerCase().endsWith(`.${params.name.toLowerCase()}`),
    )
  )
}
