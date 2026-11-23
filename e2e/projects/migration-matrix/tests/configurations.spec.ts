import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { publicClient } from '../../../helpers/anvil-client.js'
import {
  connectWithHeadlessWallet,
  dismissBackendAuthModal,
} from '../../../helpers/manager-auth.js'
import {
  openMigrationFlow,
  rootRow,
  selectOnlyRoots,
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
import {
  account,
  accountKey,
  type Configuration,
  migrateLockedAncestor,
  seedConfiguration,
} from '../seed.js'

const configurations: Configuration[] = JSON.parse(
  readFileSync(new URL('../configurations.json', import.meta.url), 'utf8'),
)
const selected = process.env.MATRIX_IDS?.split(',')
for (const c of configurations.filter(
  (c) => !selected || selected.includes(c.config_id),
)) {
  test(`${c.config_id} ${c.level} ${c.root_type}/${c.wrapping}/${c.lock} ${c.root_lifecycle} ${c.expected_migration}`, async ({
    page,
    wallet,
  }, info) => {
    const output = resolve(
      process.env.REPLACEMENT_RESULTS ?? 'test-results/migration-matrix',
      'observations',
    )
    mkdirSync(output, { recursive: true })
    const evidence: Record<string, unknown> = {
      configuration: c,
      recordProfile: process.env.MATRIX_RECORD_PROFILE ?? 'baseline-7',
      startedAt: new Date().toISOString(),
      phase: 'fixture',
      discovery: 'mocked; seeded exact identities and canonical checkpoint',
      activity: 'NOT RUN — real indexer required',
    }
    const save = () =>
      writeFileSync(
        resolve(output, `${c.config_id}.json`),
        JSON.stringify(
          evidence,
          (_k, v) => (typeof v === 'bigint' ? String(v) : v),
          2,
        ),
      )
    let fixture: Awaited<ReturnType<typeof seedConfiguration>> | undefined
    try {
      fixture = await seedConfiguration(c)
      const f = fixture
      evidence.names = f.names
      evidence.historySeed = f.historySeed
      evidence.subject = f.leaf
      evidence.activeRecords = await resolveRecords(f.leaf, f.records)
      expect(
        (
          evidence.activeRecords as Awaited<ReturnType<typeof resolveRecords>>
        ).filter((r) => r.want !== r.got),
        'active seed must resolve correctly',
      ).toEqual([])
      if (f.native && c.parent_migrated === 'Yes') {
        evidence.ancestorSetup = [
          await migrateLockedAncestor(f.root, account(c.root_owner)),
        ]
        if (c.level === '4LD')
          (evidence.ancestorSetup as unknown[]).push(
            await migrateLockedAncestor(
              `child.${f.root}`,
              account(c.parent_controller),
            ),
          )
      }
      await f.advance()
      const now = await publicClient.getBlock()
      await page.clock.install({ time: new Date(Number(now.timestamp) * 1000) })
      evidence.beforeBlock = now.number
      evidence.beforeRecords = await resolveRecords(f.leaf, f.records)
      evidence.beforeRoot = await v2State(f.root)
      evidence.beforeSourceRecords = await sourceRecords(f.leaf, f.records)
      evidence.beforeTreeRecords = await Promise.all(
        f.names.map(async (name) => ({
          name,
          records: await resolveRecords(name, f.recordsFor(name)),
        })),
      )
      evidence.beforeActivity = await chainActivity(f.startBlock)
      const actors: Record<string, unknown> = {}
      evidence.actors = actors
      evidence.phase = 'before contract permissions'
      for (const actor of c.actors.filter((a) => a.actor !== 'Disconnected')) {
        const before = await beforePermissions(f, actor.actor)
        actors[actor.case_id] = { actor: actor.actor, before }
        const denied = ['Unrelated'].includes(actor.actor)
        if (denied)
          for (const [action, value] of Object.entries(before))
            if (value && typeof value === 'object')
              expect
                .soft(value.result, `${actor.case_id} unrelated ${action}`)
                .toBe('DENIED')
        const active =
          c.root_lifecycle === 'Active' && !c.name_expiry.startsWith('Expired')
        const holder =
          account(actor.actor).address === f.holderFor(f.leaf).address
        if (active && (holder || actor.actor === 'Resolver delegate'))
          expect
            .soft(
              before.records.result,
              `${actor.case_id} V1 record authorization`,
            )
            .toBe('ALLOWED')
        save()
      }

      evidence.phase = 'migration UI'
      save()
      await overrideManagerFeatureFlags(page, {
        migration: true,
        'profile-view-new': true,
        'migration-subname-recreation': c.recreation_flag !== 'OFF',
      })
      const metadata = await f.metadata()
      evidence.beforeMetadata = metadata
      for (const n of metadata)
        if (f.native && c.parent_migrated === 'Yes' && n.name !== f.leaf)
          Object.assign(n, { migrated: true })
      await mockV1Names(page, metadata)
      const initiatorId = f.native
        ? c.name_holder.startsWith('W')
          ? c.name_holder
          : c.name_manager
        : c.root_owner
      await connectHeadless(page, wallet)
      await dismissBackendAuthModal(page, { timeout: 3000 })
      await openMigrationFlow(page)
      const combinedNative =
        f.native &&
        c.parent_migrated === 'No' &&
        c.root_lifecycle === 'Active' &&
        initiatorId === c.root_owner &&
        (c.level !== '4LD' || c.parent_controller === initiatorId) &&
        !c.name_expiry.startsWith('Expired')
      const target =
        combinedNative ||
        (f.native &&
          c.parent_migrated === 'No' &&
          c.name_expiry.startsWith('Expired') &&
          initiatorId === c.root_owner)
          ? f.root
          : f.native
            ? f.leaf
            : f.root
      let blockedExpected =
        c.expected_migration.startsWith('BLOCK') && !combinedNative
      if (requiresIndependentGraceMigration(c)) {
        evidence.confirmedMigrationPolicy = INDEPENDENT_GRACE_MIGRATION_RULE
        const gate = page.getByText(
          /Some subnames can't upgrade until their parent name is upgraded/i,
        )
        await expect
          .poll(
            async () =>
              (await gate.isVisible()) ||
              (await page
                .getByRole('button', { name: /^Upgrade \d+ names?$/ })
                .isEnabled({ timeout: 1000 })
                .catch(() => false)),
            { timeout: 90000 },
          )
          .toBe(true)
        // Follow an actual refusal far enough to prove unchanged state. The
        // requirement oracle below still FAILS this refusal; it is not an expected block.
        blockedExpected = await gate.isVisible()
      }
      evidence.effectiveExpectation = combinedNative
        ? 'Parent-first requirement can be satisfied within one same-wallet upgrade batch; require actual parent and child migration'
        : c.expected_migration
      const checkbox = rootRow(page, target)
      if (!blockedExpected) {
        await expect(checkbox).toBeVisible({ timeout: 60_000 })
        if ((await page.getByRole('checkbox', { name: /\.eth$/ }).count()) > 1)
          await selectOnlyRoots(page, [target])
        else {
          await expect(checkbox).toBeEnabled({ timeout: 60_000 })
          if (!(await checkbox.isChecked()))
            await checkbox.locator('xpath=..').click()
          await expect(checkbox).toBeChecked({ timeout: 60_000 })
        }
        const keep = page.getByRole('checkbox', {
          name: /Keep .* as a manager/,
        })
        if (c.retain_manager === 'Keep' || c.retain_manager === 'Remove') {
          await expect(keep).toBeVisible()
          await keep.setChecked(c.retain_manager === 'Keep')
        }
        evidence.reviewUI = await page.locator('body').innerText()
        save()
        await expect
          .poll(
            async () =>
              (await page
                .getByRole('button', { name: /^Upgrade \d+ names?$/ })
                .isEnabled()) ||
              (await page
                .getByText("Couldn't prepare your upgrade. Please try again.")
                .isVisible()),
            { timeout: 90_000 },
          )
          .toBe(true)
        if (
          await page
            .getByText("Couldn't prepare your upgrade. Please try again.")
            .isVisible()
        )
          throw new Error(
            'Migration preparation failed before wallet submission',
          )
        evidence.migrationOutcome = await upgradeAndSettle(page, wallet)
        expect
          .soft(evidence.migrationOutcome, 'migration completed in UI')
          .toBe('success')
      } else {
        // A loading screen, empty list, or generic preparation error is not a successful safety refusal.
        const expiredNotListed =
          f.native &&
          c.name_expiry.startsWith('Expired') &&
          (await page
            .getByRole('checkbox', { name: f.leaf, exact: true })
            .count()) === 0
        if (expiredNotListed) {
          const entry = metadata.find((n) => n.name === f.leaf)!
          expect(entry.ownerAddress.toLowerCase()).toBe(
            '0x0000000000000000000000000000000000000000',
          )
          expect(entry.wrapperExpiry).toBeLessThanOrEqual(Number(now.timestamp))
          evidence.expiredHolderProof = entry
          evidence.effectiveExpectation =
            'Expired subject has no wrapper holder and is excluded from upgrade selection; other eligible names in this wallet need not be blocked.'
        } else
          await expect(
            page.getByText(target, { exact: true }).first(),
          ).toBeVisible({ timeout: 60_000 })
        const upgrade = page.getByRole('button', {
          name: /^Upgrade \d+ names?$/,
        })
        await expect(
          page.getByText(
            /checking your names|checking eligibility|loading your names/i,
          ),
        ).toBeHidden({ timeout: 60_000 })
        if (!expiredNotListed)
          await expect(
            page
              .getByText(
                /Renew your names before upgrading|Renew before upgrade|Subname copying is not available|whole tree is not supported|protections cannot be preserved|permissions and protections|must be included through its parent|expired|parent.*upgrad|owner or resolver could not be verified/i,
              )
              .first(),
          ).toBeVisible({ timeout: 60_000 })
        if (!expiredNotListed)
          await expect
            .poll(
              async () =>
                (await upgrade.count()) === 0 || !(await upgrade.isEnabled()),
              { timeout: 60_000 },
            )
            .toBe(true)
        const body = await page.locator('body').innerText()
        evidence.refusalUI = body
        if (!expiredNotListed)
          expect
            .soft(body, 'visible reason for supported refusal')
            .toMatch(
              /renew|grace|subname|parent|unsupported|cannot|can.t|unable|No eligible names/i,
            )
        expect
          .soft(body, 'no generic preparation error counted as safe block')
          .not.toContain("Couldn't prepare your upgrade")
        evidence.migrationOutcome = expiredNotListed
          ? 'expired subject excluded from UI; no wallet submission'
          : 'blocked in UI; no wallet submission'
      }
      evidence.phase = 'after contract checks'
      const state = await v2State(f.leaf)
      evidence.afterState = state
      evidence.afterRoot = await v2State(f.root)
      const after = await resolveRecords(f.leaf, f.records)
      evidence.afterRecords = after
      evidence.afterSourceRecords = await sourceRecords(f.leaf, f.records)
      evidence.afterTreeRecords = await Promise.all(
        f.names.map(async (name) => ({
          name,
          records: await resolveRecords(name, f.recordsFor(name)),
        })),
      )
      evidence.afterActivity = await chainActivity(f.startBlock)
      if (blockedExpected) {
        for (const actor of c.actors.filter(
          (a) => a.actor !== 'Disconnected',
        )) {
          const post = await beforePermissions(f, actor.actor)
          Object.assign(actors[actor.case_id] as object, { afterRefusal: post })
          const prior = (actors[actor.case_id] as { before: typeof post })
            .before
          for (const [action, value] of Object.entries(post))
            if (value && typeof value === 'object') {
              expect
                .soft(
                  value.result,
                  `${actor.case_id} refused migration ${action} read completed`,
                )
                .not.toBe('BLOCKED')
              expect
                .soft(
                  value.result,
                  `${actor.case_id} refused migration preserves ${action} authorization`,
                )
                .toBe(
                  (prior[action as keyof typeof prior] as { result: string })
                    .result,
                )
            }
          save()
        }
        expect
          .soft(
            evidence.afterTreeRecords,
            'refusal preserves every seeded name in the tree',
          )
          .toEqual(evidence.beforeTreeRecords)
        expect
          .soft(
            evidence.afterRoot,
            'refusal leaves root registry state unchanged',
          )
          .toEqual(evidence.beforeRoot)
        expect
          .soft(
            after,
            'refusal preserves pre-existing resolution, including existing expiry refusals',
          )
          .toEqual(evidence.beforeRecords)
      } else {
        for (const tree of evidence.afterTreeRecords as {
          name: string
          records: Awaited<ReturnType<typeof resolveRecords>>
        }[]) {
          const prior = (
            evidence.beforeTreeRecords as typeof evidence.afterTreeRecords as {
              name: string
              records: Awaited<ReturnType<typeof resolveRecords>>
            }[]
          ).find((t) => t.name === tree.name)!
          for (const record of tree.records)
            expect
              .soft(record.got, `tree retention ${tree.name}: ${record.what}`)
              .toBe(prior.records.find((r) => r.what === record.what)!.got)
        }
        expect.soft(state?.status, 'subject registered in V2').toBe(2)
        expect
          .soft(state?.latestOwner.toLowerCase(), 'resulting owner')
          .toBe(
            account(
              c.level === '2LD'
                ? c.root_owner
                : c.name_holder.startsWith('W')
                  ? c.name_holder
                  : c.name_manager,
            ).address.toLowerCase(),
          )
        for (const record of after)
          expect
            .soft(record.got, `after migration ${record.what}`)
            .toBe(record.want)
        if (state?.status === 2) {
          for (const actor of c.actors.filter(
            (a) => a.actor !== 'Disconnected',
          )) {
            const post = await afterPermissions(f, actor.actor)
            Object.assign(actors[actor.case_id] as object, { after: post })
            if (actor.actor === 'Unrelated') {
              for (const action of [
                'records',
                'setResolver',
                'transfer',
              ] as const)
                expect
                  .soft(
                    post?.[action].result,
                    `${actor.case_id} unrelated post-migration ${action}`,
                  )
                  .toBe('DENIED')
            }
            if (
              c.level === '2LD' &&
              c.root_owner !== c.root_manager &&
              actor.actor === c.root_manager
            ) {
              expect
                .soft(post?.registryRoles, 'separate manager exact token grant')
                .toBe(c.retain_manager === 'Keep' ? 1n << 24n : 0n)
              expect
                .soft(
                  post?.resolverRoles,
                  'separate manager exact resolver grant',
                )
                .toBe(c.retain_manager === 'Keep' ? 0x1111111n : 0n)
              expect
                .soft(
                  post?.records.result,
                  'separate manager can edit only when retained',
                )
                .toBe(c.retain_manager === 'Keep' ? 'ALLOWED' : 'DENIED')
            }
            save()
          }
        }
      }
      evidence.retentionAssertions = retentionAssertions(c, evidence)
      for (const check of evidence.retentionAssertions as ReturnType<
        typeof retentionAssertions
      >)
        expect
          .soft(
            check.result,
            `${check.actor ?? c.config_id} ${check.check}: expected ${check.expected}, got ${check.actual}`,
          )
          .toBe('PASS')
      evidence.phase =
        'completed migration and contract probes; action workflows and real activity checks still pending'
    } catch (error) {
      evidence.error = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      if (fixture) {
        evidence.finalState = await v2State(fixture.leaf).catch((e) =>
          String(e),
        )
        evidence.finalRecords = await resolveRecords(
          fixture.leaf,
          fixture.records,
        )
        evidence.finalSourceRecords = await sourceRecords(
          fixture.leaf,
          fixture.records,
        )
      }
      evidence.finalUI = await page
        .locator('body')
        .innerText()
        .catch(() => '')
      evidence.queryFailures = await queryFailures(page)
      evidence.assertionErrors = info.errors.map((e) => e.message)
      evidence.completedAt = new Date().toISOString()
      save()
      await info.attach('configuration evidence', {
        path: resolve(output, `${c.config_id}.json`),
        contentType: 'application/json',
      })
    }
  })
}

import {
  INDEPENDENT_GRACE_MIGRATION_RULE,
  requiresIndependentGraceMigration,
} from '../migration-policy.js'
import { chainActivity, sourceRecords } from '../record-evidence.js'
import { retentionAssertions } from '../retention-oracle.js'
