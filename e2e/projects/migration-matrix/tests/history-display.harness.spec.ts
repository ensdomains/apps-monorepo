import { expect, test } from '@playwright/test'
import { inspectFixtureHistoryLinks } from '../history-display.js'

test('history reachability covers older pages and detects a missing transaction despite a visible sample', async ({
  page,
}) => {
  const recent = `0x${'a'.repeat(64)}`
  const original = `0x${'b'.repeat(64)}`
  const missing = `0x${'c'.repeat(64)}`
  await page.setContent(
    `<main><button onclick="document.querySelectorAll('details').forEach(node => node.open = true)">Expand all</button><details><summary>Recent transaction</summary><a href="/tx/${recent}">Recent transaction link</a></details><button onclick="this.insertAdjacentHTML('beforebegin', '<details><summary>Original transaction</summary><a href=/tx/${original}>Original transaction link</a></details>');this.remove()">Load more</button></main>`,
  )
  const complete = await inspectFixtureHistoryLinks(page, [recent, original])
  expect(complete.missing).toEqual([])
  expect(complete.pagesLoaded).toBe(2)
  const incomplete = await inspectFixtureHistoryLinks(page, [
    recent,
    original,
    missing,
  ])
  expect(incomplete.visible).toEqual([recent, original])
  expect(incomplete.missing).toEqual([missing])
  expect(incomplete.stopReason).toBe('no further history page')
})

test('history reachability waits while Load more becomes Loading before the final page arrives', async ({
  page,
}) => {
  const recent = `0x${'d'.repeat(64)}`
  const original = `0x${'e'.repeat(64)}`
  await page.setContent(
    `<main><button onclick="document.querySelectorAll('details').forEach(node => node.open = true)">Expand all</button><details><summary>Recent transaction</summary><a href="/tx/${recent}">Recent transaction link</a></details><button onclick="this.disabled = true; this.textContent = 'Loading…'; setTimeout(() => { this.insertAdjacentHTML('beforebegin', '<details><summary>Original transaction</summary><a href=/tx/${original}>Original transaction link</a></details>'); this.remove(); }, 1000)">Load more</button></main>`,
  )
  const result = await inspectFixtureHistoryLinks(page, [recent, original])
  expect(result.missing).toEqual([])
  expect(result.pagesLoaded).toBe(2)
})
