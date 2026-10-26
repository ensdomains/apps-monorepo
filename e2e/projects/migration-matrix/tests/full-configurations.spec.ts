import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect, overrideManagerFeatureFlags, connectHeadless } from '../matrix-fixture.js'
import { dismissBackendAuthModal, connectWithHeadlessWallet } from '../../../helpers/manager-auth.js'
import { mockV1Names } from '../../../helpers/record-audit-inventory.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { resolveRecords } from '../../../helpers/resolve-records.js'
import { openMigrationFlow, rootRow, upgradeAndSettle, selectOnlyRoots } from '../../../helpers/migration-flow.js'
import { seedConfiguration, account, accountKey, migrateLockedAncestor, type Configuration } from '../seed.js'
import { afterPermissions, beforePermissions, v2State } from '../probes.js'
import { queryFailures } from '../diagnostics.js'
import { sourceRecords, chainActivity } from '../record-evidence.js'
import { checkActorUI } from '../ui-actions.js'
import { allProbesDenied, eachActor } from '../actor-scheduling.js'

const configurations: Configuration[] = JSON.parse(readFileSync(new URL('../configurations.json', import.meta.url), 'utf8'))
const selected = process.env.MATRIX_IDS?.split(',')
for (const c of configurations.filter(c => !selected || selected.includes(c.config_id))) {
  test(`full ${c.config_id} ${c.level} ${c.root_type}/${c.wrapping}/${c.lock} ${c.root_lifecycle} ${c.expected_migration}`, async ({ page, wallet, browser }, info) => {
    // Each independent fixture now exercises every wallet, app, and reversible action.
    // Keep individual navigation/transaction deadlines strict; allow the full set to finish.
    info.setTimeout(5_400_000)
    const output = resolve(process.env.REPLACEMENT_RESULTS ?? 'test-results/migration-matrix', 'observations')
    mkdirSync(output, { recursive: true })
    const evidence: Record<string, unknown> = { configuration: c, recordProfile: process.env.MATRIX_RECORD_PROFILE ?? 'baseline-7', startedAt: new Date().toISOString(), phase: 'fixture', discovery: 'mocked; seeded exact identities and canonical checkpoint', activity: 'NOT RUN — real indexer required' }
    const save = () => writeFileSync(resolve(output, `${c.config_id}.json`), JSON.stringify(evidence, (_k, v) => typeof v === 'bigint' ? String(v) : v, 2))
    let fixture: Awaited<ReturnType<typeof seedConfiguration>> | undefined
    const uiActors = process.env.MATRIX_UI_ACTORS?.split(',')
    const runUI = process.env.MATRIX_UI !== '0'
    const runNamespace = process.env.MATRIX_NAMESPACE_ACTIONS === '1'
    if (runNamespace && process.env.MATRIX_MAX_LEVEL === '3' && c.level === '3LD')
      evidence.scopeExclusions = ['Creating a 4LD below the 3LD subject: excluded, not passed']
    const runPrimary = process.env.MATRIX_PRIMARY_ACTIONS === '1'
    const runDates = process.env.MATRIX_DATE_ACTIONS === '1'
    const namespaceChecks: NamespaceCheck[] = []
    evidence.appChecks = namespaceChecks
    const namespace = async (f: Awaited<ReturnType<typeof seedConfiguration>>, stage: 'before' | 'after') => {
      evidence.phase = `${stage} namespace app workflows`
      const selectedActors = c.actors.filter(a => !uiActors || uiActors.includes(a.actor))
      const baseline = stage === 'before' ? evidence.beforeRecords : evidence.afterRecords
      if (runNamespace) await eachActor(selectedActors, actor => {
        if (actor.actor === 'Disconnected') return false
        const observed = (evidence.actors as Record<string, { before?: unknown; after?: unknown; afterRefusal?: unknown }>)[actor.case_id]
        const permission = stage === 'before' ? observed?.before : observed?.after ?? observed?.afterRefusal
        return !allProbesDenied(permission)
      }, async actor => {
        await checkNamespaceActions(browser, f, actor.actor, stage, check => { namespaceChecks.push(check); save() })
        expect(await resolveRecords(f.leaf, f.records), 'Namespace workflow cleanup preserves the checkpoint records').toEqual(baseline)
      })
      // Reverse claims are real writes, even for wallets that cannot edit this
      // name. They remain serial after every namespace context has finished.
      if (runPrimary) for (const actor of selectedActors) {
        await checkPrimaryActions(browser, f, actor.actor, stage, check => { namespaceChecks.push(check); save() })
        expect(await resolveRecords(f.leaf, f.records), 'Namespace workflow cleanup preserves the checkpoint records').toEqual(stage === 'before' ? evidence.beforeRecords : evidence.afterRecords)
      }
    }
    try {
      const f = fixture = await seedConfiguration(c)
      evidence.names = f.names
      evidence.historySeed = f.historySeed
      evidence.subject = f.leaf
      evidence.activeRecords = await resolveRecords(f.leaf, f.records)
      expect((evidence.activeRecords as Awaited<ReturnType<typeof resolveRecords>>).filter(r => r.want !== r.got), 'active seed must resolve correctly').toEqual([])
      if (f.native && c.parent_migrated === 'Yes') {
        evidence.ancestorSetup = [await migrateLockedAncestor(f.root, account(c.root_owner))]
        if (c.level === '4LD')
          (evidence.ancestorSetup as unknown[]).push(await migrateLockedAncestor(`child.${f.root}`, account(c.parent_controller)))
      }
      await f.advance()
      const now = await publicClient.getBlock()
      await page.clock.install({ time: new Date(Number(now.timestamp) * 1000) })
      evidence.beforeBlock = now.number
      evidence.beforeRecords = await resolveRecords(f.leaf, f.records)
      evidence.beforeRoot = await v2State(f.root)
      evidence.beforeSourceRecords = await sourceRecords(f.leaf, f.records)
      evidence.beforeTreeRecords = await Promise.all(f.names.map(async name => ({ name, records: await resolveRecords(name, f.recordsFor(name)) })))
      evidence.beforeActivity = await chainActivity(f.startBlock)
      const actors: Record<string, unknown> = {}
      evidence.actors = actors
      evidence.phase = 'before contract permissions'
      for (const actor of c.actors.filter(a => a.actor !== 'Disconnected')) {
        const before = await beforePermissions(f, actor.actor)
        actors[actor.case_id] = { actor: actor.actor, before }
        const denied = ['Unrelated'].includes(actor.actor)
        if (denied) for (const [action, value] of Object.entries(before))
          if (value && typeof value === 'object') expect.soft(value.result, `${actor.case_id} unrelated ${action}`).toBe('DENIED')
        const active = c.root_lifecycle === 'Active' && !c.name_expiry.startsWith('Expired')
        const holder = account(actor.actor).address === f.holderFor(f.leaf).address
        if (active && (holder || actor.actor === 'Resolver delegate'))
          expect.soft(before.records.result, `${actor.case_id} V1 record authorization`).toBe('ALLOWED')
        save()
      }

      if (runUI) {
        evidence.phase = 'before app workflows'
        await eachActor(c.actors.filter(a => !uiActors || uiActors.includes(a.actor)),
          actor => (actors[actor.case_id] as { before?: Awaited<ReturnType<typeof beforePermissions>> } | undefined)?.before?.records.result === 'ALLOWED', async actor => {
          const prior = actors[actor.case_id] as { before?: Awaited<ReturnType<typeof beforePermissions>> } | undefined
          const ui = await checkActorUI(browser, f, actor.actor, 'before', prior?.before?.records.result === 'ALLOWED')
          if (!actors[actor.case_id]) actors[actor.case_id] = { actor: actor.actor }
          Object.assign(actors[actor.case_id] as object, { beforeUI: ui })
          save()
          expect(await resolveRecords(f.leaf, f.records), 'UI test cleanup must preserve the baseline before migration').toEqual(evidence.beforeRecords)
        })
      }

      if (runNamespace || runPrimary) await namespace(f, 'before')
      if (runDates) {
        evidence.phase = 'before real-indexer date displays'; save()
        await checkExpiryActions(browser, f, 'before', check => { namespaceChecks.push(check); save() })
      }
      evidence.beforeActivity = await chainActivity(f.startBlock)
      evidence.activityCoverage = { beforeIncludesAppWorkflows: runUI || runNamespace || runPrimary, afterIncludesAppWorkflows: false }
      evidence.phase = 'migration UI'
      save()
      await overrideManagerFeatureFlags(page, { migration: true, 'profile-view-new': true, 'migration-subname-recreation': c.recreation_flag !== 'OFF' })
      const metadata = await f.metadata()
      evidence.beforeMetadata = metadata
      for (const n of metadata) if (f.native && c.parent_migrated === 'Yes' && n.name !== f.leaf) Object.assign(n, { migrated: true })
      await mockV1Names(page, metadata)
      const initiatorId = f.native ? (c.name_holder.startsWith('W') ? c.name_holder : c.name_manager) : c.root_owner
      await connectHeadless(page, wallet)
      await dismissBackendAuthModal(page, { timeout: 3000 })
      await openMigrationFlow(page)
      const combinedNative = f.native && c.parent_migrated === 'No' && c.root_lifecycle === 'Active' && initiatorId === c.root_owner && (c.level !== '4LD' || c.parent_controller === initiatorId) && !c.name_expiry.startsWith('Expired')
      const target = combinedNative || (f.native && c.parent_migrated === 'No' && c.name_expiry.startsWith('Expired') && initiatorId === c.root_owner) ? f.root : f.native ? f.leaf : f.root
      let blockedExpected = c.expected_migration.startsWith('BLOCK') && !combinedNative
      if (requiresIndependentGraceMigration(c)) {
        evidence.confirmedMigrationPolicy = INDEPENDENT_GRACE_MIGRATION_RULE
        const gate = page.getByText(/Some subnames can't upgrade until their parent name is upgraded/i)
        await expect.poll(async () => await gate.isVisible() || await page.getByRole('button', { name: /^Upgrade \d+ names?$/ }).isEnabled({ timeout: 1000 }).catch(() => false), { timeout: 90000 }).toBe(true)
        // Preserve evidence after a real refusal, but fail the confirmed
        // migration requirement in retentionAssertions rather than accepting it.
        blockedExpected = await gate.isVisible()
      }
      evidence.effectiveExpectation = combinedNative ? 'Parent-first requirement can be satisfied within one same-wallet upgrade batch; require actual parent and child migration' : c.expected_migration
      const checkbox = rootRow(page, target)
      if (!blockedExpected) {
        await expect(checkbox).toBeVisible({ timeout: 60_000 })
        if (await page.getByRole('checkbox', { name: /\.eth$/ }).count() > 1)
          await selectOnlyRoots(page, [target])
        else {
          await expect(checkbox).toBeEnabled({ timeout: 60_000 })
          if (!await checkbox.isChecked()) await checkbox.locator('xpath=..').click()
          await expect(checkbox).toBeChecked({ timeout: 60_000 })
        }
        const keep = page.getByRole('checkbox', { name: /Keep .* as a manager/ })
        if (c.retain_manager === 'Keep' || c.retain_manager === 'Remove') {
          await expect(keep).toBeVisible()
          await keep.setChecked(c.retain_manager === 'Keep')
        }
        evidence.reviewUI = await page.locator('body').innerText()
        save()
        // Fee estimation replaces the Upgrade button with Estimating. Poll
        // readiness instead of letting a missing-button locator consume the
        // whole polling budget. Slow archive-backed forks can set a bounded
        // allowance without changing any migration or retention assertion.
        const feeReadyTimeout = Number(process.env.MATRIX_FEE_ESTIMATE_TIMEOUT_MS ?? 90_000)
        if (!Number.isFinite(feeReadyTimeout) || feeReadyTimeout <= 0) throw new Error('Invalid MATRIX_FEE_ESTIMATE_TIMEOUT_MS')
        await expect.poll(async () => (await page.getByRole('button', { name: /^Upgrade \d+ names?$/ }).isEnabled({ timeout: 1000 }).catch(() => false)) ||
          await page.getByText("Couldn't prepare your upgrade. Please try again.").isVisible(), { timeout: feeReadyTimeout }).toBe(true)
        if (await page.getByText("Couldn't prepare your upgrade. Please try again.").isVisible())
          throw new Error('Migration preparation failed before wallet submission')
        evidence.migrationOutcome = await upgradeAndSettle(page, wallet)
        evidence.migrationResultUI = await page.locator('body').innerText()
        evidence.migrationQueryFailures = await queryFailures(page)
        expect.soft(evidence.migrationOutcome, 'migration completed in UI').toBe('success')
      } else {
        // A loading screen, empty list, or generic preparation error is not a successful safety refusal.
        const expiredNotListed = f.native && c.name_expiry.startsWith('Expired') && await page.getByRole('checkbox', { name: f.leaf, exact: true }).count() === 0
        if (expiredNotListed) {
          const entry = metadata.find(n => n.name === f.leaf)!
          expect(entry.ownerAddress.toLowerCase()).toBe('0x0000000000000000000000000000000000000000')
          expect(entry.wrapperExpiry).toBeLessThanOrEqual(Number(now.timestamp))
          evidence.expiredHolderProof = entry
          evidence.effectiveExpectation = 'Expired subject has no wrapper holder and is excluded from upgrade selection; other eligible names in this wallet need not be blocked.'
        } else await expect(page.getByText(target, { exact: true }).first()).toBeVisible({ timeout: 60_000 })
        const upgrade = page.getByRole('button', { name: /^Upgrade \d+ names?$/ })
        await expect(page.getByText(/checking your names|checking eligibility|loading your names/i)).toBeHidden({ timeout: 60_000 })
        if (!expiredNotListed) await expect(page.getByText(/Renew your names before upgrading|Renew before upgrade|Subname copying is not available|whole tree is not supported|protections cannot be preserved|permissions and protections|must be included through its parent|expired|parent.*upgrad|owner or resolver could not be verified/i).first()).toBeVisible({ timeout: 60_000 })
        if (!expiredNotListed) await expect.poll(async () => (await upgrade.count()) === 0 || !(await upgrade.isEnabled()), { timeout: 60_000 }).toBe(true)
        const body = await page.locator('body').innerText()
        evidence.refusalUI = body
        if (!expiredNotListed) expect.soft(body, 'visible reason for supported refusal').toMatch(/renew|grace|subname|parent|unsupported|cannot|can.t|unable|No eligible names/i)
        expect.soft(body, 'no generic preparation error counted as safe block').not.toContain("Couldn't prepare your upgrade")
        evidence.migrationOutcome = expiredNotListed ? 'expired subject excluded from UI; no wallet submission' : 'blocked in UI; no wallet submission'
      }
      evidence.phase = 'after contract checks'
      const state = await v2State(f.leaf)
      evidence.afterState = state
      evidence.afterRoot = await v2State(f.root)
      evidence.afterTreeStates = await Promise.all(f.names.map(async name => ({ name, state: await v2State(name) })))
      const after = await resolveRecords(f.leaf, f.records)
      evidence.afterRecords = after
      evidence.afterSourceRecords = await sourceRecords(f.leaf, f.records)
      evidence.afterTreeRecords = await Promise.all(f.names.map(async name => ({ name, records: await resolveRecords(name, f.recordsFor(name)) })))
      evidence.afterActivity = await chainActivity(f.startBlock)
      if (blockedExpected) {
        for (const actor of c.actors.filter(a => a.actor !== 'Disconnected')) {
          const post = await beforePermissions(f, actor.actor)
          Object.assign(actors[actor.case_id] as object, { afterRefusal: post })
          const prior = (actors[actor.case_id] as { before: typeof post }).before
          for (const [action, value] of Object.entries(post)) if (value && typeof value === 'object')
            expect.soft(value.result, `${actor.case_id} refused migration preserves ${action} authorization`).toBe((prior[action as keyof typeof prior] as { result: string }).result)
          save()
        }
        expect.soft(evidence.afterRoot, 'refusal leaves root registry state unchanged').toEqual(evidence.beforeRoot)
        expect.soft(after, 'refusal preserves pre-existing resolution, including existing expiry refusals').toEqual(evidence.beforeRecords)
      } else {
        expect.soft(state?.status, 'subject registered in V2').toBe(2)
        expect.soft(state?.latestOwner.toLowerCase(), 'resulting owner').toBe(account(c.level === '2LD' ? c.root_owner : (c.name_holder.startsWith('W') ? c.name_holder : c.name_manager)).address.toLowerCase())
        for (const record of after) expect.soft(record.got, `after migration ${record.what}`).toBe(record.want)
        if (state?.status === 2) {
          for (const actor of c.actors.filter(a => a.actor !== 'Disconnected')) {
            const post = await afterPermissions(f, actor.actor)
            Object.assign(actors[actor.case_id] as object, { after: post })
            if (actor.actor === 'Unrelated') {
              for (const action of ['records', 'setResolver', 'transfer'] as const)
                expect.soft(post?.[action].result, `${actor.case_id} unrelated post-migration ${action}`).toBe('DENIED')
            }
            if (c.level === '2LD' && c.root_owner !== c.root_manager && actor.actor === c.root_manager) {
              expect.soft(post?.registryRoles, 'separate manager exact token grant').toBe(c.retain_manager === 'Keep' ? 1n << 24n : 0n)
              expect.soft(post?.resolverRoles, 'separate manager exact resolver grant').toBe(c.retain_manager === 'Keep' ? 0x1111111n : 0n)
              expect.soft(post?.records.result, 'separate manager can edit only when retained').toBe(c.retain_manager === 'Keep' ? 'ALLOWED' : 'DENIED')
            }
            save()
          }
        }
      }

      if (runUI) {
        evidence.phase = 'after app workflows'
        const canActorWrite = (actor: Configuration['actors'][number]) => {
          const prior = actors[actor.case_id] as { before?: Awaited<ReturnType<typeof beforePermissions>>; after?: Awaited<ReturnType<typeof afterPermissions>> } | undefined
          return (blockedExpected ? prior?.before?.records.result : prior?.after?.records.result) === 'ALLOWED'
        }
        await eachActor(c.actors.filter(a => !uiActors || uiActors.includes(a.actor)), canActorWrite, async actor => {
          const prior = actors[actor.case_id] as { before?: Awaited<ReturnType<typeof beforePermissions>>; after?: Awaited<ReturnType<typeof afterPermissions>> } | undefined
          const canWrite = blockedExpected ? prior?.before?.records.result === 'ALLOWED' : prior?.after?.records.result === 'ALLOWED'
          const ui = await checkActorUI(browser, f, actor.actor, blockedExpected ? 'before' : 'after', canWrite, true, 'after')
          if (!actors[actor.case_id]) actors[actor.case_id] = { actor: actor.actor }
          Object.assign(actors[actor.case_id] as object, { afterUI: ui })
          save()
        })
        for (const [caseId, observations] of Object.entries(actors)) {
          const obs = observations as { beforeUI?: Awaited<ReturnType<typeof checkActorUI>>; afterUI?: Awaited<ReturnType<typeof checkActorUI>> }
          for (const stage of ['beforeUI', 'afterUI'] as const) for (const app of obs[stage] ?? [])
            for (const [action, check] of Object.entries(app.checks))
              expect.soft(['PASS', 'N/A'], `${caseId} ${stage} ${app.app} ${action}: ${check.result} — ${check.detail}`).toContain(check.result)
        }
      }
      if (runNamespace || runPrimary) await namespace(f, 'after')
      if (runDates) {
        evidence.phase = 'after real-indexer date displays'; save()
        await checkExpiryActions(browser, f, 'after', check => { namespaceChecks.push(check); save() })
      }
      for (const check of namespaceChecks) expect.soft(check.result, `${check.actor} ${check.stage} ${check.action}: ${check.detail}`).toBe('PASS')
      evidence.afterActivity = await chainActivity(f.startBlock)
      evidence.activityCoverage = { beforeIncludesAppWorkflows: runUI || runNamespace || runPrimary, afterIncludesAppWorkflows: runUI || runNamespace || runPrimary }
      evidence.retentionAssertions = retentionAssertions(c, evidence)
      for (const check of evidence.retentionAssertions as ReturnType<typeof retentionAssertions>) expect.soft(check.result, `${check.actor ?? c.config_id} ${check.check}: expected ${check.expected}, got ${check.actual}`).toBe('PASS')
      evidence.phase = 'completed selected app workflows and migration checks; real indexer activity and remaining actions tracked separately'

    } catch (error) {
      evidence.error = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      if (fixture) {
        // Retain receipts/logs even if a workflow or its cleanup interrupts the
        // fixture. These are diagnostic evidence, not a completed history pass.
        evidence.finalActivity = await chainActivity(fixture.startBlock).catch(error => ({ error: String(error) }))
        if (runPrimary) await restorePrimaryCheckpoints(fixture).catch(error => { evidence.primaryCleanupError = String(error); expect.soft(false, `Primary checkpoint cleanup: ${error}`).toBe(true) })
        evidence.finalState = await v2State(fixture.leaf).catch(e => ({ error: String(e).slice(0, 400) }))
        evidence.finalSourceRecords = await sourceRecords(fixture.leaf, fixture.records).catch(e => ({ error: String(e).slice(0, 400) }))
        evidence.finalRecords = await resolveRecords(fixture.leaf, fixture.records).catch(e => ({ error: String(e).slice(0, 400) }))
      }
      evidence.finalUI = await page.locator('body').innerText().catch(() => '')
      evidence.queryFailures = await queryFailures(page)
      evidence.assertionErrors = info.errors.map(e => e.message)
      evidence.completedAt = new Date().toISOString()
      save()
      await info.attach('configuration evidence', { path: resolve(output, `${c.config_id}.json`), contentType: 'application/json' })
    }
  })
}

import { retentionAssertions } from '../retention-oracle.js'
import { requiresIndependentGraceMigration, INDEPENDENT_GRACE_MIGRATION_RULE } from '../migration-policy.js'
import { checkNamespaceActions, type NamespaceCheck } from '../namespace-actions.js'
import { checkExpiryActions } from '../expiry-actions.js'

import { checkPrimaryActions, restorePrimaryCheckpoints } from '../primary-actions.js'
