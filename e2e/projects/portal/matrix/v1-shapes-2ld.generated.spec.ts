/**
 * GENERATED FILE — do not edit.
 *
 * Written by `e2e/scripts/generate-v1-matrix.ts` from the shape table in
 * `@ens-apps/v1-name-shapes` and the expectations in
 * `e2e/matrix/expectations.ts`. Change those and regenerate:
 *
 *     pnpm --filter @ens-apps/e2e matrix:generate
 *
 * Each test is one cell of the V1 shape matrix: one portal tab, for one way a
 * V1 name can be held. The shape is seeded once per `describe`; the tabs
 * below it only read.
 */

import { expect, test } from '../../../fixtures/playwright.portal.fixture.js'
import { runCell, type SeededShape, seedForSuite } from '../../../matrix/run.js'

test.describe('V1 shape · 2ld-unwrapped:owner', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('2ld-unwrapped:owner')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('overview · names the registrant as owner', {
    tag: ['@scenario:VV1', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'overview')
  })

  test('ownership · names the registrant as owner and the controller as manager', {
    tag: ['@scenario:VO1', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'ownership')
  })
})

test.describe('V1 shape · 2ld-unwrapped:manager', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('2ld-unwrapped:manager')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('overview · names the registrant as owner, not the wallet that manages it', {
    tag: ['@scenario:VV2', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    test.fail(
      true,
      'E2E-011: the overview Owner row shows the controller — the same flattening as the Ownership tab, on a second page',
    )

    await runCell(page, wallet, seeded, 'overview')
  })

  test('ownership · keeps the registrant and the manager apart', {
    tag: ['@scenario:VO2', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    test.fail(
      true,
      'E2E-011: the Owner row shows the controller, so the same address appears as both Owner and Manager and the real owner is absent',
    )

    await runCell(page, wallet, seeded, 'ownership')
  })
})
