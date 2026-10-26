import { injectHeadlessWeb3Provider } from '@ensdomains/headless-web3-provider'
import { expect, type Browser } from '@playwright/test'
import { accountKey, type seedConfiguration } from './seed.js'
import { connectHeadless, localSepolia, overrideManagerFeatureFlags } from './matrix-fixture.js'
import { PERMITTED_SIGN_KINDS, dismissMatrixBackendOverlay } from '../../helpers/manager-auth.js'
import { publicClient } from '../../helpers/anvil-client.js'
import { mockV1Names } from '../../helpers/record-audit-inventory.js'
import { openMigrationFlow } from '../../helpers/migration-flow.js'
import { resolveRecords } from '../../helpers/resolve-records.js'
import { beforePermissions, v2State } from './probes.js'
import { routeToLocalFork, closeFixtureContext } from './local-fork-routing.js'
import { requiresIndependentGraceMigration, INDEPENDENT_GRACE_MIGRATION_RULE } from './migration-policy.js'

/** Actual refusal checkpoint before testing a still-V1 action. Never infer after from before. */
export async function refusalCheckpoint(browser: Browser, f: Awaited<ReturnType<typeof seedConfiguration>>) {
  const c = f.c
  const before = await Promise.all(f.names.map(async name => ({ name, state: await v2State(name), records: await resolveRecords(name, f.recordsFor(name)) })))
  const actorIds = c.actors.filter(a => a.actor !== 'Disconnected').map(a => a.actor)
  const permissionsBefore = Object.fromEntries(await Promise.all(actorIds.map(async actor => [actor, await beforePermissions(f, actor)])))
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  try {
    await routeToLocalFork(page)
    await page.clock.install({ time: new Date(Number((await publicClient.getBlock()).timestamp) * 1000) })
    await overrideManagerFeatureFlags(page, { migration: true, 'profile-view-new': true, 'migration-subname-recreation': c.recreation_flag !== 'OFF' })
    const metadata = await f.metadata()
    for (const name of metadata) if (f.native && c.parent_migrated === 'Yes' && name.name !== f.leaf) Object.assign(name, { migrated: true })
    await mockV1Names(page, metadata)
    const initiator = f.native ? (c.name_holder.startsWith('W') ? c.name_holder : c.name_manager) : c.root_owner
    const wallet = await injectHeadlessWeb3Provider({ page, privateKeys: [accountKey(initiator)], chains: [localSepolia], permitted: [...PERMITTED_SIGN_KINDS] })
    await page.addLocatorHandler(page.getByRole('alertdialog', { name: 'Verify your wallet' }), () => dismissMatrixBackendOverlay(page))
    await connectHeadless(page, wallet)
    await openMigrationFlow(page)
    await expect(page.getByText(/checking your names|checking eligibility|loading your names/i)).toBeHidden({ timeout: 60000 })
    const excluded = f.native && c.name_expiry.startsWith('Expired') && await page.getByRole('checkbox', { name: f.leaf, exact: true }).count() === 0
    if (excluded) {
      const subject = metadata.find(name => name.name === f.leaf)!
      expect(subject.ownerAddress.toLowerCase()).toBe('0x0000000000000000000000000000000000000000')
      expect(subject.wrapperExpiry).toBeLessThanOrEqual(Number((await publicClient.getBlock()).timestamp))
    } else {
      await expect(page.getByText(f.native ? f.leaf : f.root, { exact: true }).first()).toBeVisible({ timeout: 60000 })
      await expect(page.getByText(/Renew your names before upgrading|Renew before upgrade|Subname copying is not available|whole tree is not supported|protections cannot be preserved|permissions and protections|must be included through its parent|expired|parent.*upgrad|owner or resolver could not be verified/i).first()).toBeVisible({ timeout: 60000 })
      const upgrade = page.getByRole('button', { name: /^Upgrade \d+ names?$/ })
      await expect.poll(async () => await upgrade.count() === 0 || !await upgrade.isEnabled(), { timeout: 60000 }).toBe(true)
    }
    const screen = await page.locator('body').innerText()
    expect(screen).not.toContain("Couldn't prepare your upgrade")
    const after = await Promise.all(f.names.map(async name => ({ name, state: await v2State(name), records: await resolveRecords(name, f.recordsFor(name)) })))
    expect(after).toEqual(before)
    const permissionsAfter = Object.fromEntries(await Promise.all(actorIds.map(async actor => [actor, await beforePermissions(f, actor)])))
    for (const actor of actorIds) for (const [action, result] of Object.entries(permissionsBefore[actor])) {
      if (result && typeof result === 'object' && 'result' in result) {
        expect(result.result).not.toBe('BLOCKED')
        expect((permissionsAfter[actor][action as keyof typeof permissionsAfter[string]] as { result: string }).result).toBe(result.result)
      }
    }
    const independentRequired = requiresIndependentGraceMigration(c)
    if (independentRequired) expect.soft(false, INDEPENDENT_GRACE_MIGRATION_RULE + ': this loaded refusal violates the migration requirement; V1 continuity checks still apply').toBe(true)
    return { result: independentRequired ? 'FAIL' : 'PASS', continuityResult: 'PASS', ...(independentRequired ? { confirmedMigrationPolicy: INDEPENDENT_GRACE_MIGRATION_RULE } : {}), outcome: excluded ? 'expired subject excluded; no wallet submission' : 'explicit loaded refusal; no wallet submission', screen, before, after, permissionsBefore, permissionsAfter }
  } finally { await closeFixtureContext(context) }
}
