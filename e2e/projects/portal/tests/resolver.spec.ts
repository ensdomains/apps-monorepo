/**
 * Portal resolver management — plan §5.E (E3, E6).
 *
 * The oracle for a resolver change is `getResolver()` on the registry, read
 * back after the transaction; for input validation it is that the transaction
 * never happens at all.
 */

import { permissionedRegistryGetResolverSnippet } from '@ensdomains/ensjs-abi/v2'
import { type Address, zeroAddress } from 'viem'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { isRealBigname } from '../../../helpers/bigname-sync.js'
import { waitForIndexedName } from '../../../helpers/indexer-sync.js'
import { ETH_REGISTRY } from '../../../helpers/role-assertions.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'
import {
  factoryDeployment,
  wrapFactoryReceipts,
} from '../../../helpers/wrapped-receipt.js'

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'

/** `features/resolver/components/ChangeResolverForm.tsx`. */
const CHANGE_RESOLVER_TX = 'tx-change-resolver'

const readResolver = (label: string) =>
  publicClient.readContract({
    address: ETH_REGISTRY,
    abi: permissionedRegistryGetResolverSnippet,
    functionName: 'getResolver',
    args: [label],
  }) as Promise<Address>

/**
 * Flip "Use custom resolver" and wait until it has actually flipped.
 *
 * A bare click can land before the form hydrates: the switch takes focus, the
 * state never changes, and the address input is never rendered. Retrying on
 * the switch's own checked state is what makes this deterministic.
 */
async function enableCustomResolver(page: import('@playwright/test').Page) {
  const toggle = page.getByRole('switch', { name: 'Use custom resolver' })
  await expect(async () => {
    if ((await toggle.getAttribute('data-state')) !== 'checked') {
      await toggle.click()
    }
    await expect(page.locator('#resolver-address')).toBeVisible({
      timeout: 2_000,
    })
  }).toPass({ timeout: 30_000 })
}

