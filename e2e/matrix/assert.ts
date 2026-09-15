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
import type { ChainTruth, RecordTruth } from './chain.js'
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

/**
 * The fuses table as `{ display name → burnt }`.
 *
 * The table lists every fuse whether or not it is burned, so asserting that a
 * fuse *appears* proves only that the table rendered. What matters is its Burnt
 * cell. Rows are read from `innerText` — name, "Copy value", scope, then the
 * boolean — because the grid is divs with utility classes and no test ids.
 */
export const readFuseRows = (page: Page): Promise<Record<string, boolean>> =>
  page.evaluate(() => {
    const main = document.querySelector('main')
    const lines = ((main as HTMLElement | null)?.innerText ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    const out: Record<string, boolean> = {}
    for (const [index, line] of lines.entries()) {
      if (line !== 'Copy value') continue
      // The fuse name is the line above "Copy value"; its state is the next
      // True/False below it.
      const name = lines[index - 1]
      const state = lines
        .slice(index + 1, index + 5)
        .find((l) => l === 'True' || l === 'False')
      if (name && state) out[name] = state === 'True'
    }
    return out
  })

/**
 * The records table as `{ key → rendered value }`.
 *
 * Read cell by cell, not by tab-splitting `innerText`. The value cell renders
 * an `EntityBadge` whose first child is an absolutely-positioned flex row of
 * "Copy"/"More" chips — hidden with `opacity-0`, which `innerText` still
 * reports, and whose flex box breaks the line before the value. Tab-splitting
 * therefore read every populated row as an empty one, which looked exactly like
 * an app that lists record keys and renders no values. It was the scraper.
 *
 * Measured: `com.twitter` on a seeded 2LD read as `''` by line, and as its real
 * value by cell.
 */
export const readRecordRows = (page: Page): Promise<Record<string, string>> =>
  page.evaluate(() => {
    const CHIPS = new Set(['Copy', 'More', 'Etherscan', ''])
    const clean = (element: Element | undefined): string =>
      ((element as HTMLElement | undefined)?.innerText ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => !CHIPS.has(line))
        .join(' ')
        .trim()

    const out: Record<string, string> = {}
    for (const row of document.querySelectorAll('tr')) {
      const cells = [...row.querySelectorAll('td')]
      if (cells.length < 3) continue
      if (clean(cells[0]) !== 'text') continue
      const key = clean(cells[1])
      if (key) out[key] = clean(cells[2])
    }
    return out
  })

/**
 * The Address Resolution table as `{ network → address }`.
 *
 * Cell by cell for the same reason as `readRecordRows`: the Network cell is
 * itself a flex box, so line-based parsing of `innerText` cannot tell "this
 * chain resolves to nothing" from "the address wrapped onto a line I did not
 * look at". A network that resolves to nothing is simply absent from the map,
 * which is what lets an empty table be asserted as empty.
 */
export const readResolvedAddresses = (
  page: Page,
): Promise<Record<string, string>> =>
  page.evaluate(() => {
    const NETWORKS = new Set([
      'Mainnet',
      'Optimism',
      'Arbitrum',
      'Base',
      'Linea',
      'Scroll',
    ])
    const out: Record<string, string> = {}
    for (const row of document.querySelectorAll('tr')) {
      const cells = [...row.querySelectorAll('td')]
      if (cells.length < 2) continue
      const network = ((cells[0] as HTMLElement).innerText ?? '')
        .split('\n')
        .map((line) => line.trim())
        .find((line) => NETWORKS.has(line))
      if (!network) continue
      const address = /0x[0-9a-fA-F]{40}/.exec(
        (cells[1] as HTMLElement).innerText ?? '',
      )
      if (address) out[network] = address[0]
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

/** The labelled address rows, polled so a half-loaded page is not a failure. */
const assertAddressRows = async (
  page: Page,
  expected: NonNullable<TabExpectation['rows']>,
  truth: ChainTruth,
): Promise<void> => {
  // Poll until every expected label is present, rather than reading once.
  //
  // Rows arrive as their queries resolve, so a single read is a race: the Owner
  // row can be on the page while the Manager row is still loading, and a probe
  // measured an overview tab that was empty at 2.5 s and complete at 10 s.
  // Reading once would have produced "the Owner row is missing" —
  // indistinguishable from the app genuinely not rendering it, across 347 cells.
  const wanted = expected
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

  for (const row of expected) {
    if (row.kind === 'absent') {
      expect(
        rows.map((r) => r.label),
        `the "${row.label}" row must not be rendered for this shape`,
      ).not.toContain(row.label)
      continue
    }
    const want = resolveRef(row.shows, truth)
    const actual = rows.find((r) => r.label === row.label)?.address
    expect(
      actual?.toLowerCase(),
      `the "${row.label}" row must show the ${row.shows} (${want}). Rendered: ${describeRows(rows)}`,
    ).toBe(want)
  }
}

/** The Burnt column, both halves stated — see `readFuseRows`. */
const assertFuses = async (
  page: Page,
  expected: NonNullable<TabExpectation['fuses']>,
): Promise<void> => {
  await expect
    .poll(async () => Object.keys(await readFuseRows(page)).length, {
      timeout: 30_000,
      message: 'the fuses table never rendered',
    })
    .toBeGreaterThan(0)
  const rows = await readFuseRows(page)
  for (const fuse of expected.burnt) {
    expect(
      rows[fuse],
      `"${fuse}" must be burnt for this shape. Table: ${JSON.stringify(rows)}`,
    ).toBe(true)
  }
  for (const fuse of expected.unburnt ?? []) {
    expect(
      rows[fuse],
      `"${fuse}" must NOT be burnt for this shape. Table: ${JSON.stringify(rows)}`,
    ).toBe(false)
  }
}

/** The transfer tab's recipient field. */
const assertForm = async (
  page: Page,
  form: NonNullable<TabExpectation['form']>,
): Promise<void> => {
  const recipient = page.getByPlaceholder('ENS name or address')
  if (form === 'visible') {
    await expect(
      recipient,
      'this shape is transferable, so the recipient form must be reachable',
    ).toBeVisible({ timeout: 30_000 })
    return
  }
  await expect(
    recipient,
    'this shape is refused, so no recipient form may be offered — a form that leads to a revert is worse than a refusal',
  ).toHaveCount(0, { timeout: 30_000 })
}

/** Links the tab must offer, or must withhold. */
const assertCtas = async (
  page: Page,
  ctas: NonNullable<TabExpectation['ctas']>,
): Promise<void> => {
  for (const cta of ctas) {
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

/**
 * Assert the seeded records render as the chain has them.
 *
 * The chain read is passed in rather than taken here so the failure message can
 * quote both sides: "the page shows X, the resolver says Y" is diagnosable at a
 * glance; "expected X" is not.
 */
const assertRecords = async (
  page: Page,
  wanted: NonNullable<TabExpectation['records']>,
  records: RecordTruth,
): Promise<void> => {
  const isAddressTab = wanted.ethAddress !== undefined
  if (isAddressTab) {
    const expected = records.addresses[60]
    if (wanted.ethAddress === 'shown') {
      if (!expected) {
        throw new Error(
          'the expectation says an ETH address must be shown, but the resolver has none — the expectation and the fixture disagree',
        )
      }
      await expect
        .poll(async () => (await readResolvedAddresses(page)).Mainnet ?? null, {
          timeout: 30_000,
          message: `the Mainnet row never showed the resolver's address (${expected})`,
        })
        .toBe(expected)
    } else {
      const rows = await readResolvedAddresses(page)
      expect(
        rows.Mainnet,
        'no Mainnet address may be shown for this shape',
      ).toBeUndefined()
    }
    return
  }

  // Poll for the table rather than reading once: records arrive with their
  // query, and a single read would call an unfinished page a missing record.
  const firstWanted = wanted.texts?.[0]
  if (firstWanted) {
    await expect
      .poll(async () => Object.keys(await readRecordRows(page)), {
        timeout: 30_000,
        message: `the records table never listed "${firstWanted}"`,
      })
      .toContain(firstWanted)
  }
  const rows = await readRecordRows(page)
  const shown = JSON.stringify(rows)

  for (const key of wanted.texts ?? []) {
    const expected = records.texts[key]
    if (!expected) {
      throw new Error(
        `the expectation asserts the text record "${key}", which the resolver does not have — the expectation and the fixture disagree`,
      )
    }
    expect(
      rows[key],
      `the "${key}" row must show the resolver's value (${expected}). Table: ${shown}`,
    ).toBe(expected)
  }
}

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
  /** Read only when the expectation asserts records. */
  records?: RecordTruth,
): Promise<void> => {
  if (expectation.refusal) {
    await expect(
      page.getByText(expectation.refusal, { exact: false }),
      `the tab must refuse with "${expectation.refusal}" rather than rendering an empty or partial state`,
    ).toBeVisible({ timeout: 30_000 })
  }

  if (expectation.records) {
    if (!records) {
      throw new Error(
        'this cell asserts records but no resolver read was supplied — runCell must pass one whenever the expectation names records',
      )
    }
    await assertRecords(page, expectation.records, records)
  }

  if (expectation.rows) {
    await assertAddressRows(page, expectation.rows, truth)
  }

  if (expectation.heading) {
    // The page heading, not a bare text match: every tab's name also appears in
    // the sidebar, and `getByText(...).first()` picked that hidden copy — which
    // failed as "History is not visible" on a page that plainly showed it.
    await expect(
      page.getByRole('heading', { name: expectation.heading }).first(),
      `this tab must render its "${expectation.heading}" heading`,
    ).toBeVisible({ timeout: 30_000 })
  }

  if (expectation.fuses) await assertFuses(page, expectation.fuses)

  for (const text of expectation.text ?? []) {
    await expect(
      page.getByText(text, { exact: false }).first(),
      `this tab must show "${text}" for this shape`,
    ).toBeVisible({ timeout: 30_000 })
  }

  for (const text of expectation.notText ?? []) {
    await expect(
      page.getByText(text, { exact: false }),
      `this tab must not claim "${text}" for this shape`,
    ).toHaveCount(0, { timeout: 30_000 })
  }

  if (expectation.form) await assertForm(page, expectation.form)

  if (expectation.ctas) await assertCtas(page, expectation.ctas)
}
