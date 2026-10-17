import { REGISTRATION_RESUME_STORAGE_KEY } from '@/features/register-v2/service/registrationPersistence'

// Blanket localStorage.clear() corrupts reconnection — preserve wagmi.*
// (wagmi's connection storage).
//
// Also preserve the standalone-HCA session store (`ens-sessions-*`): a valid,
// non-expired scoped session must survive disconnect/reconnect so the next
// registration reuses it with ZERO wallet prompts (per the HCA handoff doc —
// "a valid session supports later ENS actions without another wallet prompt").
// Wiping it here forced a re-ENABLE on every reconnect. Cross-owner safety is
// handled separately by `removeSessionsByOwner` on an actual owner switch, and
// each session is owner+chain+HCA scoped and on-chain-expiring, so keeping it
// across a disconnect is safe.
//
// And preserve an interrupted registration's resume record. A disconnect
// suspends the run instead of cancelling it (`useRegistrationResume`), so the
// owner can pick it back up on reconnect; wiping the record here left nothing
// to resume. It is bound to its owner, and any other wallet is shown plain
// pricing.
const PRESERVED_KEY_PREFIXES = [
  'wagmi',
  'ens-session',
  REGISTRATION_RESUME_STORAGE_KEY,
] as const

export const clearAppLocalStorage = () => {
  for (const key of Object.keys(localStorage)) {
    if (PRESERVED_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)))
      continue
    localStorage.removeItem(key)
  }
}
