import type { Address } from 'viem'

export type ExplorerTarget =
  | { readonly kind: 'name'; readonly name: string }
  | { readonly kind: 'address'; readonly address: Address }

/** The Explorer page for a name or address, or null on a network with no Explorer. */
export const getExplorerUrl = (
  origin: string | null,
  target: ExplorerTarget,
): string | null => {
  if (!origin) return null
  return target.kind === 'name'
    ? `${origin}/${encodeURIComponent(target.name)}`
    : `${origin}/addr/${target.address}`
}
