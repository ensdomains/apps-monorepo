import useLocalStorageState from 'use-local-storage-state'

// Opt-in: nothing third-party (PostHog, Intercom) loads until this is true.
export const useTelemetryEnabled = (): readonly [
  boolean,
  (enabled: boolean) => void,
] => {
  const [enabled, setEnabled] = useLocalStorageState<boolean>(
    'telemetry-enabled',
    { defaultValue: false },
  )

  return [enabled, setEnabled] as const
}
