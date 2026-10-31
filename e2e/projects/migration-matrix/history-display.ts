import { expect, type Page } from '@playwright/test'

/** Check every exact fixture transaction, including older UI pages. */
export async function inspectFixtureHistoryLinks(
  page: Page,
  transactionHashes: string[],
) {
  const expected = [
    ...new Set(transactionHashes.map((hash) => hash.toLowerCase())),
  ]
  let pagesLoaded = 1
  let visible: string[] = []
  for (;;) {
    const loading = page.getByRole('button', { name: 'Loading…', exact: true })
    await expect(
      loading,
      'History pagination must settle before inspecting its links',
    ).toHaveCount(0, { timeout: 30000 })
    const expand = page.getByRole('button', { name: 'Expand all', exact: true })
    if (await expand.isVisible()) await expand.click()
    const links = await page
      .locator('a:visible')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('href')?.toLowerCase() ?? ''),
      )
    visible = expected.filter((hash) =>
      links.some((link) => link.includes(hash)),
    )
    const missing = expected.filter((hash) => !visible.includes(hash))
    if (!missing.length)
      return {
        expected,
        visible,
        missing,
        pagesLoaded,
        stopReason: 'all exact fixture transactions reachable',
      }
    const more = page.getByRole('button', { name: 'Load more', exact: true })
    if (!(await more.isVisible()) || pagesLoaded >= 30)
      return {
        expected,
        visible,
        missing,
        pagesLoaded,
        stopReason:
          pagesLoaded >= 30 ? 'pagination limit' : 'no further history page',
      }
    await expect(more).toBeEnabled({ timeout: 30000 })
    const priorText = await page
      .locator('main')
      .innerText()
      .catch(() => page.locator('body').innerText())
    await more.click()
    // The same button is renamed Loading… while fetching. Its temporary
    // disappearance under the Load more locator is not the final page.
    await expect
      .poll(
        async () => {
          if (await loading.isVisible()) return false
          return (
            (await page
              .locator('main')
              .innerText()
              .catch(() => page.locator('body').innerText())) !== priorText
          )
        },
        {
          timeout: 30000,
          message: 'Wait for the completed history page, not its loading label',
        },
      )
      .toBe(true)
    await expect(
      page.getByRole('alert').filter({ hasText: /Couldn.t load more/ }),
    ).toHaveCount(0)
    if (await more.isVisible())
      await expect(more).toBeEnabled({ timeout: 30000 })
    pagesLoaded++
  }
}
