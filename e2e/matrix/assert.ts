/**
 * Turning a `TabExpectation` into assertions.
 *
 * The only interesting part is `readAddressRows`. The portal renders an
 * ownership row as an icon, a label, and two links to `/addr/<address>` — with
 * no test id and only utility classes, so a row cannot be selected structurally
 * without binding the test to Tailwind. Matching the address as *text* is worse
 * still: it is truncated to `0xf39F…2266`, and the same address usually appears
 * in several rows, so `getByText` proves only that the address is somewhere on
 * the page. That is precisely the assertion that would have passed while
 * E2E-011 printed the controller in the Owner row.
 *
 * So: read every labelled row as a (label, address) pair straight out of the
 * DOM, using the `href` for an exact, untruncated address, and assert against
 * that map. The label binds the value to the row it is claimed for.
 */

import type { Page } from '@playwright/test'
import { expect } from '../fixtures/playwright.portal.fixture.js'
import type { ChainTruth } from './chain.js'
import type { AddressRef, TabExpectation } from './expectations.js'

export type AddressRow = { label: string; address: string }

/**
 * Every labelled address row on the page.
 *
 * `innerText`, not `textContent`: each row starts with an `<svg><title>`, which
 * `textContent` includes and the user never sees — matching on it makes every
 * row look like it is labelled "Shield Person". Measured the hard way.
 */
export const readAddressRows = (page: Page): Promise<AddressRow[]> =>
  page.evaluate(() => {
    // Longest first, so "Previous owner" is not matched as "Owner".
    const LABELS = [
      'Previous owner',
      'Registrant',
      'Controller',
      'Manager',
      'Parent',
      'Owner',
    ]
    const out: { label: string; address: string }[] = []
    for (const link of document.querySelectorAll('a[href^="/addr/"]')) {
      const address = (link.getAttribute('href') ?? '').replace('/addr/', '')
      let node: Element | null = link
      for (let depth = 0; depth < 6 && node; depth++) {
        const text = ((node as HTMLElement).innerText ?? '').trim()
        const label = LABELS.find((candidate) => text.startsWith(candidate))
        if (label) {
          if (!out.some((r) => r.label === label && r.address === address)) {
            out.push({ label, address })
          }
          break
        }
        node = node.parentElement
      }
    }
    return out
  })

/** Resolve a symbolic expectation against what the chain actually says. */
export const resolveRef = (ref: AddressRef, truth: ChainTruth): string => {
  const value = {
    registrant: truth.registrant,
    controller: truth.controller,
    wrapperOwner: truth.wrapperOwner,
    parentHolder: truth.parentHolder,
  }[ref]
  if (!value) {
    throw new Error(
      `expectation refers to "${ref}", which this name does not have on chain — the expectation and the shape disagree`,
    )
  }
  return value.toLowerCase()
}

const describeRows = (rows: readonly AddressRow[]): string =>
  rows.length === 0
    ? '(no labelled address rows on the page)'
    : rows.map((r) => `${r.label}=${r.address}`).join(', ')

/**
 * Assert one cell.
 *
 * Deliberately does not `goto` — the caller navigates, so a generated test
 * reads as "go here, then this must be true".
 */
export const assertTab = async (
  page: Page,
  expectation: TabExpectation,
  truth: ChainTruth,
): Promise<void> => {
  if (expectation.refusal) {
    await expect(
      page.getByText(expectation.refusal, { exact: false }),
      `the tab must refuse with "${expectation.refusal}" rather than rendering an empty or partial state`,
    ).toBeVisible({ timeout: 30_000 })
  }

  if (expectation.rows) {
    // Poll until every expected label is present, rather than reading once.
    //
    // Rows arrive as their queries resolve, so a single read is a race: the
    // Owner row can be on the page while the Manager row is still loading, and
    // a probe measured an overview tab that was empty at 2.5 s and complete at
    // 10 s. Reading once would have produced "the Owner row is missing" —
    // indistinguishable from the app genuinely not rendering it, across 347
    // cells.
    const wanted = expectation.rows
      .filter((row) => row.kind === 'address-row')
      .map((row) => row.label)
    if (wanted.length > 0) {
      await expect
        .poll(async () => (await readAddressRows(page)).map((r) => r.label), {
          timeout: 30_000,
          message: `these rows never rendered: ${wanted.join(', ')}`,
        })
        .toEqual(expect.arrayContaining(wanted))
    }
    const rows = await readAddressRows(page)

    for (const row of expectation.rows) {
      if (row.kind === 'absent') {
        expect(
          rows.map((r) => r.label),
          `the "${row.label}" row must not be rendered for this shape`,
        ).not.toContain(row.label)
        continue
      }
      const expected = resolveRef(row.shows, truth)
      const actual = rows.find((r) => r.label === row.label)?.address
      expect(
        actual?.toLowerCase(),
        `the "${row.label}" row must show the ${row.shows} (${expected}). Rendered: ${describeRows(rows)}`,
      ).toBe(expected)
    }
  }

  if (expectation.form) {
    const recipient = page.getByPlaceholder('ENS name or address')
    if (expectation.form === 'visible') {
      await expect(
        recipient,
        'this shape is transferable, so the recipient form must be reachable',
      ).toBeVisible({ timeout: 30_000 })
    } else {
      await expect(
        recipient,
        'this shape is refused, so no recipient form may be offered — a form that leads to a revert is worse than a refusal',
      ).toHaveCount(0, { timeout: 30_000 })
    }
  }

  for (const cta of expectation.ctas ?? []) {
    const locator = page.getByRole('link', { name: cta.name })
    if (cta.state === 'absent') {
      await expect(
        locator,
        `"${cta.name}" must not be offered for this shape`,
      ).toHaveCount(0, { timeout: 30_000 })
      continue
    }
    await expect(
      locator.first(),
      `"${cta.name}" must be offered for this shape`,
    ).toBeVisible({ timeout: 30_000 })
  }
}
