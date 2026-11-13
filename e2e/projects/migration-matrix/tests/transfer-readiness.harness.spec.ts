import { expect, test } from '@playwright/test'
import { transferReadiness } from '../transfer-readiness.js'

test('a pending transfer becomes ready only when its actual confirmation appears', async ({
  page,
}) => {
  await page.setContent('<button disabled>Preparing…</button>')
  await page.evaluate(() =>
    setTimeout(() => {
      document.body.innerHTML =
        '<div data-slot="dialog-content">Confirm transfer</div>'
    }, 80),
  )
  expect((await transferReadiness(page, 1000)).result).toBe('ready')
})

test('a loaded preparation error is distinct from pending readiness', async ({
  page,
}) => {
  await page.setContent(
    '<span class="text-destructive">The current owner changed. Refresh and try again.</span>',
  )
  expect(await transferReadiness(page, 1000)).toEqual({
    result: 'error',
    detail: 'The current owner changed. Refresh and try again.',
  })
})

test('an endless preparing state does not become an authorization failure or pass', async ({
  page,
}) => {
  await page.setContent('<button disabled>Preparing…</button>')
  expect((await transferReadiness(page, 100)).result).toBe('pending')
})
