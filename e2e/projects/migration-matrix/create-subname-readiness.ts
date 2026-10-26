import { expect, type Page } from '@playwright/test'

/** Read existing query state only; do not resolve or replace the app's result. */
export const createSubnameQueryEvidence = (page: Page) => page.evaluate(async () => {
  const router = (window as any).__TSR_ROUTER__
  const portalModule = '/src/utils/queryClient.ts'
  const client = router?.options.context.queryClient ?? (await import(portalModule)).queryClient
  return client.getQueryCache().getAll()
    .filter((query: any) => query.isActive() && JSON.stringify(query.queryKey).includes('get-subnames'))
    .map((query: any) => ({ key: query.queryKey, status: query.state.status, fetchStatus: query.state.fetchStatus, data: query.state.data, error: query.state.error ? String(query.state.error) : null }))
}).catch(() => [])

/** A visible form can still be waiting for label availability or owner resolution. */
export async function createSubnameReadiness(page: Page, label: string, owner: string, timeout = 90000): Promise<{ result: 'ready' | 'error' | 'pending'; detail: string }> {
  const field = page.getByLabel('Subname', { exact: true })
  const ownerField = page.getByLabel('Owner', { exact: true })
  const submit = page.getByRole('button', { name: 'Create subname', exact: true })
  const error = page.locator('form p.text-danger, form p.text-warning').filter({ hasText: /\S/ }).first()
  const settled = async () => {
    if (!await field.count() || !await ownerField.count() || !await submit.count()) return false
    return await field.inputValue({ timeout: 1000 }) === label && (await ownerField.inputValue({ timeout: 1000 })).toLowerCase() === owner.toLowerCase() && await submit.isEnabled({ timeout: 1000 })
  }
  try {
    await expect.poll(async () => await error.isVisible() || await settled(), { timeout }).toBe(true)
  } catch {
    return { result: 'pending', detail: `Create-subname form did not retain the requested inputs and enable submission or display an explicit validation error within ${timeout} ms. Cause unverified; no wallet submission attempted.` }
  }
  if (await error.isVisible()) return { result: 'error', detail: await error.innerText() }
  return { result: 'ready', detail: 'Requested label and owner remain in the enabled creation form.' }
}
