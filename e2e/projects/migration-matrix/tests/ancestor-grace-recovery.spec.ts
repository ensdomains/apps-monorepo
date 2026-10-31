import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { injectHeadlessWeb3Provider } from '@ensdomains/headless-web3-provider'
import { publicClient } from '../../../helpers/anvil-client.js'
import {
  authorizeTransactionsWhile,
  clickThroughEnableSessions,
  connectWithHeadlessWallet as connectManager,
  dismissBackendAuthModal,
  dismissMatrixBackendOverlay,
  PERMITTED_SIGN_KINDS,
} from '../../../helpers/manager-auth.js'
import {
  openMigrationFlow,
  selectOnlyRoots,
  upgradeAndSettle,
} from '../../../helpers/migration-flow.js'
import { connectWithHeadlessWallet as connectExplorer } from '../../../helpers/portal-auth.js'
import { mockV1Names } from '../../../helpers/record-audit-inventory.js'
import { resolveRecords } from '../../../helpers/resolve-records.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'
import { closeFixtureContext, routeToLocalFork } from '../local-fork-routing.js'
import {
  connectHeadless,
  expect,
  localSepolia,
  overrideManagerFeatureFlags,
  test,
} from '../matrix-fixture.js'
import { beforePermissions, v2State } from '../probes.js'
import { chainActivity, sourceRecords } from '../record-evidence.js'
import {
  account,
  accountKey,
  type Configuration,
  migrateLockedAncestor,
  seedConfiguration,
} from '../seed.js'
import { checkActorUI, installInventory } from '../ui-actions.js'

