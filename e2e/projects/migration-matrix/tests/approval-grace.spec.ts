import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { labelhash, namehash, parseAbi } from 'viem'
import {
  V1_BASE_REGISTRAR,
  V1_NAME_WRAPPER,
} from '../../../fixtures/makeV1Name.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { dismissBackendAuthModal } from '../../../helpers/manager-auth.js'
import {
  openMigrationFlow,
  rootRow,
  upgradeAndSettle,
} from '../../../helpers/migration-flow.js'
import { mockV1Names } from '../../../helpers/record-audit-inventory.js'
import { resolveRecords } from '../../../helpers/resolve-records.js'
import { queryFailures } from '../diagnostics.js'
import {
  connectHeadless,
  expect,
  overrideManagerFeatureFlags,
  test,
} from '../matrix-fixture.js'
import { afterPermissions, beforePermissions, v2State } from '../probes.js'
import { chainActivity, sourceRecords } from '../record-evidence.js'
import { account, type Configuration, seedConfiguration } from '../seed.js'
import { checkActorUI } from '../ui-actions.js'

const configs: Configuration[] = JSON.parse(
  readFileSync(new URL('../configurations.json', import.meta.url), 'utf8'),
)
for (const id of ['CFG-0002', 'CFG-0005', 'CFG-0008', 'CFG-0010'].filter(
  (id) =>
    !process.env.MATRIX_IDS || process.env.MATRIX_IDS.split(',').includes(id),
)) {
  test(`approval grace renew and migrate ${id}`, async ({
    page,
    wallet,
    browser,
  }, info) => {
    info.setTimeout(1200000)
    const c = configs.find((c) => c.config_id === id)!
    const out = resolve(process.env.REPLACEMENT_RESULTS!, 'approval')
    mkdirSync(out, { recursive: true })
    const e: Record<string, any> = {
      id,
      configuration: c,
      startedAt: new Date().toISOString(),
      phase: 'fixture',
      scope:
        'Fresh V1 grace fixture; actual integrated Manager renewal/migration; exact before/after records and roles. Contract/RPC reads are real; name/key discovery is seeded.',
    }
    const save = () =>
      writeFileSync(
        resolve(out, `grace-${id}.json`),
        JSON.stringify(
          e,
          (_k, v) => (typeof v === 'bigint' ? String(v) : v),
          2,
        ),
      )
    const f = await seedConfiguration(c)
    const expiry = () =>
      publicClient.readContract({
        address: V1_BASE_REGISTRAR,
        abi: parseAbi([
          'function nameExpires(uint256 id) view returns(uint256)',
        ]),
        functionName: 'nameExpires',
        args: [BigInt(labelhash(f.label))],
      })
    try {
      e.subject = f.root
      e.names = f.names
      e.historySeed = f.historySeed
      e.activeRecords = await resolveRecords(f.root, f.records)
      expect(e.activeRecords.filter((r: any) => r.want !== r.got)).toEqual([])
      await f.advance()
      const before = await publicClient.getBlock()
      e.beforeExpiry = await expiry()
      e.beforeState = await v2State(f.root)
      e.beforeRecords = await resolveRecords(f.root, f.records)
      e.beforeSourceRecords = await sourceRecords(f.root, f.records)
      expect(before.timestamp).toBeGreaterThan(e.beforeExpiry)
      expect(before.timestamp).toBeLessThan(e.beforeExpiry + 90n * 86400n)
      e.beforeActivity = await chainActivity(f.startBlock)
      e.phase = 'grace editing guards'
      save()
      e.managerBefore = await beforePermissions(f, c.root_manager)
      e.graceUI = await checkActorUI(
        browser,
        f,
        c.root_manager,
        'before',
        e.managerBefore.records.result === 'ALLOWED',
        true,
        'approval-grace',
      )
      for (const view of e.graceUI)
        expect
          .soft(
            view.checks.editRecords.result,
            `${view.app} must require renewal before editing: ${view.checks.editRecords.detail}`,
          )
          .toBe('PASS')
      if (process.env.APPROVAL_GRACE_POLICY_ONLY === '1') {
        e.phase = 'grace editing policy complete; migration tested separately'
        return
      }
      await page.clock.install({
        time: new Date(Number(before.timestamp) * 1000),
      })
      await overrideManagerFeatureFlags(page, {
        migration: true,
        'profile-view-new': true,
        'migration-subname-recreation': true,
      })
      await mockV1Names(page, await f.metadata())
      await connectHeadless(page, wallet)
      await dismissBackendAuthModal(page, { timeout: 3000 })
      await openMigrationFlow(page)
      e.phase = 'integrated renewal preview'
      save()
      const row = rootRow(page, f.root)
      await expect(row).toBeEnabled({ timeout: 90000 })
      if (!(await row.isChecked())) await row.locator('xpath=..').click()
      const keep = page.getByRole('checkbox', { name: /Keep .* as a manager/ })
      if (c.retain_manager === 'Keep') {
        await expect(keep).toBeVisible()
        await keep.check()
      }
      e.preview = await page.locator('body').innerText()
      expect(e.preview, 'Grace flow must disclose renewal').toMatch(/renew/i)
      const upgrade = page.getByRole('button', { name: /^Upgrade \d+ names?$/ })
      const feeFailure = page
        .getByText(/Couldn't estimate the network fee/i)
        .first()
      await expect
        .poll(
          async () =>
            (await upgrade.isEnabled()) || (await feeFailure.isVisible()),
          { timeout: 180000 },
        )
        .toBe(true)
      if (await feeFailure.isVisible()) {
        e.feeFailureUI = await page.locator('body').innerText()
        e.queryFailures = await queryFailures(page)
        save()
        throw new Error(
          'Integrated grace renewal is blocked: app reports it could not estimate the network fee.',
        )
      }
      e.outcome = await upgradeAndSettle(page, wallet)
      e.afterExpiry = await expiry()
      e.afterState = await v2State(f.root)
      e.afterRecords = await resolveRecords(f.root, f.records)
      expect.soft(e.outcome).toBe('success')
      expect
        .soft(e.afterExpiry, 'Actual registrar renewal before migration')
        .toBeGreaterThan(e.beforeExpiry)
      expect
        .soft(e.afterExpiry, 'Renewed out of V1 grace')
        .toBeGreaterThan((await publicClient.getBlock()).timestamp)
      expect.soft(e.afterState?.status).toBe(2)
      expect
        .soft(e.afterState?.latestOwner.toLowerCase())
        .toBe(account(c.root_owner).address.toLowerCase())
      // Renewed premigration expiry includes the full legacy grace end plus one
      // second, minus the V2 28-day grace window.
      expect
        .soft(
          e.afterState?.expiry,
          'Renewed premigration expiry exact boundary',
        )
        .toBe(e.afterExpiry + 62n * 86400n + 1n)
      for (const r of e.afterRecords)
        expect.soft(r.got, `Retained ${r.what}`).toBe(r.want)
      e.managerAfter = await afterPermissions(f, c.root_manager)
      if (c.retain_manager === 'Keep') {
        expect.soft(e.managerAfter?.registryRoles).toBe(1n << 24n)
        expect.soft(e.managerAfter?.resolverRoles).toBe(0x1111111n)
      }
      if (c.root_type !== 'Unwrapped')
        e.wrapperAfter = await publicClient.readContract({
          address: V1_NAME_WRAPPER,
          abi: parseAbi([
            'function getData(uint256 id) view returns(address,uint32,uint64)',
          ]),
          functionName: 'getData',
          args: [BigInt(namehash(f.root))],
        })
      e.phase = 'complete'
    } catch (error) {
      e.error = String(error)
      save()
      throw error
    } finally {
      e.afterActivity = await chainActivity(f.startBlock)
      e.finalState = await v2State(f.root).catch(String)
      e.finalRecords = await resolveRecords(f.root, f.records)
      e.finalSourceRecords = await sourceRecords(f.root, f.records)
      e.finalUI = await page
        .locator('body')
        .innerText()
        .catch(() => '')
      e.queryFailures = await queryFailures(page)
      e.completedAt = new Date().toISOString()
      e.assertionErrors = info.errors.map((x) => x.message)
      save()
      await info.attach('grace approval evidence', {
        path: resolve(out, `grace-${id}.json`),
        contentType: 'application/json',
      })
    }
  })
}
