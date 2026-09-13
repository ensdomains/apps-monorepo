/**
 * The body every generated matrix test shares.
 *
 * Keeping it here rather than in the generated files means a change to how a
 * cell is asserted is one edit, not 350 regenerated lines — and the generated
 * specs stay readable as a list of claims.
 */

import { type ShapeId, shapeById, tabById } from '@ens-apps/v1-name-shapes'
import type { Web3ProviderBackend } from '@ensdomains/headless-web3-provider'
import type { Page } from '@playwright/test'
import {
  connectWithHeadlessWallet,
  createAccounts,
  expect,
} from '../fixtures/playwright.portal.fixture.js'
import { assertTab } from './assert.js'
import { readChainTruth } from './chain.js'
import { expectationFor } from './expectations.js'
import { type SeededShape, seedShape } from './seed.js'

export type { SeededShape } from './seed.js'

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'

/**
 * Seed one shape for a whole describe block.
 *
 * Called from `beforeAll`, so it uses the `createAccounts` factory directly
 * rather than the `accounts` fixture — Playwright only injects test-scoped
 * fixtures into a test, and seeding once per shape instead of once per tab is
 * what makes a full tab sweep affordable at all (seeding is ~14 s; a page
 * visit is ~3 s).
 */
export const seedForSuite = (shapeId: ShapeId): Promise<SeededShape> =>
  seedShape(shapeById(shapeId), createAccounts())

/**
 * Run one cell: prove the fixture built what it claimed, then assert what the
 * tab renders.
 *
 * The precondition is not ceremony. Every cell downstream of a wrong shape
 * asserts confidently against the wrong name, and the failure surfaces as "the
 * Owner row is wrong" rather than "the fixture made something else" — which is
 * the misdiagnosis this whole suite exists to avoid.
 */
export const runCell = async (
  page: Page,
  wallet: Web3ProviderBackend,
  seeded: SeededShape,
  tabId: string,
): Promise<void> => {
  const { shape, name } = seeded
  const expectation = expectationFor(shape.id as ShapeId, tabId)
  if (!expectation) {
    throw new Error(
      `no expectation written for ${shape.id} · ${tabId} — the generator should not have emitted this test`,
    )
  }

  const truth = await readChainTruth(name)
  const leaf = shape.path.at(-1)

  expect(
    truth.wrapClass,
    `precondition: ${name} was seeded for shape "${shape.id}", which declares its leaf ${leaf?.wrap}`,
  ).toBe(leaf?.wrap)
  expect(
    (truth.wrapperOwner ?? truth.registrant ?? truth.controller)?.toLowerCase(),
    `precondition: ${name} is not held by the wallet the shape names`,
  ).toBe(seeded.holder.toLowerCase())

  await connectWithHeadlessWallet(page, wallet)
  await page.goto(`${PORTAL_APP_URL}${tabById(tabId).path(name)}`)
  await assertTab(page, expectation, truth)
}
