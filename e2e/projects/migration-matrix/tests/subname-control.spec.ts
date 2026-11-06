import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { injectHeadlessWeb3Provider } from '@ensdomains/headless-web3-provider'
import { publicClient } from '../../../helpers/anvil-client.js'
import {
  dismissBackendAuthModal,
  PERMITTED_SIGN_KINDS,
} from '../../../helpers/manager-auth.js'
import {
  openMigrationFlow,
  rootRow,
  selectOnlyRoots,
  upgradeAndSettle,
} from '../../../helpers/migration-flow.js'
import { connectWithHeadlessWallet as connectExplorer } from '../../../helpers/portal-auth.js'
import { mockV1Names } from '../../../helpers/record-audit-inventory.js'
import { resolveRecords } from '../../../helpers/resolve-records.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'
import { queryFailures, roleQueryEvidence } from '../diagnostics.js'
import { closeFixtureContext, routeToLocalFork } from '../local-fork-routing.js'
import {
  connectHeadless,
  expect,
  localSepolia,
  overrideManagerFeatureFlags,
  test,
} from '../matrix-fixture.js'
import { afterPermissions, beforePermissions, v2State } from '../probes.js'
import { chainActivity, sourceRecords } from '../record-evidence.js'
import {
  account,
  accountKey,
  type Configuration,
  migrateLockedAncestor,
  seedConfiguration,
} from '../seed.js'
import { installInventory } from '../ui-actions.js'

