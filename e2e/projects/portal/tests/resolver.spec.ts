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
import { ETH_REGISTRY } from '../../../helpers/role-assertions.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'

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
    tag: ['@scenario:E6'],
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
})
