import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  injectHeadlessWeb3Provider,
  Web3RequestKind,
} from '@ensdomains/headless-web3-provider'
import type { Page } from '@playwright/test'
import {
  encodeFunctionData,
  namehash,
  parseAbi,
  stringToHex,
  zeroHash,
} from 'viem'
import { V1_PUBLIC_RESOLVER } from '../../../fixtures/makeV1Name.js'
import { setV1RecordsOn } from '../../../fixtures/v1-records.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { preserveWalletRpcErrors } from '../../../helpers/headless-wallet-errors.js'
import {
  authorizeTransactionsWhile,
  dismissBackendAuthModal,
  PERMITTED_SIGN_KINDS,
} from '../../../helpers/manager-auth.js'
import {
  openMigrationFlow,
  rootRow,
  upgradeAndSettle,
} from '../../../helpers/migration-flow.js'
import { connectWithHeadlessWallet as connectExplorer } from '../../../helpers/portal-auth.js'
import { mockV1Names } from '../../../helpers/record-audit-inventory.js'
import { resolveRecords } from '../../../helpers/resolve-records.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'
import { queryFailures } from '../diagnostics.js'
import { closeFixtureContext, routeToLocalFork } from '../local-fork-routing.js'
import {
  connectHeadless,
  expect,
  localSepolia,
  overrideManagerFeatureFlags,
  test,
} from '../matrix-fixture.js'
import { afterPermissions, v2State } from '../probes.js'
import { chainActivity, sourceRecords } from '../record-evidence.js'
import { accountKey, type Configuration, seedConfiguration } from '../seed.js'
import { installInventory } from '../ui-actions.js'