const configurations: Configuration[] = JSON.parse(
  readFileSync(new URL('../configurations.json', import.meta.url), 'utf8'),
)
const ids = process.env.MATRIX_IDS?.split(',') ?? [
  'CFG-0011',
  'CFG-0251',
  'CFG-0860',
  'CFG-0884',
  'CFG-0924',
]
for (const c of configurations.filter((c) => ids.includes(c.config_id))) {
  // An unlocked child's elapsed wrapper timestamp is not an expired
  // emancipated registration. These children can be recreated in V2.
  if (
    c.level === '2LD' ||
    c.root_lifecycle !== 'Active' ||
    c.name_expiry === 'Expired'
  )
    throw new Error(
      `${c.config_id}: this deletion workflow requires a migratable subname; use the grace/refusal tests for other cases`,
    )
  const holder = c.name_holder.startsWith('W') ? c.name_holder : c.name_manager
  for (const actor of process.env.MATRIX_ALL_ACTORS === '1'
    ? c.actors.filter((a) => a.actor !== 'Disconnected').map((a) => a.actor)
    : [...new Set([holder, c.root_owner, 'Unrelated'])]) {
    test(`subname control ${c.config_id} ${actor}`, async ({
      page,
      wallet,
      browser,
    }, info) => {
      info.setTimeout(600000)
      const out = resolve(process.env.REPLACEMENT_RESULTS!, 'supplemental')
      mkdirSync(out, { recursive: true })
      const evidence: Record<string, any> = {
        id: `SUBNAME-CONTROL-${c.config_id}-${actor}`,
        configurations: [c.config_id],
        configuration: c,
        actor,
        appChecks: [],
        checks: {},
        startedAt: new Date().toISOString(),
        phase: 'fixture',
        lifecycleOracleVersion: 'configured-expiry-v1',
        discovery:
          'Exact seeded name listing and real registry state; actual Explorer transactions. This is not indexed-history proof.',
      }
      const save = () =>
        writeFileSync(
          resolve(out, `subname-control-${c.config_id}-${actor}.json`),
          JSON.stringify(
            evidence,
            (_k, v) => (typeof v === 'bigint' ? String(v) : v),
            2,
          ),
        )
      const f = await seedConfiguration(c)
      let context: Awaited<ReturnType<typeof browser.newContext>> | undefined
      try {
        evidence.subject = f.leaf
        evidence.names = f.names
        evidence.historySeed = f.historySeed
        evidence.activeRecords = await resolveRecords(f.leaf, f.records)
        expect(evidence.activeRecords.every((r: any) => r.got === r.want)).toBe(
          true,
        )
        if (f.native && c.parent_migrated === 'Yes') {
          evidence.ancestorSetup = [
            await migrateLockedAncestor(f.root, account(c.root_owner)),
          ]
          if (c.level === '4LD')
            evidence.ancestorSetup.push(
              await migrateLockedAncestor(
                `child.${f.root}`,
                account(c.parent_controller),
              ),
            )
        }
        await f.advance()
        const beforeBlock = await publicClient.getBlock()
        evidence.beforeBlock = beforeBlock.number
        evidence.beforeTimestamp = beforeBlock.timestamp
        evidence.beforeRecords = await resolveRecords(f.leaf, f.records)
        expect(evidence.beforeRecords.every((r: any) => r.got === r.want)).toBe(
          true,
        )
        evidence.beforeRoot = await v2State(f.root)
        evidence.beforePermission = await beforePermissions(f, actor)
        evidence.beforeActivity = await chainActivity(f.startBlock)
        await page.clock.install({
          time: new Date(Number(beforeBlock.timestamp) * 1000),
        })
        await overrideManagerFeatureFlags(page, {
          migration: true,
          'profile-view-new': true,
          'migration-subname-recreation': true,
        })
        const metadata = await f.metadata()
        for (const n of metadata)
          if (f.native && c.parent_migrated === 'Yes' && n.name !== f.leaf)
            Object.assign(n, { migrated: true })
        await mockV1Names(page, metadata)
        await connectHeadless(page, wallet)
        await dismissBackendAuthModal(page, { timeout: 3000 })
        await openMigrationFlow(page)
        const combinedNative =
          f.native &&
          c.parent_migrated === 'No' &&
          holder === c.root_owner &&
          (c.level !== '4LD' || c.parent_controller === holder)
        const target = combinedNative ? f.root : f.native ? f.leaf : f.root
        if ((await page.getByRole('checkbox', { name: /\.eth$/ }).count()) > 1)
          await selectOnlyRoots(page, [target])
        const row = rootRow(page, target)
        await expect(row).toBeEnabled({ timeout: 60000 })
        if (!(await row.isChecked())) await row.locator('xpath=..').click()
        if (c.retain_manager === 'Keep' || c.retain_manager === 'Remove') {
          const keep = page.getByRole('checkbox', {
            name: /Keep .* as a manager/,
          })
          await expect(keep).toBeVisible()
          await keep.setChecked(c.retain_manager === 'Keep')
        }
        evidence.beforeMetadata = metadata
        evidence.phase = 'actual Manager migration'
        save()
        evidence.migrationOutcome = await upgradeAndSettle(page, wallet)
        expect(evidence.migrationOutcome).toBe('success')
        evidence.phase = 'after migration assertions'
        evidence.afterState = await v2State(f.leaf)
        expect(evidence.afterState?.status).toBe(2)
        evidence.afterRoot = await v2State(f.root)
        evidence.afterTreeStates = await Promise.all(
          f.names.map(async (name) => ({ name, state: await v2State(name) })),
        )
        evidence.afterRecords = await resolveRecords(f.leaf, f.records)
        expect(evidence.afterRecords.every((r: any) => r.got === r.want)).toBe(
          true,
        )
        const permission = await afterPermissions(f, actor)
        evidence.afterPermission = permission
        const allowed =
          c.expected_migration.startsWith('Recreate') &&
          (actor === holder || actor === c.root_owner)
        expect(permission?.unregister.result).toBe(
          allowed ? 'ALLOWED' : 'DENIED',
        )
        evidence.phase = 'Explorer child deletion'
        save()
        context = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
        })
        const view = await context.newPage()
        await routeToLocalFork(view)
        await view.clock.install({
          time: new Date(
            Number((await publicClient.getBlock()).timestamp) * 1000,
          ),
        })
        await installInventory(view, f, 'after')
        const signer = await injectHeadlessWeb3Provider({
          page: view,
          privateKeys: [accountKey(actor)],
          chains: [localSepolia],
          permitted: [...PERMITTED_SIGN_KINDS],
        })
        await view.goto(process.env.PORTAL_APP_URL!)
        await connectExplorer(view, signer)
        const parent = f.leaf.split('.').slice(1).join('.')
        await view.goto(`${process.env.PORTAL_APP_URL}/${parent}/subnames`)
        const subjectRow = view
          .getByRole('row')
          .filter({ has: view.getByText(f.leaf, { exact: true }) })
        await expect(subjectRow).toBeVisible({ timeout: 60000 })
        const remove = subjectRow.getByRole('button', {
          name: `Delete ${f.leaf}`,
          exact: true,
        })
        if (allowed) {
          await expect(remove).toBeEnabled({ timeout: 60000 })
          await remove.click()
          await view
            .getByRole('button', { name: 'Confirm', exact: true })
            .click()
          await driveTransactionsToSuccess(view, signer, [], 90000)
          expect((await v2State(f.leaf))?.status).not.toBe(2)
          expect((await v2State(parent))?.status).toBe(2)
          expect(
            (await resolveRecords(parent, f.recordsFor(parent))).every(
              (r) => r.got === r.want,
            ),
          ).toBe(true)
          expect(
            (await sourceRecords(f.leaf, f.records)).every(
              (r) => r.got === r.want,
            ),
          ).toBe(true)
        } else {
          // Wait for permission queries, rather than accepting an initial hidden button.
          evidence.phase = 'Explorer permission readiness'
          await expect
            .poll(
              async () => {
                const queries = (await roleQueryEvidence(view)).filter(
                  (q: any) =>
                    q.active &&
                    JSON.stringify(q.key).includes('ROLE_UNREGISTER'),
                )
                return (
                  queries.length > 0 &&
                  queries.every((q: any) => q.status === 'success')
                )
              },
              { timeout: 60000 },
            )
            .toBe(true)
          evidence.roleQueries = await roleQueryEvidence(view)
          evidence.phase = 'Explorer child deletion'
          await expect(remove).toHaveCount(0)
          expect(await v2State(f.leaf)).toEqual(evidence.afterState)
        }
        evidence.checks['Explorer deletion permission and outcome'] = {
          result: 'PASS',
          expected: allowed ? 'allowed' : 'denied',
        }
        evidence.appChecks.push({
          app: 'Explorer',
          actor,
          stage: 'after',
          action: 'delete subname',
          result: 'PASS',
          detail: allowed
            ? 'Deleted through Explorer; exact child removed, parent and original stored records preserved.'
            : 'Delete unavailable after permissions loaded, matching the expected V2 deletion authority for this wallet. Registration remained unchanged.',
        })
        evidence.screen = await view.locator('body').innerText()
        evidence.queryFailures = await queryFailures(view)
        await view.screenshot({
          path: resolve(out, `subname-control-${c.config_id}-${actor}.png`),
          fullPage: true,
        })
        evidence.phase = 'completed independent child deletion check'
      } catch (error) {
        const view = context?.pages()[0]
        if (view) {
          evidence.screen = await view
            .locator('body')
            .innerText()
            .catch(() => '')
          evidence.roleQueries = await roleQueryEvidence(view)
          await view
            .screenshot({
              path: resolve(
                out,
                `subname-control-${c.config_id}-${actor}-failed.png`,
              ),
              fullPage: true,
            })
            .catch(() => {})
        }
        evidence.error = String(error)
        evidence.appChecks.push({
          app: 'Explorer',
          actor,
          stage: 'after',
          action: 'delete subname',
          result:
            evidence.phase === 'Explorer child deletion' ? 'FAIL' : 'BLOCKED',
          detail: String(error),
        })
        if (evidence.phase === 'after migration assertions')
          evidence.checks['Migration state, records and deletion authority'] = {
            result: 'FAIL',
            detail: String(error),
          }
        throw error
      } finally {
        evidence.finalState = await v2State(f.leaf).catch((e) => String(e))
        evidence.afterActivity = await chainActivity(f.startBlock)
        evidence.activity = evidence.afterActivity
        evidence.completedAt = new Date().toISOString()
        evidence.assertionErrors = info.errors.map((e) => e.message)
        save()
        await closeFixtureContext(context)
      }
    })
  }
}
