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

  test('transfer · offers the form to a registry subname’s holder', {
    tag: ['@scenario:VT20', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · explains that an unwrapped V1 name has no fuses, and offers migration', {
    tag: ['@scenario:VF20', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('resolver · renders the resolver tab for a V1 subname', {
    tag: ['@scenario:VE20', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test('subnames · renders the subnames tab for a V1 subname', {
    tag: ['@scenario:VS20', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 subname', {
    tag: ['@scenario:VR20', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · does not claim a BaseRegistrar token for a name that has none', {
    tag: ['@scenario:VK20', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    test.fail(
      true,
      'E2E-016: claims ERC-721 on the BaseRegistrar with token id labelhash(leaf label) — a 2LD id that reverts on ownerOf today, and belongs to a different name if that 2LD is ever registered',
    )

    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 subname', {
    tag: ['@scenario:VH20', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })
})

test.describe('V1 shape · 3ld-registry+unwrapped-2ld:parent', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('3ld-registry+unwrapped-2ld:parent')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('overview · names the subname holder, not the wallet that holds its parent', {
    tag: ['@scenario:VV21', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'overview')
  })

  test('ownership · names the holder, and offers the parent the reassign it can perform', {
    tag: ['@scenario:VO21', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'ownership')
  })

  test('transfer · offers the parent the reassign path #1144 added', {
    tag: ['@scenario:VT21', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · explains that an unwrapped V1 name has no fuses, and offers migration', {
    tag: ['@scenario:VF21', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('resolver · renders the resolver tab for a V1 subname', {
    tag: ['@scenario:VE21', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test('subnames · renders the subnames tab for a V1 subname', {
    tag: ['@scenario:VS21', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 subname', {
    tag: ['@scenario:VR21', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · does not claim a BaseRegistrar token for a name that has none', {
    tag: ['@scenario:VK21', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    test.fail(
      true,
      'E2E-016: claims ERC-721 on the BaseRegistrar with token id labelhash(leaf label) — a 2LD id that reverts on ownerOf today, and belongs to a different name if that 2LD is ever registered',
    )

    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 subname', {
    tag: ['@scenario:VH21', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })
})

test.describe('V1 shape · 3ld-registry+unwrapped-2ld:stranger', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('3ld-registry+unwrapped-2ld:stranger')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('ownership · offers a stranger no transfer of a subname', {
    tag: ['@scenario:VO22', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'ownership')
  })

  test('transfer · refuses a wallet holding neither the subname nor its parent', {
    tag: ['@scenario:VT22', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · explains that an unwrapped V1 name has no fuses, and offers migration', {
    tag: ['@scenario:VF22', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('resolver · renders the resolver tab for a V1 subname', {
    tag: ['@scenario:VE22', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test('subnames · renders the subnames tab for a V1 subname', {
    tag: ['@scenario:VS22', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 subname', {
    tag: ['@scenario:VR22', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · does not claim a BaseRegistrar token for a name that has none', {
    tag: ['@scenario:VK22', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    test.fail(
      true,
      'E2E-016: claims ERC-721 on the BaseRegistrar with token id labelhash(leaf label) — a 2LD id that reverts on ownerOf today, and belongs to a different name if that 2LD is ever registered',
    )

    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 subname', {
    tag: ['@scenario:VH22', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })
})

test.describe('V1 shape · 3ld-wrapped+emancipated-2ld:owner', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('3ld-wrapped+emancipated-2ld:owner')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('overview · names the wrapper owner of a wrapped subname', {
    tag: ['@scenario:VV23', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'overview')
  })

  test('ownership · names the wrapper owner, and offers the holder the transfer', {
    tag: ['@scenario:VO23', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'ownership')
  })

  test('transfer · offers the holder of a wrapped subname the form', {
    tag: ['@scenario:VT23', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · shows a wrapped subname with no fuses burnt', {
    tag: ['@scenario:VF23', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('resolver · renders the resolver tab for a V1 subname', {
    tag: ['@scenario:VE23', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test('subnames · renders the subnames tab for a V1 subname', {
    tag: ['@scenario:VS23', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 subname', {
    tag: ['@scenario:VR23', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · names the NameWrapper as the contract holding the token', {
    tag: ['@scenario:VK23', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 subname', {
    tag: ['@scenario:VH23', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })
})

test.describe('V1 shape · 3ld-wrapped+emancipated-2ld:parent', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('3ld-wrapped+emancipated-2ld:parent')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('ownership · does not present the NameWrapper contract as the manager', {
    tag: ['@scenario:VO24', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    test.fail(
      true,
      'E2E-015: the Manager row renders the NameWrapper contract address for a wrapped subname, as it does for a wrapped 2LD',
    )

    await runCell(page, wallet, seeded, 'ownership')
  })

  test('transfer · lets the parent reassign a wrapped subname it does not hold', {
    tag: ['@scenario:VT24', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · shows a wrapped subname with no fuses burnt', {
    tag: ['@scenario:VF24', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('resolver · renders the resolver tab for a V1 subname', {
    tag: ['@scenario:VE24', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test('subnames · renders the subnames tab for a V1 subname', {
    tag: ['@scenario:VS24', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 subname', {
    tag: ['@scenario:VR24', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · names the NameWrapper as the contract holding the token', {
    tag: ['@scenario:VK24', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 subname', {
    tag: ['@scenario:VH24', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })
})

test.describe('V1 shape · 3ld-emancipated+locked-2ld:owner', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('3ld-emancipated+locked-2ld:owner')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('ownership · names the holder of an emancipated subname', {
    tag: ['@scenario:VO25', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'ownership')
  })

  test('transfer · offers the holder of an emancipated subname the form', {
    tag: ['@scenario:VT25', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · shows Parent Cannot Control burnt, and the rest unburnt', {
    tag: ['@scenario:VF25', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('resolver · renders the resolver tab for a V1 subname', {
    tag: ['@scenario:VE25', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test('subnames · renders the subnames tab for a V1 subname', {
    tag: ['@scenario:VS25', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 subname', {
    tag: ['@scenario:VR25', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · names the NameWrapper as the contract holding the token', {
    tag: ['@scenario:VK25', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 subname', {
    tag: ['@scenario:VH25', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })
})

test.describe('V1 shape · 3ld-emancipated+locked-2ld:parent', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('3ld-emancipated+locked-2ld:parent')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('ownership · offers the parent no transfer of an emancipated subname', {
    tag: ['@scenario:VO26', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'ownership')
  })

  test('transfer · refuses the parent once the subname has burned PARENT_CANNOT_CONTROL', {
    tag: ['@scenario:VT26', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · shows Parent Cannot Control burnt, and the rest unburnt', {
    tag: ['@scenario:VF26', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('resolver · renders the resolver tab for a V1 subname', {
    tag: ['@scenario:VE26', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test('subnames · renders the subnames tab for a V1 subname', {
    tag: ['@scenario:VS26', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 subname', {
    tag: ['@scenario:VR26', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · names the NameWrapper as the contract holding the token', {
    tag: ['@scenario:VK26', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 subname', {
    tag: ['@scenario:VH26', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })
})

test.describe('V1 shape · 3ld-locked+locked-2ld:owner', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('3ld-locked+locked-2ld:owner')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('ownership · names the holder of a locked subname', {
    tag: ['@scenario:VO27', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'ownership')
  })

  test('transfer · offers the holder of a locked subname the form', {
    tag: ['@scenario:VT27', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · shows Parent Cannot Control and Cannot Unwrap burnt, and the rest unburnt', {
    tag: ['@scenario:VF27', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('resolver · renders the resolver tab for a V1 subname', {
    tag: ['@scenario:VE27', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test('subnames · renders the subnames tab for a V1 subname', {
    tag: ['@scenario:VS27', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 subname', {
    tag: ['@scenario:VR27', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · names the NameWrapper as the contract holding the token', {
    tag: ['@scenario:VK27', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 subname', {
    tag: ['@scenario:VH27', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })
})

test.describe('V1 shape · 3ld-registry+emancipated-2ld:parent', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('3ld-registry+emancipated-2ld:parent')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('ownership · offers no transfer across the wrapper line', {
    tag: ['@scenario:VO28', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'ownership')
  })

  test('transfer · refuses a wrapped parent over an unwrapped subname', {
    tag: ['@scenario:VT28', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · explains that an unwrapped V1 name has no fuses, and offers migration', {
    tag: ['@scenario:VF28', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('resolver · renders the resolver tab for a V1 subname', {
    tag: ['@scenario:VE28', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test('subnames · renders the subnames tab for a V1 subname', {
    tag: ['@scenario:VS28', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 subname', {
    tag: ['@scenario:VR28', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · does not claim a BaseRegistrar token for a name that has none', {
    tag: ['@scenario:VK28', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    test.fail(
      true,
      'E2E-016: claims ERC-721 on the BaseRegistrar with token id labelhash(leaf label) — a 2LD id that reverts on ownerOf today, and belongs to a different name if that 2LD is ever registered',
    )

    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 subname', {
    tag: ['@scenario:VH28', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })
})

test.describe('V1 shape · 3ld-wrapped+unwrapped-2ld:owner', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('3ld-wrapped+unwrapped-2ld:owner')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('ownership · names the holder of a wrapped subname under an unwrapped parent', {
    tag: ['@scenario:VO29', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'ownership')
  })

  test('transfer · lets the holder move it, whatever the parent is wrapped in', {
    tag: ['@scenario:VT29', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · shows a wrapped subname with no fuses burnt', {
    tag: ['@scenario:VF29', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('resolver · renders the resolver tab for a V1 subname', {
    tag: ['@scenario:VE29', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test('subnames · renders the subnames tab for a V1 subname', {
    tag: ['@scenario:VS29', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 subname', {
    tag: ['@scenario:VR29', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · names the NameWrapper as the contract holding the token', {
    tag: ['@scenario:VK29', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 subname', {
    tag: ['@scenario:VH29', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })
})

test.describe('V1 shape · 3ld-wrapped+unwrapped-2ld:parent', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('3ld-wrapped+unwrapped-2ld:parent')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('ownership · offers no transfer across the wrapper line, in the other direction', {
    tag: ['@scenario:VO30', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'ownership')
  })

  test('transfer · refuses an unwrapped parent over a wrapped subname', {
    tag: ['@scenario:VT30', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · shows a wrapped subname with no fuses burnt', {
    tag: ['@scenario:VF30', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('resolver · renders the resolver tab for a V1 subname', {
    tag: ['@scenario:VE30', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test('subnames · renders the subnames tab for a V1 subname', {
    tag: ['@scenario:VS30', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 subname', {
    tag: ['@scenario:VR30', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · names the NameWrapper as the contract holding the token', {
    tag: ['@scenario:VK30', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 subname', {
    tag: ['@scenario:VH30', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })
})

test.describe('V1 shape · 3ld-registry+unwrapped-2ld:parent-registrant-only', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite(
      '3ld-registry+unwrapped-2ld:parent-registrant-only',
    )
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('ownership · offers no transfer to a parent registrant who cannot write the registry', {
    tag: ['@scenario:VO31', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'ownership')
  })

  test('transfer · tells the parent registrant to reclaim the manager role first', {
    tag: ['@scenario:VT31', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · explains that an unwrapped V1 name has no fuses, and offers migration', {
    tag: ['@scenario:VF31', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('resolver · renders the resolver tab for a V1 subname', {
    tag: ['@scenario:VE31', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test('subnames · renders the subnames tab for a V1 subname', {
    tag: ['@scenario:VS31', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 subname', {
    tag: ['@scenario:VR31', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · does not claim a BaseRegistrar token for a name that has none', {
    tag: ['@scenario:VK31', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    test.fail(
      true,
      'E2E-016: claims ERC-721 on the BaseRegistrar with token id labelhash(leaf label) — a 2LD id that reverts on ownerOf today, and belongs to a different name if that 2LD is ever registered',
    )

    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 subname', {
    tag: ['@scenario:VH31', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })
})
