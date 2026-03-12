import { AVATAR_UPLOAD_BASE_URL } from '../constants'

/**
 * Constructs the avatar URL for an ENS name.
 * Normalizes the name by trimming whitespace and lowercasing.
 * Returns `undefined` for empty or whitespace-only input.
 */
export const getAvatarUrl = (name: string): string | undefined => {
  const normalized = name.trim().toLowerCase()
  if (!normalized) return undefined

  return `${AVATAR_UPLOAD_BASE_URL}/sepolia/${normalized}`
}