const configurations: Configuration[] = JSON.parse(
  readFileSync(new URL('../configurations.json', import.meta.url), 'utf8'),
)
const ids = process.env.MATRIX_IDS?.split(',') ?? ['CFG-0864']
for (const c of configurations.filter((c) => ids.includes(c.config_id))) {
  test(`ancestor renewal recovery ${c.config_id}`, async ({
    browser,
    page,
    wallet,
  }, info) => {
    info.setTimeout(1_200_000)
    const out = resolve(process.env.REPLACEMENT_RESULTS!, 'supplemental')
    mkdirSync(out, { recursive: true })
    const evidence: Record<string, any> = {
      id: `GRACE-RECOVERY-${c.config_id}`,
      configurations: [c.config_id],
      checks: {},
      appChecks: [],
      startedAt: new Date().toISOString(),
      phase: 'fixture',
      discovery:
        'Fresh names and seeded discovery. Renewal and migration are actual app transactions; complete records and chain state are read independently.',
    }
    const save = () =>
      writeFileSync(
        resolve(out, `grace-recovery-${c.config_id}.json`),
        JSON.stringify(
          evidence,
          (_k, v) => (typeof v === 'bigint' ? String(v) : v),
          2,
        ),
      )
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    })
    let view = await context.newPage()
    let managerContext:
      | Awaited<ReturnType<typeof browser.newContext>>
      | undefined
    try {
      expect(c.level).toBe('3LD')
      expect(c.root_lifecycle_version).toBe('V2')
      expect(c.root_lifecycle).toBe('Grace')
      expect(c.parent_migrated).toBe('Yes')
      const f = await seedConfiguration(c)
      evidence.subject = f.leaf
      evidence.names = f.names
      evidence.configuration = c
      await migrateLockedAncestor(f.root, account(c.root_owner))
      await f.advance()
      const before = await v2State(f.root)
      evidence.beforeRoot = before
      const graceTime = (await publicClient.getBlock()).timestamp
      expect(before!.latestOwner.toLowerCase()).toBe(
        account(c.root_owner).address.toLowerCase(),
      )
      expect(graceTime).toBeGreaterThanOrEqual(before!.expiry)
      expect(graceTime).toBeLessThan(before!.expiry + 28n * 86_400n)
      evidence.beforeRootTimestamp = String(graceTime)
      evidence.beforeSourceRecords = await sourceRecords(f.leaf, f.records)
      evidence.beforeRecords = await resolveRecords(f.leaf, f.records)
      expect(
        evidence.beforeRecords.some(
          (r: { want: string; got: string }) => r.want !== r.got,
        ),
      ).toBe(true)
      expect((await beforePermissions(f, c.name_holder)).records.result).toBe(
        'ALLOWED',
      )
      evidence.beforeActivity = await chainActivity(f.startBlock)
      evidence.phase = 'renew ancestor through Explorer'
      save()
      await routeToLocalFork(view)
      await installInventory(view, f, 'before')
      await view.clock.install({
        time: new Date(
          Number((await publicClient.getBlock()).timestamp) * 1000,
        ),
      })
      let ownerWallet = await injectHeadlessWeb3Provider({
        page: view,
        privateKeys: [accountKey(c.root_owner)],
        chains: [localSepolia],
        permitted: [...PERMITTED_SIGN_KINDS],
      })
      await view.goto(`${process.env.PORTAL_APP_URL}/${f.root}`)
      await connectExplorer(view, ownerWallet)
      const extend = view.getByRole('button', { name: 'Extend', exact: true })
      await expect
        .poll(
          async () =>
            (await extend.isVisible()) ||
            (await view.getByText('ENSv1', { exact: true }).isVisible()),
          { timeout: 90000 },
        )
        .toBe(true)
      let renewalApp = 'Explorer'
      if (!(await extend.isVisible())) {
        evidence.explorerRenewalScreen = await view.locator('body').innerText()
        evidence.checks[
          'Explorer exposes renewal for a migrated V2 ancestor in grace'
        ] = {
          result: 'FAIL',
          detail:
            'Actual V2 registration retains its holder and is within grace, but the loaded Explorer page identifies it as ENSv1 and has no Extend action.',
        }
        evidence.appChecks.push({
          app: 'Explorer',
          actor: c.root_owner,
          stage: 'before',
          action: 'renew V2 ancestor in grace',
          ...evidence.checks[
            'Explorer exposes renewal for a migrated V2 ancestor in grace'
          ],
        })
        expect
          .soft(
            false,
            'Explorer offers renewal for the actual V2 grace registration',
          )
          .toBe(true)
        save()
        renewalApp = 'Manager'
        evidence.phase =
          'try Manager renewal as recovery for missing Explorer action'
        save()
        // Use an independent wallet session for the second app. Reusing the
        // already-authorized provider can auto-connect before Connect appears;
        // its primary-name label is also unrelated to this renewal fixture.
        managerContext = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
        })
        view = await managerContext.newPage()
        await routeToLocalFork(view)
        await installInventory(view, f, 'before')
        await view.clock.install({
          time: new Date(
            Number((await publicClient.getBlock()).timestamp) * 1000,
          ),
        })
        ownerWallet = await injectHeadlessWeb3Provider({
          page: view,
          privateKeys: [accountKey(c.root_owner)],
          chains: [localSepolia],
          permitted: [...PERMITTED_SIGN_KINDS],
        })
        await overrideManagerFeatureFlags(view, {
          migration: true,
          'profile-view-new': true,
        })
        await view.addLocatorHandler(
          view.getByRole('alertdialog', { name: 'Verify your wallet' }),
          () => dismissMatrixBackendOverlay(view),
        )
        await view.goto(`${process.env.MANAGER_APP_URL}/renew/${f.root}`)
        await connectManager(view, ownerWallet)
        let done = false
        const authorizing = authorizeTransactionsWhile(
          view,
          ownerWallet,
          () => done,
        )
        try {
          await view
            .getByRole('button', { name: /pay with stablecoins/i })
            .click({ timeout: 90000 })
          await clickThroughEnableSessions(view)
          await view
            .getByRole('button', { name: 'Select USDC', exact: true })
            .click()
          const renew = view.getByRole('button', { name: /^Renew name$/i })
          const complete = view.getByText('Renewal Complete!', { exact: true })
          await renew.click()
          // An existing session can submit from this first confirmation. A
          // fresh session may require a second one; wait for the actual state.
          await expect
            .poll(
              async () =>
                (await complete.isVisible()) ||
                ((await renew.isVisible()) && (await renew.isEnabled())),
              { timeout: 180000 },
            )
            .toBe(true)
          if (!(await complete.isVisible())) await renew.click()
          await expect(complete).toBeVisible({ timeout: 180000 })
        } finally {
          done = true
          await authorizing
        }
      } else {
        await extend.click()
        const next = view.getByRole('button', { name: 'Next', exact: true })
        const disclaimer = view.getByRole('button', {
          name: 'Continue',
          exact: true,
        })
        await expect(next.or(disclaimer).first()).toBeVisible({
          timeout: 60000,
        })
        if (await disclaimer.isVisible()) await disclaimer.click()
        await expect(next).toBeEnabled({ timeout: 90000 })
        await next.click()
        const confirm = view.getByRole('button', {
          name: 'Confirm',
          exact: true,
        })
        await expect(confirm).toBeEnabled({ timeout: 90000 })
        await confirm.click()
        await driveTransactionsToSuccess(view, ownerWallet, [], 180000)
      }
      const renewed = await v2State(f.root)
      expect(renewed!.expiry).toBeGreaterThan(before!.expiry)
      expect(renewed!.expiry).toBeGreaterThan(
        (await publicClient.getBlock()).timestamp,
      )
      expect(renewed!.latestOwner).toBe(before!.latestOwner)
      evidence.renewedRoot = renewed
      evidence.afterRenewalRecords = await resolveRecords(f.leaf, f.records)
      expect(
        evidence.afterRenewalRecords.every(
          (r: { want: string; got: string }) => r.want === r.got,
        ),
      ).toBe(true)
      expect(await sourceRecords(f.leaf, f.records)).toEqual(
        evidence.beforeSourceRecords,
      )
      evidence.checks[
        'Renewing ancestor restores all child records without replacing the child resolver'
      ] = {
        result: 'PASS',
        detail: `${f.records.texts!.length} text keys and all seeded address/ABI/interface records read back exactly; source storage unchanged.`,
      }
      evidence.renewalApp = renewalApp
      evidence.appChecks.push({
        app: renewalApp,
        actor: c.root_owner,
        stage: 'before',
        action: 'renew V2 ancestor to restore child resolution',
        result: 'PASS',
        detail:
          'Actual app renewal transaction increased expiry, retained owner, and restored every seeded child record.',
      })
      await view.screenshot({
        path: resolve(out, `grace-recovery-${c.config_id}-renewed.png`),
        fullPage: true,
      })
      save()
      evidence.phase = 'child edit after ancestor renewal'
      evidence.afterRenewalUI = await checkActorUI(
        browser,
        f,
        c.name_holder,
        'before',
        true,
        true,
        'after-ancestor-renewal',
      )
      const editor = evidence.afterRenewalUI.find(
        (x: { app: string }) => x.app === 'Explorer',
      ).checks.editRecords
      expect(editor.result, editor.detail).toBe('PASS')
      expect(editor.detail).toContain('Submitted a distinct record')
      evidence.checks[
        'Child holder can edit through Explorer after ancestor renewal'
      ] = { result: 'PASS', detail: editor.detail }
      evidence.appChecks.push({
        app: 'Explorer',
        actor: c.name_holder,
        stage: 'before',
        action: 'edit child after ancestor renewal',
        result: 'PASS',
        detail: editor.detail,
      })
      save()
      evidence.phase = 'migrate child after ancestor renewal'
      await page.clock.install({
        time: new Date(
          Number((await publicClient.getBlock()).timestamp) * 1000,
        ),
      })
      await overrideManagerFeatureFlags(page, {
        migration: true,
        'profile-view-new': true,
        'migration-subname-recreation': true,
      })
      const metadata = await f.metadata()
      for (const name of metadata)
        if (name.name !== f.leaf) Object.assign(name, { migrated: true })
      await mockV1Names(page, metadata)
      await connectHeadless(page, wallet)
      await dismissBackendAuthModal(page, { timeout: 3000 })
      await openMigrationFlow(page)
      await selectOnlyRoots(page, [f.leaf])
      evidence.migrationOutcome = await upgradeAndSettle(page, wallet)
      expect(evidence.migrationOutcome).toBe('success')
      evidence.afterState = await v2State(f.leaf)
      expect(evidence.afterState.status).toBe(2)
      expect(evidence.afterState.latestOwner.toLowerCase()).toBe(
        account(c.name_holder).address.toLowerCase(),
      )
      evidence.afterRecords = await resolveRecords(f.leaf, f.records)
      expect(
        evidence.afterRecords.every(
          (r: { want: string; got: string }) => r.want === r.got,
        ),
      ).toBe(true)
      evidence.checks[
        'Child migrates after ancestor renewal with exact records and correct holder'
      ] = {
        result: 'PASS',
        detail:
          'Actual Manager migration completed, V2 status is registered, holder matches, and every seeded record resolves.',
      }
      evidence.appChecks.push({
        app: 'Manager',
        actor: c.name_holder,
        stage: 'after',
        action: 'migrate child after ancestor renewal',
        result: 'PASS',
        detail:
          evidence.checks[
            'Child migrates after ancestor renewal with exact records and correct holder'
          ].detail,
      })
      evidence.afterActivity = await chainActivity(f.startBlock)
      evidence.phase = 'completed recovery'
      save()
    } catch (error) {
      evidence.error = String(error)
      evidence.screen = await view
        .locator('body')
        .innerText()
        .catch(() => '')
      await view
        .screenshot({
          path: resolve(out, `grace-recovery-${c.config_id}-failed.png`),
          fullPage: true,
        })
        .catch(() => {})
      throw error
    } finally {
      evidence.completedAt = new Date().toISOString()
      evidence.assertionErrors = info.errors.map((e) => e.message)
      save()
      await closeFixtureContext(managerContext)
      await closeFixtureContext(context)
    }
  })
}
