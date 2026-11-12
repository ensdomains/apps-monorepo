import { useEffect, useState } from 'react'
import { readFeatureFlag } from './readFeatureFlag'

type FeatureFlagClient = {
  readonly isFeatureEnabled: (key: string) => boolean | string | undefined
  readonly getFeatureFlagResult: (
    key: string,
    options?: { readonly send_event: boolean },
  ) => { readonly payload?: unknown } | undefined
  readonly onFeatureFlags: (listener: () => void) => () => void
}

const readPayload = (client: FeatureFlagClient, key: string): unknown => {
  try {
    return client.getFeatureFlagResult(key)?.payload
  } catch {
    return undefined
  }
}

const subscribeToFlags = (client: FeatureFlagClient, update: () => void) => {
  try {
    const unsubscribe = client.onFeatureFlags(update)
    return () => {
      try {
        unsubscribe()
      } catch {}
    }
  } catch {
    return () => {}
  }
}

const useFeatureFlagValue = <Value>(
  client: FeatureFlagClient,
  key: string,
  read: (client: FeatureFlagClient, key: string) => Value,
): Value => {
  const [value, setValue] = useState(() => read(client, key))
  useEffect(() => {
    const update = () => setValue(() => read(client, key))
    const unsubscribe = subscribeToFlags(client, update)
    update()
    return unsubscribe
  }, [client, key, read])
  return value
}

export const useFeatureFlagEnabled = (
  client: FeatureFlagClient,
  key: string,
): boolean => useFeatureFlagValue(client, key, readFeatureFlag)

export const useFeatureFlagPayload = (
  client: FeatureFlagClient,
  key: string,
): unknown => useFeatureFlagValue(client, key, readPayload)
