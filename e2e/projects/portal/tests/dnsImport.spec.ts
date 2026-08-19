/**
 * DNS import flow (WEB-126) — /import/$name.
 *
 * DNS-over-HTTPS is mocked per test (see helpers/mock-doh.ts); the dnsprovejs
 * wire-format proof queries answer 502, so the final import transaction stays
 * deterministically unavailable — these specs cover the flow UI, its DNS-driven
 * states, and URL-based resume, not proof submission (real DNSSEC signatures
 * cannot be forged against the oracle).
 */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import {
  type Address,
  encodeFunctionData,
  labelhash,
  parseAbi,
  zeroAddress,
  zeroHash,
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
  dohInsecure,
  dohNxDomain,
  dohSecure,
  ensOwnerAnswers,
  mockDnsOverHttps,
} from '../../../helpers/mock-doh.js'

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'

const OFFICIAL_SEPOLIA_RESOLVER = '0x0EF1aF80c24B681991d675176D9c07d8C9236B9a'

/**
 * Mutable DNS state each test flips mid-flow; the route handler reads it on
 * every request, so a UI "Refresh" observes the new state.
 */
type MockDnsState = {
  /** AD flag for the domain itself (DNSSEC-enabled check + ENS1 lookup). */
  domainSecure: boolean
  /** Checksummed address in the `_ens.<domain>` TXT record, or null for NXDOMAIN. */
  ensOwner: string | null
}

const respondWith =
  (domain: string, state: MockDnsState) => (qname: string) => {
    if (qname === `_ens.${domain}`) {
      return state.ensOwner
        ? dohSecure(qname, ensOwnerAnswers(domain, state.ensOwner))
        : dohNxDomain(qname)
    }
    if (qname === domain) {
      return state.domainSecure ? dohSecure(qname, []) : dohInsecure(qname)
    }
    // TLD validation (e.g. `xyz`) and anything else: DNSSEC-enabled.
    return dohSecure(qname, [])
  }

const V1_REGISTRY =
  ensL1Contracts[supportedL1Chains.sepolia].ensLegacyRegistry.address

const REGISTRY_ABI = parseAbi([
  'function owner(bytes32 node) view returns (address)',
  'function setSubnodeOwner(bytes32 node, bytes32 label, address owner)',
])

/**
 * Claim a TLD node in the v1 registry for a custom operator (what `.art`,
 * `.hiphop` etc. did) by impersonating the registry root owner. Returns a
 * skip reason when the environment lacks the v1 registry state.
 */
async function seedCustomTld(
  tld: string,
  operator: Address,
): Promise<string | null> {
  const code = await publicClient
    .getCode({ address: V1_REGISTRY })
    .catch(() => undefined)
  if (!code || code === '0x') {
    return `v1 registry ${V1_REGISTRY} has no code in this environment`
  }

  const rootOwner = await publicClient.readContract({
    address: V1_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: 'owner',
    args: [zeroHash],
  })
  if (rootOwner === zeroAddress) {
    return 'v1 registry root node has no owner in this environment'
  }

  await testClient.setBalance({
    address: rootOwner,
    value: 1_000_000_000_000_000_000n,
  })
  await testClient.impersonateAccount({ address: rootOwner })
  try {
    const hash = await walletClient.sendTransaction({
      account: rootOwner,
      to: V1_REGISTRY,
      data: encodeFunctionData({
        abi: REGISTRY_ABI,
        functionName: 'setSubnodeOwner',
        args: [zeroHash, labelhash(tld), operator],
      }),
    })
    await publicClient.waitForTransactionReceipt({ hash })
  } finally {
    await testClient.stopImpersonatingAccount({ address: rootOwner })
  }
  return null
}

