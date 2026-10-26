import type { Page } from '@playwright/test'

/** Read the application's existing errors without modifying its decision or query result. */
export const queryFailures = (page: Page) => page.evaluate(async () => {
  const router = (window as unknown as { __TSR_ROUTER__?: { options: { context: { queryClient: { getQueryCache(): { getAll(): { queryKey: unknown; state: { error: unknown } }[] } } } } } }).__TSR_ROUTER__
  const describe = (error: unknown, depth = 0): unknown => {
    if (!error || depth > 5) return String(error)
    if (typeof error !== 'object') return error
    const e = error as Record<string, unknown>
    return { name: e.name, message: e.message, reason: e.reason, stage: e.stage, cause: e.cause ? describe(e.cause, depth + 1) : undefined }
  }
  const portalModule = '/src/utils/queryClient.ts'
  const client = router?.options.context.queryClient ?? (await import(portalModule)).queryClient
  return client.getQueryCache().getAll().filter((q: any) => q.state.error).map((q: any) => ({ key: q.queryKey, error: describe(q.state.error) }))
}).catch(() => [])

/** Observe readiness and results of the app's real permission queries. */
export const permissionQueries = (page: Page): Promise<{ key: unknown; status: string; fetchStatus: string; data: unknown }[]> => page.evaluate(async () => {
  const router = (window as unknown as { __TSR_ROUTER__?: { options: { context: { queryClient: { getQueryCache(): { getAll(): { queryKey: unknown; state: { status: string; fetchStatus: string; data: unknown } }[] } } } } } }).__TSR_ROUTER__
  const portalModule = '/src/utils/queryClient.ts'
  const client = router?.options.context.queryClient ?? (await import(portalModule)).queryClient
  return client.getQueryCache().getAll()
    .filter((q: any) => /resolver_write_access|resolver_copy_source/.test(JSON.stringify(q.queryKey)))
    .map((q: any) => ({ key: q.queryKey, status: q.state.status, fetchStatus: q.state.fetchStatus, data: q.state.data })) ?? []
}).catch(() => [])

/** Preserve both successful and error-valued role-query results for diagnosis. */
export const roleQueryEvidence = (page: Page) => page.evaluate(async () => {
  const router = (window as any).__TSR_ROUTER__
  const portalModule = '/src/utils/queryClient.ts'
  const client = router?.options.context.queryClient ?? (await import(portalModule)).queryClient
  const queries = client.getQueryCache().getAll()
  // Portal's BigInt.toJSON shim runs before a JSON replacer and emits numbers.
  // Normalize first so diagnostic role bitmaps/resource IDs keep every bit.
  const snapshot = (value: any): any => {
    if (typeof value === 'bigint') return String(value)
    if (value instanceof Map) return Object.fromEntries([...value].map(([key, item]) => [String(key), snapshot(item)]))
    if (Array.isArray(value)) return value.map(snapshot)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item)]))
    return value
  }
  return snapshot(queries.filter((q: any) => /roles|resource|permission/.test(JSON.stringify(q.queryKey))).map((q: any) => ({ key: q.queryKey, active: q.isActive(), status: q.state.status, data: q.state.data, error: q.state.error })))
}).catch(() => [])

/** Observe actual profile readiness; a skeleton is not a loaded wrong owner. */
export const profileReadiness = (page: Page, name: string): Promise<{ action: string; status: string; fetchStatus: string }[]> => page.evaluate(({ name }) => {
  const client = (window as any).__TSR_ROUTER__?.options.context.queryClient
  if (!client) return []
  return client.getQueryCache().getAll().filter((q: any) => q.isActive() && q.queryKey?.[0]?.$scope === 'profile' && ['owner', 'expiry'].includes(q.queryKey?.[0]?.$action) && q.queryKey?.[0]?.name === name)
    .map((q: any) => ({ action: q.queryKey[0].$action, status: q.state.status, fetchStatus: q.state.fetchStatus }))
}, { name }).catch(() => [])
