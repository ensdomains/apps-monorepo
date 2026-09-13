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

test.describe('V1 shape · 3ld-registry+unwrapped-2ld:owner', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('3ld-registry+unwrapped-2ld:owner')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('overview · names the registry owner of a subname that has no token', {
    tag: ['@scenario:VV20', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'overview')
  })

  test('ownership · names the registry owner, and offers the transfer it can perform', {
    tag: ['@scenario:VO20', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'ownership')
  })
})