test.describe('DNS import flow', () => {
  test('overview shows the import CTA and opens the flow', async ({ page }) => {
    const domain = `e2e-dns-cta-${Date.now()}.xyz`
    await mockDnsOverHttps(
      page,
      respondWith(domain, { domainSecure: false, ensOwner: null }),
    )

    await page.goto(`${PORTAL_APP_URL}/${domain}`)

    await expect(page.getByText(`${domain} is available!`)).toBeVisible({
      timeout: 30_000,
    })
    await page.getByRole('button', { name: 'Import name' }).click()

    await expect(page).toHaveURL(new RegExp(`/import/${domain}`))
    await expect(
      page.getByText(
        'Importing DNS names allows them to be used as ENS names.',
      ),
    ).toBeVisible()
  })

  test('onchain path: DNSSEC gate, verify states, and reload resume', async ({
    portalPage: page,
    wallet,
    accounts,
  }) => {
    const domain = `e2e-dns-onchain-${Date.now()}.xyz`
    const user = accounts.getAddress('user')
    const stranger = accounts.getAddress('user2')
    const dns: MockDnsState = { domainSecure: false, ensOwner: null }
    await mockDnsOverHttps(page, respondWith(domain, dns))

    // Connect on the base page so the verify step sees a wallet.
    await connectWithHeadlessWallet(page, wallet)

    await page.goto(`${PORTAL_APP_URL}/import/${domain}`)

    // Step 1 — select the onchain type and begin.
    await expect(
      page.getByText(
        'Importing DNS names allows them to be used as ENS names.',
      ),
    ).toBeVisible({ timeout: 30_000 })
    await page.getByText('On-chain import').click()
    await page.getByRole('button', { name: 'Begin' }).click()
    await expect(page).toHaveURL(/step=dnssec/)
    await expect(page).toHaveURL(/type=onchain/)

    // Step 2 — DNSSEC disabled blocks Next; Refresh picks up the change.
    await expect(page.getByText('DNSSEC not enabled')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()

    dns.domainSecure = true
    await page.getByRole('button', { name: 'Refresh' }).click()
    await expect(
      page.getByText('DNSSEC enabled', { exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page).toHaveURL(/step=verify/)

    // Step 3 — the protocol-correct record spec is shown.
    await expect(page.getByText('Verify ownership')).toBeVisible()
    await expect(page.getByText('_ens', { exact: true })).toBeVisible()
    await expect(page.getByText(`a=${user}`)).toBeVisible()

    // No record yet -> None.
    await expect(page.getByText('None', { exact: true })).toBeVisible()

    // Record pointing at someone else -> mismatch, import-without-ownership.
    dns.ensOwner = stranger
    await page.getByRole('button', { name: 'Refresh' }).click()
    await expect(page.getByText('Record does not match')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Import without ownership' }),
    ).toBeVisible()

    // Record matching the connected wallet -> verified + summary.
    dns.ensOwner = user
    await page.getByRole('button', { name: 'Refresh' }).click()
    await expect(page.getByText('Ownership verified')).toBeVisible()
    await expect(page.getByText('Gas cost')).toBeVisible()
    await expect(page.getByText('Owner', { exact: true })).toBeVisible()
    // The DNSSEC proof cannot be fetched (wire-format DNS answers 502), so
    // the import transaction stays unavailable.
    await expect(page.getByRole('button', { name: 'Import' })).toBeDisabled()

    // Reload resumes on the same step from the URL alone.
    await page.reload()
    await expect(page).toHaveURL(/step=verify/)
    await expect(page).toHaveURL(/type=onchain/)
    await expect(page.getByText('Ownership verified')).toBeVisible({
      timeout: 30_000,
    })
  })

  test('custom TLDs are blocked from importing', async ({ page }) => {
    // A TLD whose operator claimed the TLD node in the registry (like
    // .hiphop) runs a custom ENS integration — no import CTA, no flow.
    const tld = `e2ecustom${Date.now() % 1_000_000}`
    const domain = `onshow.${tld}`
    const operator = '0x04ebA57401184A97C919b0B6b4e8dDE263BCb920' as Address

    const skipReason = await seedCustomTld(tld, operator)
    test.skip(skipReason !== null, skipReason ?? undefined)

    // DNSSEC-wise the TLD looks perfectly valid — the block must come from
    // the onchain TLD-node ownership, not the DoH checks.
    await mockDnsOverHttps(page, (qname) => dohSecure(qname, []))

    await page.goto(`${PORTAL_APP_URL}/${domain}`)
    await expect(
      page.getByText(`.${tld} names can't be imported here`),
    ).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Import name' })).toBeHidden()

    await page.goto(`${PORTAL_APP_URL}/import/${domain}`)
    await expect(
      page.getByText(`.${tld} names can't be imported here`),
    ).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Begin' })).toBeHidden()
  })

  test('offchain path shows the ENS1 record with the official resolver', async ({
    portalPage: page,
    wallet,
    accounts,
  }) => {
    const domain = `e2e-dns-offchain-${Date.now()}.xyz`
    const user = accounts.getAddress('user')
    await mockDnsOverHttps(
      page,
      respondWith(domain, { domainSecure: true, ensOwner: null }),
    )

    await connectWithHeadlessWallet(page, wallet)
    await page.goto(
      `${PORTAL_APP_URL}/import/${domain}?type=offchain&step=verify`,
    )

    await expect(page.getByText('Verify ownership')).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText('@', { exact: true })).toBeVisible()
    await expect(
      page.getByText(`ENS1 ${OFFICIAL_SEPOLIA_RESOLVER} ${user}`),
    ).toBeVisible()

    // The domain has no ENS1 record -> None, Claim stays disabled.
    await expect(page.getByText('None', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Claim' })).toBeDisabled()
  })
})
