/**
 * Result of parsing an ENS name into labels and parent
 */
export type ParsedName = {
  labels: string[]
  parent: string | undefined
}

/**
 * Parses an ENS name into its component labels and parent TLD
 *
 * @param name - The full ENS name to parse (e.g., "sub.vitalik.eth")
 * @returns Object containing labels array and parent TLD
 *
 * @example
 * parseName("vitalik.eth")
 * // { labels: ["vitalik"], parent: "eth" }
 *
 * @example
 * parseName("sub.vitalik.eth")
 * // { labels: ["sub", "vitalik"], parent: "eth" }
 *
 * @example
 * parseName("eth")
 * // { labels: [], parent: "eth" }
 */
export const parseName = (name: string): ParsedName => {
  const parts = name.split('.')
  return {
    labels: parts.slice(0, -1),
    parent: parts.at(-1),
  }
}
