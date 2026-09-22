/**
 * DNS manager sync banners (WEB-125 / WEB-465) on the name overview.
 *
 * An "imported" DNS name is seeded directly in the v1 registry by
 * impersonating the DNS TLD node's owner (the DNSRegistrar on a Sepolia-fork
 * state) — exactly the registry write `proveAndClaim` performs. The `_ens`
 * TXT record is mocked over DoH per scenario. The sync transaction itself
 * needs a real DNSSEC proof (unforgeable), so the button's failure path is
 * asserted instead of a submitted transaction.
 */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import {
  type Address,
  encodeFunctionData,
  labelhash,
  namehash,
  parseAbi,
  zeroAddress,
} from 'viem'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import {
  publicClient,
  testClient,
  walletClient,
} from '../../../helpers/anvil-client.js'
import {
  dohNxDomain,
  dohSecure,
  ensOwnerAnswers,
  mockDnsOverHttps,
} from '../../../helpers/mock-doh.js'

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'

const V1_REGISTRY =
  ensL1Contracts[supportedL1Chains.sepolia].ensLegacyRegistry.address

const REGISTRY_ABI = parseAbi([
  'function owner(bytes32 node) view returns (address)',
  'function setSubnodeOwner(bytes32 node, bytes32 label, address owner)',
])

/**
 * Create `label.tld` in the v1 registry owned by `owner`, via the TLD node
 * owner (the DNSRegistrar in forked Sepolia state). Returns a skip reason
 * when the environment lacks the v1 DNS state.
 */
async function seedImportedDnsName(
  domain: string,
  owner: Address,
): Promise<string | null> {
  const [label, tld] = domain.split('.')

  const code = await publicClient
    .getCode({ address: V1_REGISTRY })
    .catch(() => undefined)
  if (!code || code === '0x') {
    return `v1 registry ${V1_REGISTRY} has no code in this environment`
  }

  const tldNode = namehash(tld)
  const tldOwner = await publicClient.readContract({
    address: V1_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: 'owner',
    args: [tldNode],
  })
  if (tldOwner === zeroAddress) {
    return `TLD .${tld} has no owner in the v1 registry in this environment`
  }

  await testClient.setBalance({
    address: tldOwner,
    value: 1_000_000_000_000_000_000n,
  })
  await testClient.impersonateAccount({ address: tldOwner })
  try {
    const hash = await walletClient.sendTransaction({
      account: tldOwner,
      to: V1_REGISTRY,
      data: encodeFunctionData({
        abi: REGISTRY_ABI,
        functionName: 'setSubnodeOwner',
        args: [tldNode, labelhash(label), owner],
      }),
    })
    await publicClient.waitForTransactionReceipt({ hash })
  } finally {
    await testClient.stopImpersonatingAccount({ address: tldOwner })
  }
  return null
}

test.describe('DNS manager sync banners', () => {
  test('shows the Sync Manager banner to the DNS owner (not manager)', async ({
    portalPage: page,
    wallet,
    accounts,
  }) => {
    const domain = `e2e-sync-owner-${Date.now()}.xyz`
    const user = accounts.getAddress('user')
    const manager = accounts.getAddress('user2')

    const skipReason = await seedImportedDnsName(domain, manager)
    test.skip(skipReason !== null, skipReason ?? undefined)

    // The `_ens` record designates the connected wallet, not the manager.
    await mockDnsOverHttps(page, (qname) =>
      qname === `_ens.${domain}`
        ? dohSecure(qname, ensOwnerAnswers(domain, user))
        : dohSecure(qname, []),
    )

    await connectWithHeadlessWallet(page, wallet)
    await page.goto(`${PORTAL_APP_URL}/${domain}`)

    await expect(
      page.getByText(
        'You cannot make changes to this name because you are the DNS Owner',
        { exact: false },
      ),
    ).toBeVisible({ timeout: 30_000 })

    // The sync needs a fresh DNSSEC proof, which can't be forged in e2e —
    // clicking surfaces the honest failure state instead of a transaction.
    await page.getByRole('button', { name: 'Sync Manager' }).click()
    await expect(page.getByText('Could not prepare the sync')).toBeVisible({
      timeout: 30_000,
    })
  })

  test('shows the out-of-sync warning to other viewers', async ({ page }) => {
    const domain = `e2e-sync-viewer-${Date.now()}.xyz`
    const manager = '0x5eb3Bc0a489C5A8288765d2336659EbCA68FCd00' as Address
    const dnsOwner = '0x238A8F792dFA6033814B18618aD4100654aeef01'

    const skipReason = await seedImportedDnsName(domain, manager)
    test.skip(skipReason !== null, skipReason ?? undefined)

    // Record designates a third address; the (disconnected) viewer can't fix it.
    await mockDnsOverHttps(page, (qname) =>
      qname === `_ens.${domain}`
        ? dohSecure(qname, ensOwnerAnswers(domain, dnsOwner))
        : dohSecure(qname, []),
    )

    await page.goto(`${PORTAL_APP_URL}/${domain}`)

    await expect(page.getByText('DNS record is out of sync')).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible()

    // The two roles are distinct and the page says so: the `_ens` address owns
    // the name, the registry entry only manages it, and nothing on the page
    // calls that manager the owner (WEB-125).
    await expect(page.getByRole('button', { name: /DNS owner/ })).toBeVisible()
    await expect(page.getByText('Manager', { exact: true })).toBeVisible()
    await expect(page.getByText('Owner', { exact: true })).toBeHidden()
  })

  test('shows no sync banner when the record matches the manager', async ({
    page,
  }) => {
    const domain = `e2e-sync-insync-${Date.now()}.xyz`
    const manager = '0x5eb3Bc0a489C5A8288765d2336659EbCA68FCd00' as Address

    const skipReason = await seedImportedDnsName(domain, manager)
    test.skip(skipReason !== null, skipReason ?? undefined)

    await mockDnsOverHttps(page, (qname) =>
      qname === `_ens.${domain}`
        ? dohSecure(qname, ensOwnerAnswers(domain, manager))
        : qname === domain
          ? dohSecure(qname, [])
          : dohSecure(qname, []),
    )

    await page.goto(`${PORTAL_APP_URL}/${domain}`)

    // Wait for the profile to render, then assert neither banner is present.
    await expect(page.getByRole('heading', { name: domain })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText('DNS record is out of sync')).toBeHidden()
    await expect(
      page.getByText('You cannot make changes to this name', { exact: false }),
    ).toBeHidden()
  })

  test('never queries DNS for names without a v1 owner', async ({ page }) => {
    // Unowned DNS 2LD: the overview shows the import CTA and the sync-status
    // hook stays disabled — no `_ens` lookups fire.
    const domain = `e2e-sync-unowned-${Date.now()}.xyz`
    const ensQueries: string[] = []

    await mockDnsOverHttps(page, (qname) => {
      if (qname.startsWith('_ens.')) ensQueries.push(qname)
      return qname === `_ens.${domain}`
        ? dohNxDomain(qname)
        : dohSecure(qname, [])
    })

    await page.goto(`${PORTAL_APP_URL}/${domain}`)

    await expect(page.getByText(`${domain} is available!`)).toBeVisible({
      timeout: 30_000,
    })
    expect(ensQueries).toEqual([])
  })
})
