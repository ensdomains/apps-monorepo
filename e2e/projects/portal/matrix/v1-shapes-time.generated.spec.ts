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
 *
 * This file moves the fork clock forward and can never be undone, so it runs
 * in its own project and sorts last. Nothing here may use `withChainSnapshot`:
 * an `evm_revert` rewinds the chain but not Panoptes, which then halts
 * permanently.
 */

import { expect, test } from '../../../fixtures/playwright.portal.fixture.js'
import { runCell, type SeededShape, seedForSuite } from '../../../matrix/run.js'

test.describe('V1 shape · 2ld-unwrapped:grace:owner', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('2ld-unwrapped:grace:owner')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('overview · relabels the holder as the previous owner once a name lapses', {
    tag: ['@scenario:VV10', '@v1matrix'],
  }, async ({ portalPage: page, wallet, time }) => {
    await runCell(page, wallet, seeded, 'overview', time)
  })

  test('ownership · offers no transfer of a name in its grace period', {
    tag: ['@scenario:VO10', '@v1matrix'],
  }, async ({ portalPage: page, wallet, time }) => {
    await runCell(page, wallet, seeded, 'ownership', time)
  })

  test('transfer · refuses while the registration is lapsed but recoverable', {
    tag: ['@scenario:VT10', '@v1matrix'],
  }, async ({ portalPage: page, wallet, time }) => {
    await runCell(page, wallet, seeded, 'transfer', time)
  })
})

test.describe('V1 shape · 2ld-unwrapped:expired:owner', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('2ld-unwrapped:expired:owner')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('overview · says the name is available once grace has passed', {
    tag: ['@scenario:VV11', '@v1matrix'],
  }, async ({ portalPage: page, wallet, time }) => {
    await runCell(page, wallet, seeded, 'overview', time)
  })

  test('ownership · treats a fully expired name as unregistered', {
    tag: ['@scenario:VO11', '@v1matrix'],
  }, async ({ portalPage: page, wallet, time }) => {
    await runCell(page, wallet, seeded, 'ownership', time)
  })

  test('transfer · refuses a name anyone can now register', {
    tag: ['@scenario:VT11', '@v1matrix'],
  }, async ({ portalPage: page, wallet, time }) => {
    await runCell(page, wallet, seeded, 'transfer', time)
  })
})

test.describe('V1 shape · 3ld-wrapped+emancipated-2ld:grace:parent', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('3ld-wrapped+emancipated-2ld:grace:parent')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('ownership · names the subname holder while the 2LD above is in grace', {
    tag: ['@scenario:VO32', '@v1matrix'],
  }, async ({ portalPage: page, wallet, time }) => {
    await runCell(page, wallet, seeded, 'ownership', time)
  })

  test('transfer · tells the 2LD owner why the wrapper refuses, and offers a renewal', {
    tag: ['@scenario:VT32', '@v1matrix'],
  }, async ({ portalPage: page, wallet, time }) => {
    await runCell(page, wallet, seeded, 'transfer', time)
  })
})

test.describe('V1 shape · 3ld-wrapped+emancipated-2ld:expired:parent', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('3ld-wrapped+emancipated-2ld:expired:parent')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('transfer · refuses once the 2LD above has lapsed past grace', {
    tag: ['@scenario:VT33', '@v1matrix'],
  }, async ({ portalPage: page, wallet, time }) => {
    await runCell(page, wallet, seeded, 'transfer', time)
  })
})

test.describe('V1 shape · 4ld-wrapped+wrapped-3ld+emancipated-2ld:grace:owner', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite(
      '4ld-wrapped+wrapped-3ld+emancipated-2ld:grace:owner',
    )
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('ownership · still names the holder three levels under a lapsing 2LD', {
    tag: ['@scenario:VO44', '@v1matrix'],
  }, async ({ portalPage: page, wallet, time }) => {
    await runCell(page, wallet, seeded, 'ownership', time)
  })

  test('transfer · lets the holder move it while the .eth ancestor is in grace', {
    tag: ['@scenario:VT44', '@v1matrix'],
  }, async ({ portalPage: page, wallet, time }) => {
    await runCell(page, wallet, seeded, 'transfer', time)
  })
})
