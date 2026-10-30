import { isSepoliaBuild } from '@/config'

export const MANAGER_APP_BASE_URL = isSepoliaBuild
  ? 'https://sepolia.app.ens.domains'
  : 'https://app.ens.domains'
export const LANDING_PAGE_BASE_URL = 'https://ens.domains'
/** ens-app-v3 — still the only app that can create a subname on a V1 name. */
export const LEGACY_APP_BASE_URL = isSepoliaBuild
  ? 'https://legacy.sepolia.app.ens.domains'
  : 'https://legacy.app.ens.domains'

export const MANAGER_UPGRADE_URL = `${MANAGER_APP_BASE_URL}/upgrade`
export const ENSV2_LEARN_MORE_URL = `${LANDING_PAGE_BASE_URL}/ensv2`
