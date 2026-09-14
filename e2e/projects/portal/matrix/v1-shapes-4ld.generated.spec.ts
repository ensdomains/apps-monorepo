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

test.describe('V1 shape · 4ld-locked+locked-3ld+locked-2ld:owner', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('4ld-locked+locked-3ld+locked-2ld:owner')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('ownership · names the holder of a locked name three levels down', {
    tag: ['@scenario:VO40', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'ownership')
  })

  test('transfer · offers the holder the form at depth four', {
    tag: ['@scenario:VT40', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · shows Parent Cannot Control and Cannot Unwrap burnt, and the rest unburnt', {
    tag: ['@scenario:VF40', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('resolver · renders the resolver tab for a V1 subname', {
    tag: ['@scenario:VE40', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test('records · renders the records tab for a V1 subname', {
    tag: ['@scenario:VD40', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'records')
  })

  test('subnames · renders the subnames tab for a V1 subname', {
    tag: ['@scenario:VS40', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 subname', {
    tag: ['@scenario:VR40', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · names the NameWrapper as the contract holding the token', {
    tag: ['@scenario:VK40', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 subname', {
    tag: ['@scenario:VH40', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })

  test('address · renders address resolution for a V1 subname', {
    tag: ['@scenario:VA40', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'address')
  })
})

test.describe('V1 shape · 4ld-locked+locked-3ld:parent', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('4ld-locked+locked-3ld:parent')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('ownership · offers the parent no transfer of an emancipated name at depth four', {
    tag: ['@scenario:VO41', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'ownership')
  })

  test('transfer · refuses a parent that is itself a subname, on the same grounds', {
    tag: ['@scenario:VT41', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · shows Parent Cannot Control and Cannot Unwrap burnt, and the rest unburnt', {
    tag: ['@scenario:VF41', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('resolver · renders the resolver tab for a V1 subname', {
    tag: ['@scenario:VE41', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test('records · renders the records tab for a V1 subname', {
    tag: ['@scenario:VD41', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'records')
  })

  test('subnames · renders the subnames tab for a V1 subname', {
    tag: ['@scenario:VS41', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 subname', {
    tag: ['@scenario:VR41', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · names the NameWrapper as the contract holding the token', {
    tag: ['@scenario:VK41', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 subname', {
    tag: ['@scenario:VH41', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })

  test('address · renders address resolution for a V1 subname', {
    tag: ['@scenario:VA41', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'address')
  })
})

test.describe('V1 shape · 4ld-registry+registry-3ld+unwrapped-2ld:owner', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('4ld-registry+registry-3ld+unwrapped-2ld:owner')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('ownership · names the registry owner two levels below the 2LD', {
    tag: ['@scenario:VO42', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'ownership')
  })

  test('transfer · offers the holder the form two levels below the 2LD', {
    tag: ['@scenario:VT42', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · explains that an unwrapped V1 name has no fuses, and offers migration', {
    tag: ['@scenario:VF42', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('resolver · renders the resolver tab for a V1 subname', {
    tag: ['@scenario:VE42', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test('records · renders the records tab for a V1 subname', {
    tag: ['@scenario:VD42', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'records')
  })

  test('subnames · renders the subnames tab for a V1 subname', {
    tag: ['@scenario:VS42', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 subname', {
    tag: ['@scenario:VR42', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · does not claim a BaseRegistrar token for a name that has none', {
    tag: ['@scenario:VK42', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    test.fail(
      true,
      'E2E-016: claims ERC-721 on the BaseRegistrar with token id labelhash(leaf label) — a 2LD id that reverts on ownerOf today, and belongs to a different name if that 2LD is ever registered',
    )

    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 subname', {
    tag: ['@scenario:VH42', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })

  test('address · renders address resolution for a V1 subname', {
    tag: ['@scenario:VA42', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'address')
  })
})

test.describe('V1 shape · 4ld-registry+registry-3ld:parent', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('4ld-registry+registry-3ld:parent')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('ownership · offers the reassign to a parent two levels below the 2LD', {
    tag: ['@scenario:VO43', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'ownership')
  })

  test('transfer · lets a parent reassign a subname two levels below the 2LD', {
    tag: ['@scenario:VT43', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · explains that an unwrapped V1 name has no fuses, and offers migration', {
    tag: ['@scenario:VF43', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('resolver · renders the resolver tab for a V1 subname', {
    tag: ['@scenario:VE43', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test('records · renders the records tab for a V1 subname', {
    tag: ['@scenario:VD43', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'records')
  })

  test('subnames · renders the subnames tab for a V1 subname', {
    tag: ['@scenario:VS43', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 subname', {
    tag: ['@scenario:VR43', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · does not claim a BaseRegistrar token for a name that has none', {
    tag: ['@scenario:VK43', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    test.fail(
      true,
      'E2E-016: claims ERC-721 on the BaseRegistrar with token id labelhash(leaf label) — a 2LD id that reverts on ownerOf today, and belongs to a different name if that 2LD is ever registered',
    )

    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 subname', {
    tag: ['@scenario:VH43', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })

  test('address · renders address resolution for a V1 subname', {
    tag: ['@scenario:VA43', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'address')
  })
})

test.describe('V1 shape · 4ld-registry+wrapped-3ld:parent', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('4ld-registry+wrapped-3ld:parent')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('ownership · offers no transfer across the wrapper line at depth four', {
    tag: ['@scenario:VO45', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'ownership')
  })

  test('transfer · refuses the mismatch when neither level is a 2LD', {
    tag: ['@scenario:VT45', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · explains that an unwrapped V1 name has no fuses, and offers migration', {
    tag: ['@scenario:VF45', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('resolver · renders the resolver tab for a V1 subname', {
    tag: ['@scenario:VE45', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test('records · renders the records tab for a V1 subname', {
    tag: ['@scenario:VD45', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'records')
  })

  test('subnames · renders the subnames tab for a V1 subname', {
    tag: ['@scenario:VS45', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 subname', {
    tag: ['@scenario:VR45', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · does not claim a BaseRegistrar token for a name that has none', {
    tag: ['@scenario:VK45', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    test.fail(
      true,
      'E2E-016: claims ERC-721 on the BaseRegistrar with token id labelhash(leaf label) — a 2LD id that reverts on ownerOf today, and belongs to a different name if that 2LD is ever registered',
    )

    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 subname', {
    tag: ['@scenario:VH45', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })

  test('address · renders address resolution for a V1 subname', {
    tag: ['@scenario:VA45', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'address')
  })
})
