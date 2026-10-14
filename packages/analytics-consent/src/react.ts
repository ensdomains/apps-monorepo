import { useCallback, useEffect, useState } from 'react'
import {
  type AnalyticsConsent,
  CONSENT_CHANGE_EVENT,
  CONSENT_STORAGE_KEY,
  readConsent,
  type StoredConsent,
  setStoredConsent,
} from './consent.js'

/**
 * The visitor's analytics choice, shared across every component that reads
 * it: writes persist to the browser and notify this tab synchronously, and
 * `storage` events keep other tabs in sync.
 */
export const useAnalyticsConsent = (): readonly [
  StoredConsent,
  (consent: AnalyticsConsent) => void,
] => {
  const [consent, setConsentState] = useState<StoredConsent>(() =>
    readConsent(),
  )

  useEffect(() => {
    const sync = () => setConsentState(readConsent())
    const onStorage = (event: StorageEvent) => {
      if (event.key === CONSENT_STORAGE_KEY) sync()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(CONSENT_CHANGE_EVENT, sync)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(CONSENT_CHANGE_EVENT, sync)
    }
  }, [])

  const setConsent = useCallback((next: AnalyticsConsent) => {
    setStoredConsent(next)
    setConsentState(next)
  }, [])

  return [consent, setConsent] as const
}
