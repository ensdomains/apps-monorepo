/**
 * Normalizes an ENS name by ensuring it has a proper suffix.
 * If the name doesn't contain a dot (.), it appends '.eth' to it.
 * Otherwise, it returns the name as-is (lowercased).
 *
 * @param name - The ENS name to normalize
 * @returns The normalized ENS name with .eth suffix if needed
 *
 * @example
 * normalizeEnsName("vitalik")
 * // "vitalik.eth"
 *
 * @example
 * normalizeEnsName("vitalik.eth")
 * // "vitalik.eth"
 *
 * @example
 * normalizeEnsName("sub.vitalik.eth")
 * // "sub.vitalik.eth"
 */
export const normalizeEnsName = (name: string): string => {
  const normalized = (name.includes('.') ? name : `${name}.eth`).toLowerCase()
  return normalized
}
