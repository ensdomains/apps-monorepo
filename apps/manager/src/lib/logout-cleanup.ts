import { SEARCH_HISTORY_STORAGE_KEY } from '@/features/navigation/Header/search/useSearchHistory'
import { SKIPPED_SESSION_KEY } from '@/lib/smart-account/sessions/session-storage'
import { BACKEND_AUTH_STORAGE_KEY } from '@/utils/backend-client'

const REGISTRATION_DRAFT_KEYS = [
  'ens_commitment',
  'ens_secret',
  'ens_name',
  'ens_duration',
  'ens_commit_tx_hash',
  'ens_register_tx_hash',
  'ens_owner_address',
] as const

const MANAGER_OWNED_KEYS = [
  BACKEND_AUTH_STORAGE_KEY,
  SEARCH_HISTORY_STORAGE_KEY,
  ...REGISTRATION_DRAFT_KEYS,
] as const

// Prefixes are version-bump-safe: when a key like `ens-sessions-v*`
// gets bumped to a new version, the prefix still matches so stale
// session rows from the prior version are also wiped on logout.
const MANAGER_OWNED_PREFIXES = [
  '@manager-v4/',
  'wallet_verified_',
  'wallet_signature_',
  'ens-sessions-v',
  `${SKIPPED_SESSION_KEY}-`,
] as const

/**
 * Remove manager-owned localStorage entries on logout.
 *
 * Replaces a blanket `localStorage.clear()` so we don't wipe unrelated
 * origin data (PostHog session, audit-trail debug data, etc.). The
 * Para / wagmi / Appkit / Capsule keys that previously got caught by
 * `.clear()` are managed by their own providers and re-init on next
 * connect, so we don't need to remove them explicitly here.
 *
 * `posthog.reset()` is called separately in the logout flow and
 * handles the `ph_phc_..._posthog` key.
 */
export function performLogoutCleanup(storage: Storage = localStorage): void {
  for (const key of MANAGER_OWNED_KEYS) {
    storage.removeItem(key)
  }

  for (const key of Object.keys(storage)) {
    if (MANAGER_OWNED_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      storage.removeItem(key)
    }
  }
}
