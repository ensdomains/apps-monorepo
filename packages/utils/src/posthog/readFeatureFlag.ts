/** Optional rollout flags fail closed without preventing the underlying product operation. */
export const readFeatureFlag = (
  client: {
    isFeatureEnabled: (
      key: string,
      options?: { readonly send_event: boolean },
    ) => boolean | string | undefined
  },
  key: string,
): boolean => {
  try {
    return client.isFeatureEnabled(key, { send_event: false }) === true
  } catch {
    return false
  }
}
