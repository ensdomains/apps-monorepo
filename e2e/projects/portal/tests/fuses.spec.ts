/**
 * Portal fuses page for a native V2 name — plan §5.I (I5).
 *
 * V2 names have no fuses at all (that's a V1/NameWrapper concept, replaced by
 * V2's role bitmaps). The oracle is that `/$name/fuses` says so plainly and
 * never renders the fuse table — verified against a direct read of the
 * canonical NameWrapper, the same contract `useWrapperData` reads, so a false
 * "not available" reading (e.g. a swallowed RPC error) cannot pass as this
 * scenario's expected outcome.
 */

import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { nameWrapperGetDataSnippet } from '@ensdomains/ensjs-abi/v1/nameWrapper'
import { type Address, namehash, zeroAddress } from 'viem'
import { expect, test } from '../../../fixtures/playwright.portal.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'

const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]
const NAME_WRAPPER = ensjsSepolia.ensNameWrapper.address

/** The canonical NameWrapper's own opinion on whether `name` is wrapped. */
async function isWrapped(name: string): Promise<boolean> {
  const [owner] = (await publicClient.readContract({
    address: NAME_WRAPPER,
    abi: nameWrapperGetDataSnippet,
    functionName: 'getData',
    args: [BigInt(namehash(name))],
  })) as [Address, number, bigint]
  return owner !== zeroAddress
}

test.describe('Portal fuses', () => {
  test('shows the role model, not fuses, for a native V2 name', {
    tag: ['@scenario:I5'],
  }, async ({ portalPage: page, makeName }) => {
    const name = await makeName({ label: 'fuses-i5-v2-native' })

    expect(
      await isWrapped(name),
      `${name} came from makeName (pure V2 registration) and must not be wrapped`,
    ).toBe(false)

    await page.goto(`${PORTAL_APP_URL}/${name}/fuses`)

    await expect(
      page.getByRole('heading', { name: 'Fuses not available' }),
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      page.getByText(/only available for wrapped ENSv1 names/i),
    ).toBeVisible()

    // No false V1 UI: the fuse table and its burn CTA must be absent, not
    // just hidden behind the message.
    await expect(page.getByRole('table')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Burn fuses' })).toHaveCount(0)
  })
})
