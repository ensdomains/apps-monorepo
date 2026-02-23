import { ens_normalize, ens_split } from '@adraffy/ens-normalize'

/**
 * Extracts the first label from an ENS name using proper normalization.
 * Uses ens_normalize and ens_split for correct handling of Unicode, mixed-case,
 * and label boundaries (e.g. "something.ethereum" vs "something.eth").
 * @returns The first label as a string, or null if normalization fails or no valid label
 */
export function getLabel(name: string): string | null {
  try {
    const normalized = ens_normalize(name)
    const labels = ens_split(normalized)
    const first = labels[0]

    if (!first || first.error) {
      return null
    }

    return String.fromCodePoint(...first.input)
  } catch {
    return null
  }
}