test.describe('Portal resolver', () => {
  test.describe.configure({ timeout: 300_000 })

  test('points a name at a different resolver', {
    tag: ['@smoke', '@scenario:E6'],
  }, async ({ portalPage: page, wallet, makeName }) => {
    await connectWithHeadlessWallet(page, wallet)

    // Two names, each with a seeded record so each gets its own dedicated
    // resolver proxy. The second one's resolver is a real, live address to
    // repoint the first at — better evidence than an arbitrary EOA, since
    // the app must accept something that genuinely resolves.
    const name = await makeName({
      label: 'res-e6',
      owner: 'user',
      records: [{ key: 'seed', value: 'a' }],
    })
    const donor = await makeName({
      label: 'res-e6-donor',
      owner: 'user',
      records: [{ key: 'seed', value: 'b' }],
    })
    const label = name.replace(/\.eth$/, '')
    const target = await readResolver(donor.replace(/\.eth$/, ''))

    const before = await readResolver(label)
    expect(
      before.toLowerCase(),
      'the two names must start on different resolvers for this to prove anything',
    ).not.toBe(target.toLowerCase())

    await page.goto(`${PORTAL_APP_URL}/${name}/change-resolver`)
    await enableCustomResolver(page)
    await page.locator('#resolver-address').fill(target)
    await page.getByRole('button', { name: 'Save changes' }).click()

    await driveTransactionsToSuccess(page, wallet, [CHANGE_RESOLVER_TX])

    expect(
      (await readResolver(label)).toLowerCase(),
      'the registry should point at the resolver that was entered',
    ).toBe(target.toLowerCase())
  })

  test('refuses a malformed resolver address without sending a transaction', {
    tag: ['@scenario:E3'],
  }, async ({ portalPage: page, wallet, makeName }) => {
    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({
      label: 'res-e3',
      owner: 'user',
      records: [{ key: 'seed', value: 'a' }],
    })
    const label = name.replace(/\.eth$/, '')
    const before = await readResolver(label)

    await page.goto(`${PORTAL_APP_URL}/${name}/change-resolver`)
    await enableCustomResolver(page)

    const save = page.getByRole('button', { name: 'Save changes' })
    // Too short, too long, and right-length-but-not-hex. Each must be
    // rejected in the client; none may reach the registry.
    for (const malformed of [
      '0x1234',
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266aa',
      '0xzzzzd6e51aad88F6F4ce6aB8827279cffFb92266',
    ]) {
      await page.locator('#resolver-address').fill(malformed)
      await expect(save, `"${malformed}" must not be submittable`).toBeDisabled(
        { timeout: 10_000 },
      )
    }

    expect(
      (await readResolver(label)).toLowerCase(),
      'no malformed input may have reached the registry',
    ).toBe(before.toLowerCase())
  })

  test('detaches the resolver by setting it to the zero address', {
    tag: ['@scenario:E8'],
  }, async ({ portalPage: page, wallet, makeName }) => {
    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({
      label: 'res-e8',
      owner: 'user',
      records: [{ key: 'seed', value: 'a' }],
    })
    const label = name.replace(/\.eth$/, '')
    expect(
      (await readResolver(label)).toLowerCase(),
      'the name must start with a resolver attached',
    ).not.toBe(zeroAddress)

    await page.goto(`${PORTAL_APP_URL}/${name}/change-resolver`)
    await enableCustomResolver(page)
    await page.locator('#resolver-address').fill(zeroAddress)
    await page.getByRole('button', { name: 'Save changes' }).click()

    await driveTransactionsToSuccess(page, wallet, [CHANGE_RESOLVER_TX])

    expect(
      (await readResolver(label)).toLowerCase(),
      'detaching should clear the resolver slot on the registry',
    ).toBe(zeroAddress)
  })

  test('refuses to change the resolver without ROLE_SET_RESOLVER', {
    tag: ['@scenario:E7'],
  }, async ({ portalPage: page, wallet, makeName, wallets }) => {
    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({
      label: 'res-e7',
      owner: 'user',
      records: [{ key: 'seed', value: 'a' }],
    })
    const label = name.replace(/\.eth$/, '')
    const before = await readResolver(label)

    await wallets.switchTo('stranger')
    await page.goto(`${PORTAL_APP_URL}/${name}/change-resolver`)

    // Route-level guard, not a disabled button: the form must not render at
    // all for a wallet that cannot perform the write.
    await expect(page.getByText('Permission Denied')).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText('ROLE_SET_RESOLVER')).toBeVisible()
    await expect(
      page.getByRole('switch', { name: 'Use custom resolver' }),
      'the resolver form must not be reachable',
    ).toHaveCount(0)

    expect(
      (await readResolver(label)).toLowerCase(),
      'the resolver must be untouched',
    ).toBe(before.toLowerCase())
  })

  test('lists the names a resolver serves on its nodes page', {
    tag: ['@scenario:E11'],
  }, async ({ portalPage: page, wallet, makeName }) => {
    // The nodes table reads bigname, and the route mock answers every resolver
    // lookup with not_found, so the page stops at its empty state.
    test.skip(!isRealBigname, 'needs a real bigname to list the resolver nodes')
    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({
      label: 'res-e11',
      owner: 'user',
      records: [{ key: 'seed', value: 'a' }],
    })
    const resolver = await readResolver(name.replace(/\.eth$/, ''))

    await waitForIndexedName(name)
    await page.goto(`${PORTAL_APP_URL}/resolver/${resolver}/nodes`)

    // The dedicated resolver serves exactly this name, so it must appear as
    // one of its nodes — the page is derived from resolver state, and this
    // is the on-chain fact it should reflect.
    // Assert the table's text rather than matching an element by name: the
    // name cell wraps an EntityBadge that keeps a hidden copy-to-clipboard
    // duplicate of the name, so element-level matches resolve to the hidden
    // one and report `hidden` even though the row is plainly on screen.
    await expect(
      page.locator('table'),
      `${name} resolves through ${resolver} and should be listed as a node`,
    ).toContainText(name, { timeout: 30_000 })
  })

  test('refuses link creation without ROLE_LINK', {
    tag: ['@scenario:E10'],
  }, async ({ portalPage: page, wallet, makeName, wallets }) => {
    // Same as E11: the page checks ROLE_LINK only once the bigname-backed node
    // list has the resolver's names.
    test.skip(!isRealBigname, 'needs a real bigname to list the resolver nodes')
    await connectWithHeadlessWallet(page, wallet)

    const name = await makeName({
      label: 'res-e10',
      owner: 'user',
      records: [{ key: 'seed', value: 'a' }],
    })
    const resolver = await readResolver(name.replace(/\.eth$/, ''))

    // The route short-circuits with "This resolver has no nodes" before it
    // evaluates permissions at all, and its node list is indexer-backed — so
    // without this wait the test intermittently asserts against the wrong
    // page entirely.
    await waitForIndexedName(name)

    await wallets.switchTo('stranger')
    await page.goto(`${PORTAL_APP_URL}/resolver/${resolver}/create-link`)

    await expect(
      page.getByText(/does not have the ROLE_LINK permission/i),
      'a wallet without ROLE_LINK must be told so',
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByRole('button', { name: /^Link name$/ }),
      'and must not be able to submit',
    ).toBeDisabled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// WEB-2200 — a deployed resolver is read only from the factory's own log
//
// The bug: after "Deploy new permissioned resolver", the portal took the new
// resolver's address from the first `ProxyDeployed` log anywhere in the
// receipt. A transaction carried by another contract (a relayed Safe
// execution, say) can hold a `ProxyDeployed` from that contract first, and the
// name was then pointed at whatever address it announced.
//
// The fix: `findDeployedProxyAddress` keeps only logs emitted by the
// `VerifiableFactory` the deploy was sent to.
//
// The unit tests decode hand-built logs. This runs the real deploy and
// `setResolver` on the fork with the decoy added to the receipt the page reads
// (helpers/wrapped-receipt.ts), and checks the resolver the registry records
// against the factory's event in the untouched receipt.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Portal resolver — deployed address comes from the factory (WEB-2200)', () => {
  test.describe.configure({ timeout: 300_000 })

  test('attaches the resolver the factory deployed, not one another contract announced first', {
    tag: ['@smoke'],
  }, async ({ portalPage: page, wallet, makeName }) => {
    await connectWithHeadlessWallet(page, wallet)
    const name = await makeName({
      label: `web2200-res-${Date.now().toString(36)}`,
      owner: 'user',
    })
    const label = name.replace(/\.eth$/, '')
    const { decoy, wrapped } = await wrapFactoryReceipts(page)

    await page.goto(`${PORTAL_APP_URL}/${name}/change-resolver`)
    await page
      .getByRole('switch', { name: /Deploy new permissioned resolver/ })
      .click()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await driveTransactionsToSuccess(page, wallet, [
      'tx-deploy-permissioned-resolver',
      CHANGE_RESOLVER_TX,
    ])
    await expect(page).toHaveURL(new RegExp(`/${name}/resolver$`), {
      timeout: 30_000,
    })

    // The page read the deploy's receipt with the decoy in front.
    const deployment = await factoryDeployment(wrapped)
    expect(
      await publicClient.getCode({ address: deployment.proxy }),
      'the factory deployed a contract',
    ).toMatch(/^0x[0-9a-f]{2,}/i)

    const attached = await readResolver(label)
    // The bug: the name points at the address the other contract announced.
    expect(attached, 'the resolver must not be the decoy').not.toBe(decoy)
    expect(attached).toBe(deployment.proxy)
  })
})
