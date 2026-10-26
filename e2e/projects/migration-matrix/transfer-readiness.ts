import { expect, type Page } from '@playwright/test'

/** Observe pending preparation without changing the app's reads or mutation. */
export const transferPreparationEvidence = (page: Page) => page.evaluate(async () => {
  const portalModule = '/src/utils/queryClient.ts'
  const client = (window as any).__TSR_ROUTER__?.options.context.queryClient ?? (await import(portalModule)).queryClient
  return {
    queries: client.getQueryCache().getAll()
      .filter((query: any) => /transfer-v1-name-state|own-resolver|eth-address|permissioned-resolver/.test(JSON.stringify(query.queryKey)))
      .map((query: any) => ({ key: query.queryKey, active: query.isActive(), status: query.state.status, fetchStatus: query.state.fetchStatus, error: query.state.error ? String(query.state.error) : null })),
    mutations: client.getMutationCache().getAll()
      .filter((mutation: any) => mutation.state.status === 'pending' || mutation.state.status === 'error')
      .map((mutation: any) => ({ status: mutation.state.status, paused: mutation.state.isPaused, failureCount: mutation.state.failureCount, error: mutation.state.error ? String(mutation.state.error) : null })),
  }
}).catch(error => ({ diagnosticError: String(error) }))

/** Preparation reads precede wallet requests; pending is not an authorization denial. */
export async function transferReadiness(page: Page, timeout = 90000): Promise<{ result: 'ready' | 'error' | 'pending'; detail: string }> {
  const dialog = page.locator('[data-slot="dialog-content"]')
  const error = page.locator('span.text-destructive').filter({ hasText: /\S/ }).first()
  try {
    await expect.poll(async () => await dialog.isVisible() || await error.isVisible(), { timeout }).toBe(true)
  } catch {
    return { result: 'pending', detail: `Transfer preparation did not reach confirmation or an explicit error within ${timeout} ms. Its cause is unverified; no wallet submission was attempted by this check.` }
  }
  if (await error.isVisible()) return { result: 'error', detail: await error.innerText() }
  return { result: 'ready', detail: 'The actual transaction confirmation dialog loaded.' }
}
