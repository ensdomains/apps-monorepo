// Base URL of the ENS Manager app, where v1 → v2 migration is performed.
// Override per-environment with `VITE_MANAGER_APP_URL`.
const DEFAULT_MANAGER_APP_URL = 'https://manager.ens.domains'

export const MANAGER_APP_URL: string =
  import.meta.env?.VITE_MANAGER_APP_URL || DEFAULT_MANAGER_APP_URL

/** Deep link to the Manager migration flow for a given name. */
export const getManagerMigrateUrl = (name: string): string => {
  const base = MANAGER_APP_URL.replace(/\/$/, '')
  return `${base}/migration?name=${encodeURIComponent(name)}`
}