const configs: Configuration[] = JSON.parse(
  readFileSync(new URL('../configurations.json', import.meta.url), 'utf8'),
)
const selected = process.env.MATRIX_IDS?.split(',') ?? ['CFG-0011']
for (const c of configs.filter((c) => selected.includes(c.config_id))) {
  if (!c.expected_migration.startsWith('Recreate'))
    throw new Error(
      `${c.config_id}: resolver-copy fixture requires supported direct-child recreation`,
    )
  for (const variant of (
    [
      'supported',
      'json-object',
      'pubkey',
      'required-read-failure',
      'missing-inventory',
      'cancel-review',
      'reject-first',
      'reject-after-setup',
    ] as const
  ).filter(
    (value) =>
      !process.env.MATRIX_S4_VARIANT ||
      process.env.MATRIX_S4_VARIANT.split(',').includes(value),
  )) {
    test(`S4 ${c.config_id} recreated child: ${variant} resolver import`, async ({
      page: migrationPage,
      wallet: migrationWallet,
      browser,
    }, info) => {
      let page = migrationPage,
        wallet = migrationWallet
      let importContext:
        | Awaited<ReturnType<typeof browser.newContext>>
        | undefined
      const profile = process.env.MATRIX_RECORD_PROFILE ?? 'baseline-7'
      const suffix = `${c.config_id}-${variant}-${profile}`
      info.setTimeout(600000)
      const output = resolve(process.env.REPLACEMENT_RESULTS!, 'supplemental')
      mkdirSync(output, { recursive: true })
      const evidence: Record<string, unknown> = {
        id: `S4-${suffix}`,
        configurations: [c.config_id],
        configuration: c,
        variant,
        recordProfile: profile,
        phase: 'fixture',
        startedAt: new Date().toISOString(),
        lifecycleOracleVersion: 'configured-expiry-v1',
        discovery:
          'Seeded inventory; app submission and resolver reads are real. Original and final chain activity require a separate real-indexer and Explorer replay.',
      }
      const save = () =>
        writeFileSync(
          resolve(output, `resolver-import-${suffix}.json`),
          JSON.stringify(
            evidence,
            (_k, v) => (typeof v === 'bigint' ? String(v) : v),
            2,
          ),
        )
      let f: Awaited<ReturnType<typeof seedConfiguration>> | undefined
      try {
        const base = await seedConfiguration(c)
        f = {
          ...base,
          records: {
            ...base.records,
            ...(variant === 'json-object'
              ? {
                  abis: [
                    ...(base.records.abis ?? []).filter(
                      (record) => record.contentType !== 1,
                    ),
                    {
                      contentType: 1,
                      data: stringToHex('{"name":"LegacyObject","abi":[]}'),
                    },
                  ],
                }
              : {}),
            ...(variant === 'pubkey'
              ? {
                  pubkey: {
                    x: `0x${'ab'.repeat(32)}` as `0x${string}`,
                    y: zeroHash,
                  },
                }
              : {}),
          },
        }
        if (variant === 'json-object' || variant === 'pubkey')
          await setV1RecordsOn(
            f.leaf,
            f.holderFor(f.leaf),
            f.wrappedFor(f.leaf),
            variant === 'pubkey'
              ? { pubkey: f.records.pubkey }
              : {
                  abis: f.records.abis?.filter(
                    (record) => record.contentType === 1,
                  ),
                },
          )
        const sourceResolver = V1_PUBLIC_RESOLVER
        let failRequiredRead = false
        let failedRequests = 0
        let installRequiredReadFault:
          | ((target: Page) => Promise<void>)
          | undefined
        if (variant === 'required-read-failure') {
          const textCall = encodeFunctionData({
            abi: parseAbi([
              'function text(bytes32 node,string key) view returns(string)',
            ]),
            functionName: 'text',
            args: [namehash(f.leaf), 'url'],
          })
            .slice(2)
            .toLowerCase()
          const installReadFault = async (target: Page) =>
            target.route('**/*', async (route) => {
              const request = route.request()
              if (
                failRequiredRead &&
                request.method() === 'POST' &&
                (request.postData() ?? '').toLowerCase().includes(textCall)
              ) {
                failedRequests++
                await route.fulfill({
                  status: 503,
                  contentType: 'application/json',
                  body: JSON.stringify({
                    error:
                      'Injected transport outage for this name’s required URL record read',
                  }),
                  headers: { 'access-control-allow-origin': '*' },
                })
              } else await route.fallback()
            })
          installRequiredReadFault = installReadFault
          await installReadFault(page)
          evidence.faultModel =
            'Bounded RPC transport outage only for the exact URL-record read during import. Contract code and stored records are unchanged; all reads outside the injected outage reach the real fork.'
        }
        evidence.sourceResolver = sourceResolver
        evidence.name = f.leaf
        evidence.subject = f.leaf
        evidence.names = f.names
        evidence.historySeed = f.historySeed
        evidence.activeRecords = await resolveRecords(f.leaf, f.records)
        expect(
          (
            evidence.activeRecords as Awaited<ReturnType<typeof resolveRecords>>
          ).every((r) => r.got === r.want),
        ).toBe(true)
        await f.advance()
        const beforeBlock = await publicClient.getBlock()
        evidence.beforeBlock = beforeBlock.number
        evidence.beforeTimestamp = beforeBlock.timestamp
        evidence.beforeRoot = await v2State(f.root)
        evidence.beforeMigration = await resolveRecords(f.leaf, f.records)
        expect(
          (
            evidence.beforeMigration as Awaited<
              ReturnType<typeof resolveRecords>
            >
          ).every((r) => r.got === r.want),
        ).toBe(true)
        evidence.beforeRecords = evidence.beforeMigration
        evidence.beforeActivity = await chainActivity(f.startBlock)
        await page.clock.install({
          time: new Date(Number(beforeBlock.timestamp) * 1000),
        })
        await overrideManagerFeatureFlags(page, {
          migration: true,
          'profile-view-new': true,
          'migration-subname-recreation': true,
        })
        const inventory = await f.metadata()
        await mockV1Names(
          page,
          inventory.map((n) =>
            n.name === f!.leaf ? { ...n, resolver: sourceResolver } : n,
          ),
        )
        await connectHeadless(page, wallet)
        await dismissBackendAuthModal(page, { timeout: 3000 })
        await openMigrationFlow(page)
        const root = rootRow(page, f.root)
        await expect(root).toBeEnabled({ timeout: 60000 })
        if (!(await root.isChecked())) await root.locator('xpath=..').click()
        if (c.retain_manager === 'Keep' || c.retain_manager === 'Remove') {
          const keep = page.getByRole('checkbox', {
            name: /Keep .* as a manager/,
          })
          await expect(keep).toBeVisible()
          await keep.setChecked(c.retain_manager === 'Keep')
          evidence.keepManagerSelected = await keep.isChecked()
        }
        evidence.migrationOutcome = await upgradeAndSettle(page, wallet)
        expect(evidence.migrationOutcome).toBe('success')
        evidence.afterMigration = await resolveRecords(f.leaf, f.records)
        expect(
          (
            evidence.afterMigration as Awaited<
              ReturnType<typeof resolveRecords>
            >
          ).every((r) => r.got === r.want),
        ).toBe(true)
        evidence.afterRecords = evidence.afterMigration
        const state = await v2State(f.leaf)
        expect(state?.status).toBe(2)
        evidence.afterState = state
        evidence.afterRoot = await v2State(f.root)
        evidence.afterTreeStates = await Promise.all(
          f.names.map(async (name) => ({ name, state: await v2State(name) })),
        )
        if (c.retain_manager === 'Keep' || c.retain_manager === 'Remove') {
          const retained = await afterPermissions(
            { ...f, leaf: f.root, records: f.recordsFor(f.root) },
            c.root_manager,
          )
          evidence.rootManagerAfterMigration = retained
          expect(
            retained?.registryRoles,
            'Configured root manager registry grant',
          ).toBe(c.retain_manager === 'Keep' ? 1n << 24n : 0n)
          expect(
            retained?.resolverRoles,
            'Configured root manager record grant',
          ).toBe(c.retain_manager === 'Keep' ? 0x1111111n : 0n)
        }
        const currentResolver = () =>
          publicClient.readContract({
            address: state!.registry,
            abi: parseAbi([
              'function getResolver(string label) view returns(address)',
            ]),
            functionName: 'getResolver',
            args: [state!.label],
          })
        expect((await currentResolver()).toLowerCase()).toBe(
          sourceResolver.toLowerCase(),
        )
        evidence.phase = 'S4 import review'
        const importer = c.name_holder.startsWith('W')
          ? c.name_holder
          : c.name_manager
        evidence.importer = importer
        save()
        if (importer !== c.root_owner) {
          importContext = await browser.newContext({
            viewport: { width: 1440, height: 1000 },
          })
          page = await importContext.newPage()
          await routeToLocalFork(page)
          if (installRequiredReadFault) await installRequiredReadFault(page)
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
          await page.addLocatorHandler(
            page.getByRole('alertdialog', { name: 'Verify your wallet' }),
            async () => {
              await page.keyboard.type('skip', { delay: 50 })
            },
          )
          wallet = await injectHeadlessWeb3Provider({
            page,
            privateKeys: [accountKey(importer)],
            chains: [localSepolia],
            permitted: [...PERMITTED_SIGN_KINDS],
          })
          await connectHeadless(page, wallet)
          await dismissBackendAuthModal(page, { timeout: 3000 })
        }
        if (variant === 'reject-first' || variant === 'reject-after-setup')
          preserveWalletRpcErrors(wallet)
        await installInventory(page, f, 'after')
        if (variant === 'missing-inventory') {
          await page.route(
            /\/v1\/names\/[^/]+\/records(?:\?|$)/,
            async (route) => {
              if (
                failRequiredRead &&
                decodeURIComponent(
                  new URL(route.request().url()).pathname.split('/')[3],
                ) === f!.leaf
              ) {
                failedRequests++
                await route.fulfill({
                  status: 503,
                  json: {
                    error: {
                      code: 'injected_inventory_outage',
                      message: 'Inventory unavailable for this fixture',
                    },
                  },
                })
              } else await route.fallback()
            },
          )
          evidence.faultModel =
            'Exact name-record inventory endpoint returns HTTP 503 during import. Contract state and record reads remain real.'
        }
        await page.goto(`${process.env.MANAGER_APP_URL}/${f.leaf}`)
        const entry = page
          .getByRole('button', {
            name: /^(Upgrade resolver|Copy & edit records)$/,
          })
          .first()
        await expect(entry).toBeVisible({ timeout: 120000 })
        if (
          variant === 'required-read-failure' ||
          variant === 'missing-inventory'
        ) {
          failRequiredRead = true
          evidence.readFailureActivated =
            'Exact required record read transport fault enabled'
        }
        await entry.click()
        await expect(
          page.getByText('Review imported records', { exact: true }),
        ).toBeVisible({ timeout: 60000 })
        evidence.importReview = await page.locator('body').innerText()
        await page.screenshot({
          path: resolve(output, `resolver-import-${suffix}-review.png`),
          fullPage: true,
        })
        const acknowledge = page.getByRole('checkbox', {
          name: /I have reviewed the imported records/,
        })
        if (variant === 'cancel-review') {
          await expect(acknowledge).toBeEnabled()
          await acknowledge.check()
          await page
            .getByRole('button', { name: 'Cancel', exact: true })
            .click()
          await expect(
            page.getByText('Review imported records', { exact: true }),
          ).toHaveCount(0)
          expect((await currentResolver()).toLowerCase()).toBe(
            sourceResolver.toLowerCase(),
          )
          expect(
            wallet.getPendingRequestCount(Web3RequestKind.SendTransaction),
          ).toBe(0)
          evidence.cancelledReadback = await resolveRecords(f.leaf, f.records)
          expect(
            (
              evidence.cancelledReadback as Awaited<
                ReturnType<typeof resolveRecords>
              >
            ).filter((record) => record.got !== record.want),
          ).toEqual([])
          await entry.click()
          await expect(acknowledge).toBeEnabled({ timeout: 60000 })
          await expect(acknowledge).not.toBeChecked()
          evidence.cancelReview = {
            result: 'PASS',
            detail:
              'Cancel preserved the resolver and every record, sent no transaction, and reopening requires a new acknowledgement.',
          }
        }
        if (
          variant === 'required-read-failure' ||
          variant === 'missing-inventory'
        ) {
          await expect(
            page
              .getByRole('alert')
              .filter({ hasText: /Resolver replacement is blocked/ }),
          ).toBeVisible()
          await expect(
            page.getByRole('alert').filter({
              hasText:
                variant === 'missing-inventory'
                  ? /record inventory/
                  : /text:url/,
            }),
          ).toBeVisible()
          await expect(acknowledge).toBeDisabled()
          expect((await currentResolver()).toLowerCase()).toBe(
            sourceResolver.toLowerCase(),
          )
          evidence.requiredReadGuard = {
            result: 'PASS',
            screen: await page.locator('body').innerText(),
            resolverUnchanged: true,
          }
          expect(failedRequests).toBeGreaterThan(0)
          evidence.failedRequests = failedRequests
          failRequiredRead = false
          await page
            .getByRole('button', { name: 'Retry import', exact: true })
            .click()
          await expect(acknowledge).toBeEnabled({ timeout: 60000 })
          await expect(acknowledge).not.toBeChecked()
          evidence.recoveryReadback = await resolveRecords(f.leaf, f.records)
          expect(
            (
              evidence.recoveryReadback as Awaited<
                ReturnType<typeof resolveRecords>
              >
            ).every((r) => r.got === r.want),
          ).toBe(true)
        }
        if (variant === 'pubkey') {
          await expect(
            page
              .getByRole('alert')
              .filter({ hasText: /Resolver replacement is blocked/ }),
          ).toBeVisible()
          await expect(acknowledge).toBeDisabled()
          expect((await currentResolver()).toLowerCase()).toBe(
            sourceResolver.toLowerCase(),
          )
          evidence.result =
            'PASS — populated pubkey blocks replacement; source and routing unchanged'
        } else {
          await expect(acknowledge).toBeEnabled()
          await acknowledge.check()
          await page
            .getByRole('button', { name: 'Preview', exact: true })
            .click()
          if (variant === 'reject-first' || variant === 'reject-after-setup') {
            await page
              .getByRole('button', { name: 'Publish changes', exact: true })
              .click()
            await page
              .getByRole('button', { name: /Replace & save/i })
              .click({ timeout: 30000 })
            await expect
              .poll(
                () =>
                  wallet.getPendingRequestCount(
                    Web3RequestKind.SendTransaction,
                  ),
                { timeout: 60000 },
              )
              .toBeGreaterThan(0)
            if (variant === 'reject-after-setup') {
              await wallet.authorize(Web3RequestKind.SendTransaction)
              await expect
                .poll(
                  () =>
                    wallet.getPendingRequestCount(
                      Web3RequestKind.SendTransaction,
                    ),
                  { timeout: 90000 },
                )
                .toBeGreaterThan(0)
            }
            await wallet.reject(Web3RequestKind.SendTransaction)
            expect((await currentResolver()).toLowerCase()).toBe(
              sourceResolver.toLowerCase(),
            )
            const records = await resolveRecords(f.leaf, f.records)
            expect(
              records.filter((record) => record.got !== record.want),
            ).toEqual([])
            evidence.rejectedImport = {
              result: 'PASS',
              acceptedBeforeRejection: variant === 'reject-after-setup' ? 1 : 0,
              records,
              ui: await page.locator('body').innerText(),
            }
            const retry = page
              .getByRole('button', {
                name: /^(Publish changes|Retry|Try again)$/i,
              })
              .first()
            await expect(retry).toBeEnabled({ timeout: 60000 })
            evidence.rejectedImport = {
              ...(evidence.rejectedImport as Record<string, unknown>),
              ui: await page.locator('body').innerText(),
              retryAction: await retry.innerText(),
            }
            save()
            let done = false
            const authorizing = authorizeTransactionsWhile(
              page,
              wallet,
              () => done,
            )
            try {
              const republish = /Publish changes/i.test(await retry.innerText())
              await retry.click()
              if (republish)
                await page
                  .getByRole('button', { name: /Replace & save/i })
                  .click({ timeout: 30000 })
              await expect
                .poll(async () => (await currentResolver()).toLowerCase(), {
                  timeout: 180000,
                })
                .not.toBe(sourceResolver.toLowerCase())
            } finally {
              done = true
              await authorizing
            }
          } else {
            let done = false
            const authorizing = authorizeTransactionsWhile(
              page,
              wallet,
              () => done,
            )
            try {
              await page
                .getByRole('button', { name: 'Publish changes', exact: true })
                .click()
              await page
                .getByRole('button', { name: /Replace & save/i })
                .click({ timeout: 30000 })
              await expect
                .poll(async () => (await currentResolver()).toLowerCase(), {
                  timeout: 120000,
                })
                .not.toBe(sourceResolver.toLowerCase())
            } finally {
              done = true
              await authorizing
            }
          }
          evidence.result =
            'PASS — resolver replaced by app; exact record comparisons follow'
        }
        evidence.afterImport = await resolveRecords(f.leaf, f.records)
        for (const record of evidence.afterImport as Awaited<
          ReturnType<typeof resolveRecords>
        >)
          expect.soft(record.got, `S4 ${record.what}`).toBe(record.want)
        evidence.resolverAfterImport = await currentResolver()
        const mismatches = (
          evidence.afterImport as Awaited<ReturnType<typeof resolveRecords>>
        ).filter((record) => record.got !== record.want)
        if (mismatches.length) {
          evidence.result = `FAIL — resolver replacement omitted ${mismatches.length} seeded records`
          evidence.recovery = {
            result: 'IN PROGRESS',
            purpose:
              'Restore the original resolver through Explorer; retain the failed afterImport values above.',
          }
          save()
          const recoveryContext = await browser.newContext({
            viewport: { width: 1440, height: 1000 },
          })
          try {
            const view = await recoveryContext.newPage()
            await routeToLocalFork(view)
            await view.clock.install({
              time: new Date(
                Number((await publicClient.getBlock()).timestamp) * 1000,
              ),
            })
            await installInventory(view, f, 'after')
            const signer = await injectHeadlessWeb3Provider({
              page: view,
              privateKeys: [accountKey(importer)],
              chains: [localSepolia],
              permitted: [...PERMITTED_SIGN_KINDS],
            })
            await view.goto(process.env.PORTAL_APP_URL!)
            await connectExplorer(view, signer)
            await view.goto(
              `${process.env.PORTAL_APP_URL}/${f.leaf}/change-resolver`,
            )
            await view
              .getByRole('switch', { name: 'Use custom resolver', exact: true })
              .check({ timeout: 60000 })
            await view
              .getByLabel('Contract address', { exact: true })
              .fill(sourceResolver)
            await view
              .getByRole('button', { name: 'Save changes', exact: true })
              .click()
            await driveTransactionsToSuccess(view, signer, [], 90000)
            expect((await currentResolver()).toLowerCase()).toBe(
              sourceResolver.toLowerCase(),
            )
            const records = await resolveRecords(f.leaf, f.records)
            expect(records.every((record) => record.got === record.want)).toBe(
              true,
            )
            evidence.recovery = {
              result: 'PASS',
              actor: importer,
              app: 'Explorer',
              resolver: await currentResolver(),
              records,
              detail:
                'Restored original resolver through Explorer and verified every original record. This does not clear the resolver-copy failure.',
            }
            await view.screenshot({
              path: resolve(output, `resolver-import-${suffix}-recovered.png`),
              fullPage: true,
            })
          } catch (error) {
            evidence.recovery = { result: 'FAIL', error: String(error) }
            expect
              .soft(false, `Resolver restoration workaround: ${error}`)
              .toBe(true)
          } finally {
            await closeFixtureContext(recoveryContext)
          }
        }
        evidence.phase = 'completed S4 check'
      } catch (error) {
        evidence.result = 'FAIL'
        evidence.error = String(error)
        throw error
      } finally {
        if (f) {
          evidence.finalState = await v2State(f.leaf).catch((e) => String(e))
          evidence.finalRecords = await resolveRecords(f.leaf, f.records)
          evidence.sourceRecords = await sourceRecords(f.leaf, f.records)
          evidence.afterActivity = await chainActivity(f.startBlock)
          evidence.activity = evidence.afterActivity
          evidence.activityCoverage = {
            afterIncludesAppWorkflows: evidence.phase === 'completed S4 check',
            scope:
              'Original V1 activity, actual migration, resolver-import submission or refusal, and any attempted restoration. A separate history PASS does not clear a record-copy or restoration FAIL.',
          }
        }
        evidence.finalUI = await page
          .locator('body')
          .innerText()
          .catch(() => '')
        evidence.queryFailures = await queryFailures(page)
        evidence.completedAt = new Date().toISOString()
        evidence.assertionErrors = info.errors.map((e) => e.message)
        save()
        await info.attach('S4 evidence', {
          path: resolve(output, `resolver-import-${suffix}.json`),
          contentType: 'application/json',
        })
        await closeFixtureContext(importContext)
      }
    })
  }
}
