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

  test('transfer · offers the form to the wallet that holds both halves', {
    tag: ['@scenario:VT1', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · explains that an unwrapped V1 name has no fuses, and offers migration', {
    tag: ['@scenario:VF1', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('roles · refuses role management for a V1 name, and says why', {
    tag: ['@scenario:VL1', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'roles')
  })

  test('resolver · renders the resolver tab, and offers a V1 name no resolver edit', {
    tag: ['@scenario:VE1', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test("records · shows a V1 name's text record with the value the resolver holds", {
    tag: ['@scenario:VD1', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'records')
  })

  test('subnames · renders the subnames tab for a V1 name', {
    tag: ['@scenario:VS1', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 name', {
    tag: ['@scenario:VR1', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · names the BaseRegistrar as the contract holding the token', {
    tag: ['@scenario:VK1', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 name', {
    tag: ['@scenario:VH1', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })

  test('address · resolves a V1 name to the ETH address its resolver holds', {
    tag: ['@scenario:VA1', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'address')
  })

  test('create-subname · refuses subname creation for a V1 name, and says why', {
    tag: ['@scenario:VC1', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'create-subname')
  })

  test('change-resolver · refuses a resolver change for a V1 name, and says why', {
    tag: ['@scenario:VG1', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'change-resolver')
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
    await runCell(page, wallet, seeded, 'overview')
  })

  test('ownership · keeps the registrant and the manager apart', {
    tag: ['@scenario:VO2', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'ownership')
  })

  test('transfer · refuses a wallet that manages the name but does not hold it', {
    tag: ['@scenario:VT2', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · explains that an unwrapped V1 name has no fuses, and offers migration', {
    tag: ['@scenario:VF2', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('resolver · renders the resolver tab, and offers a V1 name no resolver edit', {
    tag: ['@scenario:VE2', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test("records · shows a V1 name's text record with the value the resolver holds", {
    tag: ['@scenario:VD2', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'records')
  })

  test('subnames · renders the subnames tab for a V1 name', {
    tag: ['@scenario:VS2', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 name', {
    tag: ['@scenario:VR2', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · names the BaseRegistrar as the contract holding the token', {
    tag: ['@scenario:VK2', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 name', {
    tag: ['@scenario:VH2', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })

  test('address · resolves a V1 name to the ETH address its resolver holds', {
    tag: ['@scenario:VA2', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'address')
  })
})

test.describe('V1 shape · 2ld-unwrapped:registrant', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('2ld-unwrapped:registrant')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('overview · names the registrant as owner, not the wallet that manages it', {
    tag: ['@scenario:VV3', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'overview')
  })

  test('ownership · names the holder of the ERC-721 as owner', {
    tag: ['@scenario:VO3', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'ownership')
  })

  test('transfer · offers the form to the registrant, who alone can move the token', {
    tag: ['@scenario:VT3', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · explains that an unwrapped V1 name has no fuses, and offers migration', {
    tag: ['@scenario:VF3', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('resolver · renders the resolver tab, and offers a V1 name no resolver edit', {
    tag: ['@scenario:VE3', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test("records · shows a V1 name's text record with the value the resolver holds", {
    tag: ['@scenario:VD3', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'records')
  })

  test('subnames · renders the subnames tab for a V1 name', {
    tag: ['@scenario:VS3', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 name', {
    tag: ['@scenario:VR3', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · names the BaseRegistrar as the contract holding the token', {
    tag: ['@scenario:VK3', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 name', {
    tag: ['@scenario:VH3', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })

  test('address · resolves a V1 name to the ETH address its resolver holds', {
    tag: ['@scenario:VA3', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'address')
  })
})

test.describe('V1 shape · 2ld-unwrapped:stranger', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('2ld-unwrapped:stranger')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('overview · names the holder even when the viewer is nobody', {
    tag: ['@scenario:VV4', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'overview')
  })

  test('ownership · names the holder, and offers a stranger no transfer', {
    tag: ['@scenario:VO4', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'ownership')
  })

  test('transfer · refuses a wallet with no claim on the name', {
    tag: ['@scenario:VT4', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · explains that an unwrapped V1 name has no fuses, and offers migration', {
    tag: ['@scenario:VF4', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('resolver · renders the resolver tab, and offers a V1 name no resolver edit', {
    tag: ['@scenario:VE4', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test("records · shows a V1 name's text record with the value the resolver holds", {
    tag: ['@scenario:VD4', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'records')
  })

  test('subnames · renders the subnames tab for a V1 name', {
    tag: ['@scenario:VS4', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 name', {
    tag: ['@scenario:VR4', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · names the BaseRegistrar as the contract holding the token', {
    tag: ['@scenario:VK4', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 name', {
    tag: ['@scenario:VH4', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })

  test('address · resolves a V1 name to the ETH address its resolver holds', {
    tag: ['@scenario:VA4', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'address')
  })
})

test.describe('V1 shape · 2ld-emancipated:owner', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('2ld-emancipated:owner')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('overview · names the wrapper owner', {
    tag: ['@scenario:VV5', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'overview')
  })

  test('ownership · names the wrapper owner, and offers the transfer', {
    tag: ['@scenario:VO5', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'ownership')
  })

  test('transfer · offers the form for a wrapped name with no blocking fuse', {
    tag: ['@scenario:VT5', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · shows Is Dot ETH as burnt, and the fuses it does not burn as unburnt', {
    tag: ['@scenario:VF5', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('resolver · renders the resolver tab, and offers a V1 name no resolver edit', {
    tag: ['@scenario:VE5', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test("records · shows a V1 name's text record with the value the resolver holds", {
    tag: ['@scenario:VD5', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'records')
  })

  test('subnames · renders the subnames tab for a V1 name', {
    tag: ['@scenario:VS5', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 name', {
    tag: ['@scenario:VR5', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · names the NameWrapper as the contract holding the token', {
    tag: ['@scenario:VK5', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 name', {
    tag: ['@scenario:VH5', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })

  test('address · resolves a V1 name to the ETH address its resolver holds', {
    tag: ['@scenario:VA5', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'address')
  })
})

test.describe('V1 shape · 2ld-emancipated:stranger', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('2ld-emancipated:stranger')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('overview · names the wrapper owner to a viewer who holds nothing', {
    tag: ['@scenario:VV6', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'overview')
  })

  test('ownership · offers a stranger no transfer of a wrapped name', {
    tag: ['@scenario:VO6', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'ownership')
  })

  test('transfer · refuses a stranger to a wrapped name', {
    tag: ['@scenario:VT6', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · shows Is Dot ETH as burnt, and the fuses it does not burn as unburnt', {
    tag: ['@scenario:VF6', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('resolver · renders the resolver tab, and offers a V1 name no resolver edit', {
    tag: ['@scenario:VE6', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test("records · shows a V1 name's text record with the value the resolver holds", {
    tag: ['@scenario:VD6', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'records')
  })

  test('subnames · renders the subnames tab for a V1 name', {
    tag: ['@scenario:VS6', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 name', {
    tag: ['@scenario:VR6', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · names the NameWrapper as the contract holding the token', {
    tag: ['@scenario:VK6', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 name', {
    tag: ['@scenario:VH6', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })

  test('address · resolves a V1 name to the ETH address its resolver holds', {
    tag: ['@scenario:VA6', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'address')
  })
})

test.describe('V1 shape · 2ld-locked:owner', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('2ld-locked:owner')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('overview · names the wrapper owner of a locked name', {
    tag: ['@scenario:VV7', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'overview')
  })

  test('ownership · does not present the NameWrapper contract as the manager', {
    tag: ['@scenario:VO7', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    test.fail(
      true,
      'E2E-015: the Manager row renders the NameWrapper contract address, which is nobody’s account; ens-app-v3 shows no manager row at all for a wrapped name',
    )

    await runCell(page, wallet, seeded, 'ownership')
  })

  test('transfer · offers the form for a locked name that may still move', {
    tag: ['@scenario:VT7', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · shows Cannot Unwrap as burnt, and the fuses it does not burn as unburnt', {
    tag: ['@scenario:VF7', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('resolver · renders the resolver tab, and offers a V1 name no resolver edit', {
    tag: ['@scenario:VE7', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test("records · shows a V1 name's text record with the value the resolver holds", {
    tag: ['@scenario:VD7', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'records')
  })

  test('subnames · renders the subnames tab for a V1 name', {
    tag: ['@scenario:VS7', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 name', {
    tag: ['@scenario:VR7', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · names the NameWrapper as the contract holding the token', {
    tag: ['@scenario:VK7', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 name', {
    tag: ['@scenario:VH7', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })

  test('address · resolves a V1 name to the ETH address its resolver holds', {
    tag: ['@scenario:VA7', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'address')
  })
})

test.describe('V1 shape · 2ld-locked-no-transfer:owner', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('2ld-locked-no-transfer:owner')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('ownership · names the wrapper owner of a name that can never move', {
    tag: ['@scenario:VO8', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'ownership')
  })

  test('transfer · refuses permanently once CANNOT_TRANSFER is burned', {
    tag: ['@scenario:VT8', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · shows Cannot Transfer as burnt, and the fuses it does not burn as unburnt', {
    tag: ['@scenario:VF8', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('resolver · renders the resolver tab, and offers a V1 name no resolver edit', {
    tag: ['@scenario:VE8', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test("records · shows a V1 name's text record with the value the resolver holds", {
    tag: ['@scenario:VD8', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'records')
  })

  test('subnames · renders the subnames tab for a V1 name', {
    tag: ['@scenario:VS8', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 name', {
    tag: ['@scenario:VR8', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · names the NameWrapper as the contract holding the token', {
    tag: ['@scenario:VK8', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 name', {
    tag: ['@scenario:VH8', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })

  test('address · resolves a V1 name to the ETH address its resolver holds', {
    tag: ['@scenario:VA8', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'address')
  })
})

test.describe('V1 shape · 2ld-locked-no-resolver:owner', () => {
  // Seeding a V1 name is ~14 s and every tab below reuses it.
  test.describe.configure({ timeout: 600_000 })

  let seeded: SeededShape

  test.beforeAll(async () => {
    seeded = await seedForSuite('2ld-locked-no-resolver:owner')
  })

  test('the fixture built the shape it claims', {
    tag: ['@v1matrix'],
  }, async () => {
    expect(seeded.name, 'seeding produced no name').toBeTruthy()
  })

  test('ownership · still offers the transfer when only the resolver fuse is burned', {
    tag: ['@scenario:VO9', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'ownership')
  })

  test('transfer · CANNOT_SET_RESOLVER does not block the move itself', {
    tag: ['@scenario:VT9', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'transfer')
  })

  test('fuses · shows Cannot Set Resolver as burnt, and the fuses it does not burn as unburnt', {
    tag: ['@scenario:VF9', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'fuses')
  })

  test('resolver · renders the resolver tab, and offers a V1 name no resolver edit', {
    tag: ['@scenario:VE9', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'resolver')
  })

  test("records · shows a V1 name's text record with the value the resolver holds", {
    tag: ['@scenario:VD9', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'records')
  })

  test('subnames · renders the subnames tab for a V1 name', {
    tag: ['@scenario:VS9', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'subnames')
  })

  test('registry · renders the registry tab for a V1 name', {
    tag: ['@scenario:VR9', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'registry')
  })

  test('token · names the NameWrapper as the contract holding the token', {
    tag: ['@scenario:VK9', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'token')
  })

  test('history · renders the history tab for a V1 name', {
    tag: ['@scenario:VH9', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'history')
  })

  test('address · resolves a V1 name to the ETH address its resolver holds', {
    tag: ['@scenario:VA9', '@v1matrix'],
  }, async ({ portalPage: page, wallet }) => {
    await runCell(page, wallet, seeded, 'address')
  })
})
