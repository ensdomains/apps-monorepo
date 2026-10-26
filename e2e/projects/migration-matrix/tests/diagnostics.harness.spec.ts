import { expect, test } from '@playwright/test'
import { roleQueryEvidence } from '../diagnostics.js'

test('role diagnostics retain exact uint256 values despite the app JSON shim', async ({ page }) => {
  const bitmap = (1n << 255n) | (1n << 24n) | 1n
  const resource = (1n << 256n) - 1n
  await page.evaluate(({ bitmap, resource }) => {
    ;(BigInt.prototype as unknown as { toJSON: () => unknown }).toJSON = function (this: bigint) { return (JSON as any).rawJSON(this.toString()) }
    const query = {
      queryKey: ['getNameRolesForAccount', { resource: BigInt(resource) }],
      isActive: () => true,
      state: { status: 'success', data: { raw: BigInt(bitmap), holders: new Map([['wallet', BigInt(bitmap)]]) }, error: null },
    }
    ;(window as any).__diagnosticQuery = query
    ;(window as any).__TSR_ROUTER__ = { options: { context: { queryClient: { getQueryCache: () => ({ getAll: () => [query] }) } } } }
  }, { bitmap: String(bitmap), resource: String(resource) })

  expect(await page.evaluate(() => String(BigInt(JSON.parse(JSON.stringify((window as any).__diagnosticQuery.state.data)).raw) & 1n))).toBe('0')
  const rows = await roleQueryEvidence(page)
  expect(rows).toHaveLength(1)
  expect(rows[0].key[1].resource).toBe(String(resource))
  expect(rows[0].data.raw).toBe(String(bitmap))
  expect(rows[0].data.holders.wallet).toBe(String(bitmap))
  expect(BigInt(rows[0].data.raw) & 1n).toBe(1n)
  expect(await page.evaluate(() => typeof (window as any).__diagnosticQuery.state.data.raw)).toBe('bigint')
})
