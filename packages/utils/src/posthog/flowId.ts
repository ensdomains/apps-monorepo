/** Correlation is optional; an unavailable browser crypto API must not block product work. */
export const createAnalyticsFlowId = (): string | undefined => {
  try {
    return globalThis.crypto.randomUUID()
  } catch {
    return undefined
  }
}
