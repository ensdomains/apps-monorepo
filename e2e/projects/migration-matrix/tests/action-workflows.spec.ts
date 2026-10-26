import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { injectHeadlessWeb3Provider } from '@ensdomains/headless-web3-provider'
import { encodeFunctionData, parseAbi, zeroAddress } from 'viem'
import { publicClient } from '../../../helpers/anvil-client.js'
import {
  dismissBackendAuthModal,
  dismissMatrixBackendOverlay,
  PERMITTED_SIGN_KINDS,
} from '../../../helpers/manager-auth.js'
import {
  openMigrationFlow,
  rootRow,
  selectOnlyRoots,
  upgradeAndSettle,
} from '../../../helpers/migration-flow.js'
import { connectWithHeadlessWallet as connectExplorer } from '../../../helpers/portal-auth.js'
import { readPrimaryName } from '../../../helpers/primary-name.js'
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
import { afterPermissions, v2State } from '../probes.js'
import { chainActivity } from '../record-evidence.js'
import {
  account,
  accountKey,
  type Configuration,
  migrateLockedAncestor,
  seedConfiguration,
  send,
} from '../seed.js'
import { installInventory } from '../ui-actions.js'
import { rethrowUnsettledWallet } from '../workflow-check.js'

const configs: Configuration[] = JSON.parse(
  readFileSync(new URL('../configurations.json', import.meta.url), 'utf8'),
)
const selected = process.env.MATRIX_IDS?.split(',') ?? [
  'CFG-0001',
  'CFG-0003',
  'CFG-0004',
  'CFG-0007',
  'CFG-0009',
  'CFG-0011',
  'CFG-0243',
  'CFG-0852',
  'CFG-0868',
  'CFG-0884',
  'CFG-0924',
]
const abi = parseAbi([
  'function roles(uint256 resource,address user) view returns(uint256)',
  'function revokeRoles(uint256 resource,uint256 roles,address user) returns(bool)',
  'function getResolver(string label) view returns(address)',
  'function setResolver(uint256 id,address resolver)',
  'function getSubregistry(string label) view returns(address)',
  'function safeTransferFrom(address from,address to,uint256 id,uint256 amount,bytes data)',
  'function unsafeTransfer(address to,uint256 tokenId,bytes data)',
])

for (const c of configs.filter((c) => selected.includes(c.config_id))) {
  test(`independent action workflows ${c.config_id}`, async ({
    page,
    wallet,
    browser,
  }, info) => {
    info.setTimeout(1_200_000)
    const out = resolve(process.env.REPLACEMENT_RESULTS!, 'supplemental')
    mkdirSync(out, { recursive: true })
    const evidence: Record<string, unknown> = {
      id: `ACTIONS-${c.config_id}`,
      configurations: [c.config_id],
      checks: {},
      phase: 'fixture',
      startedAt: new Date().toISOString(),
      discovery:
        'Seeded name/key inventory and actual root resolver-role reads. App writes and transaction receipts are real. Activity here is RPC evidence, not indexed-history proof.',
    }
    const checks = evidence.checks as Record<
      string,
      { result: string; evidence?: unknown; error?: string }
    >
    const save = () =>
      writeFileSync(
        resolve(out, `actions-${c.config_id}.json`),
        JSON.stringify(
          evidence,
          (_k, v) => (typeof v === 'bigint' ? String(v) : v),
          2,
        ),
      )
    const check = async (key: string, action: () => Promise<unknown>) => {
      try {
        checks[key] = { result: 'PASS', evidence: await action() }
      } catch (error) {
        const screens = await Promise.all(
          sessions
            .flatMap((context) => context.pages())
            .map(async (view, index) => {
              const screen = await view
                .locator('body')
                .innerText()
                .catch(() => '')
              await view
                .screenshot({
                  path: resolve(
                    out,
                    `${c.config_id}-failure-${Object.keys(checks).length}-${index}.png`,
                  ),
                  fullPage: true,
                })
                .catch(() => {})
              return {
                url: view.url(),
                screen,
                queryFailures: await queryFailures(view),
                roleQueries: await roleQueryEvidence(view),
              }
            }),
        )
        const unsettled = String(error).includes(
          'Local matrix wallet request did not settle',
        )
        checks[key] = {
          result: unsettled ? 'BLOCKED' : 'FAIL',
          error: String(error),
          evidence: screens,
        }
        save()
        rethrowUnsettledWallet(error)
        expect.soft(false, `${key}: ${error}`).toBe(true)
      }
      save()
    }
    const f = await seedConfiguration(c)
    evidence.configuration = c
    const ownerId =
      c.level === '2LD'
        ? c.root_owner
        : c.name_holder.startsWith('W')
          ? c.name_holder
          : c.name_manager
    evidence.name = f.leaf
    evidence.subject = f.leaf
    evidence.names = f.names
    evidence.configuration = c
    evidence.historySeed = f.historySeed
    const sessions: Awaited<ReturnType<typeof browser.newContext>>[] = []
    const session = async (
      actor: string,
      app: 'Manager' | 'Explorer',
      stage: 'before' | 'after',
    ) => {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      })
      sessions.push(context)
      const view = await context.newPage()
      await routeToLocalFork(view)
      await view.clock.install({
        time: new Date(
          Number((await publicClient.getBlock()).timestamp) * 1000,
        ),
      })
      await installInventory(view, f, stage)
      const signer = await injectHeadlessWeb3Provider({
        page: view,
        privateKeys: [accountKey(actor)],
        chains: [localSepolia],
        permitted: [...PERMITTED_SIGN_KINDS],
      })
      if (app === 'Manager') {
        await overrideManagerFeatureFlags(view, {
          'profile-view-new': true,
          migration: true,
          'migration-subname-recreation': true,
        })
        await view.addLocatorHandler(
          view.getByRole('alertdialog', { name: 'Verify your wallet' }),
          () => dismissMatrixBackendOverlay(view),
        )
      }
      const base =
        app === 'Manager'
          ? process.env.MANAGER_APP_URL!
          : process.env.PORTAL_APP_URL!
      await view.goto(base, { waitUntil: 'domcontentloaded' })
      if (app === 'Manager') await connectHeadless(view, signer)
      else await connectExplorer(view, signer)
      const capture = async (key: string) => {
        const body = await view.locator('body').innerText()
        writeFileSync(resolve(out, `${c.config_id}-${actor}-${key}.txt`), body)
        await view.screenshot({
          path: resolve(out, `${c.config_id}-${actor}-${key}.png`),
          fullPage: true,
        })
        return body
      }
      return { page: view, wallet: signer, base, capture }
    }
    try {
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
      evidence.beforeRecords = await resolveRecords(f.leaf, f.records)
      expect(
        (
          evidence.beforeRecords as Awaited<ReturnType<typeof resolveRecords>>
        ).every((r) => r.got === r.want),
      ).toBe(true)
      const before = await session('W1', 'Explorer', 'before')
      await check(
        'before: set primary in Explorer with a matching forward record',
        async () => {
          await before.page.goto(
            `${before.base}/addr/${account('W1').address}/reverse-resolution`,
          )
          const mainnet = before.page
            .getByRole('row')
            .filter({ has: before.page.getByText('Mainnet', { exact: true }) })
          await mainnet
            .getByRole('button', { name: 'More', exact: true })
            .click()
          const dialog = before.page.getByRole('dialog', {
            name: 'Mainnet resolution',
          })
          await dialog.locator('input[name="name"]').fill(f.leaf)
          await dialog
            .getByRole('button', { name: 'Update', exact: true })
            .click()
          await driveTransactionsToSuccess(
            before.page,
            before.wallet,
            ['tx-update-reverse-name'],
            90000,
          )
          await expect
            .poll(() => readPrimaryName(account('W1').address), {
              timeout: 60000,
            })
            .toBe(f.leaf)
          return {
            primary: await readPrimaryName(account('W1').address),
            screen: await before.capture('primary-before'),
          }
        },
      )
      evidence.beforeActivity = await chainActivity(f.startBlock)
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
      const inventory = await f.metadata()
      for (const n of inventory)
        if (f.native && c.parent_migrated === 'Yes' && n.name !== f.leaf)
          Object.assign(n, { migrated: true })
      await mockV1Names(page, inventory)
      await connectHeadless(page, wallet)
      await dismissBackendAuthModal(page, { timeout: 3000 })
      await openMigrationFlow(page)
      const combinedNative =
        f.native &&
        c.parent_migrated === 'No' &&
        ownerId === c.root_owner &&
        (c.level !== '4LD' || c.parent_controller === ownerId)
      const target = combinedNative ? f.root : f.native ? f.leaf : f.root
      if ((await page.getByRole('checkbox', { name: /\.eth$/ }).count()) > 1)
        await selectOnlyRoots(page, [target])
      const root = rootRow(page, target)
      await expect(root).toBeEnabled({ timeout: 60000 })
      if (!(await root.isChecked())) await root.locator('xpath=..').click()
      if (c.retain_manager === 'Keep' || c.retain_manager === 'Remove')
        await page
          .getByRole('checkbox', { name: /Keep .* as a manager/ })
          .setChecked(c.retain_manager === 'Keep')
      evidence.migrationOutcome = await upgradeAndSettle(page, wallet)
      expect(evidence.migrationOutcome).toBe('success')
      const state = (await v2State(f.leaf))!
      expect(state.status).toBe(2)
      evidence.afterState = state
      evidence.afterRecords = await resolveRecords(f.leaf, f.records)
      expect(
        (
          evidence.afterRecords as Awaited<ReturnType<typeof resolveRecords>>
        ).every((r) => r.got === r.want),
      ).toBe(true)
      evidence.phase = 'after migration actions'
      save()
      const owner = await session(ownerId, 'Explorer', 'after')
      const currentResolver = () =>
        publicClient.readContract({
          address: state.registry,
          abi,
          functionName: 'getResolver',
          args: [state.label],
        })
      const roles = (actor: string) =>
        publicClient.readContract({
          address: state.registry,
          abi,
          functionName: 'roles',
          args: [state.resource, account(actor).address],
        })
      await check(
        'after: primary forward and reverse still match',
        async () => {
          expect(await readPrimaryName(account('W1').address)).toBe(f.leaf)
          const manager = await session('W1', 'Manager', 'after')
          await manager.page.goto(`${manager.base}/dashboard`)
          await expect(
            manager.page.getByRole('link', { name: /^Go to profile/i }),
          ).toHaveAttribute('href', `/${f.leaf}`, { timeout: 90000 })
          return {
            primary: await readPrimaryName(account('W1').address),
            screen: await manager.capture('primary-after'),
          }
        },
      )
      await check(
        'after: owner grants a registry role in Explorer',
        async () => {
          const initial = await roles('Unrelated')
          expect(initial).toBe(0n)
          try {
            await owner.page.goto(`${owner.base}/${f.leaf}/roles`)
            await owner.page
              .getByRole('button', { name: 'Add user', exact: true })
              .click({ timeout: 60000 })
            await owner.page
              .getByLabel('User name or address')
              .fill(account('Unrelated').address)
            await owner.page.locator('#add-ROLE_SET_RESOLVER-manager').click()
            await owner.page
              .getByRole('button', { name: 'Save', exact: true })
              .click()
            await driveTransactionsToSuccess(
              owner.page,
              owner.wallet,
              ['tx-grant-roles'],
              90000,
            )
            const granted = await roles('Unrelated')
            expect(granted).toBe(1n << 24n)
            return { granted, screen: await owner.capture('registry-grant') }
          } finally {
            const added = (await roles('Unrelated')) & ~initial
            if (added)
              await send(
                account(ownerId),
                state.registry,
                encodeFunctionData({
                  abi,
                  functionName: 'revokeRoles',
                  args: [state.resource, added, account('Unrelated').address],
                }),
              )
            expect(await roles('Unrelated')).toBe(initial)
          }
        },
      )
      for (const actor of c.actors
        .filter((a) => a.actor !== 'Disconnected')
        .map((a) => a.actor)) {
        await check(`after: ${actor} change-resolver workflow`, async () => {
          const who =
            actor === ownerId
              ? owner
              : await session(actor, 'Explorer', 'after')
          const permission = await afterPermissions(f, actor)
          const original = await currentResolver()
          await who.page.goto(`${who.base}/${f.leaf}/change-resolver`)
          if (permission?.setResolver.result === 'DENIED') {
            await expect(
              who.page.getByText('Permission Denied', { exact: true }),
            ).toBeVisible({ timeout: 60000 })
            await expect(
              who.page.getByRole('button', {
                name: 'Save changes',
                exact: true,
              }),
            ).toHaveCount(0)
            expect(await currentResolver()).toBe(original)
            return {
              expected: 'DENIED',
              screen: await who.capture('resolver-denied'),
            }
          }
          expect(permission?.setResolver.result).toBe('ALLOWED')
          try {
            await who.page
              .getByRole('switch', { name: 'Use custom resolver', exact: true })
              .check({ timeout: 60000 })
            const v1 =
              ensL1Contracts[supportedL1Chains.sepolia].ensPublicResolver
                .address
            const rootState = (await v2State(f.root))!
            const alternative =
              original.toLowerCase() === v1.toLowerCase()
                ? await publicClient.readContract({
                    address: rootState.registry,
                    abi,
                    functionName: 'getResolver',
                    args: [rootState.label],
                  })
                : v1
            expect(alternative.toLowerCase()).not.toBe(original.toLowerCase())
            await who.page
              .getByLabel('Contract address', { exact: true })
              .fill(alternative)
            await who.page
              .getByRole('button', { name: 'Save changes', exact: true })
              .click()
            await driveTransactionsToSuccess(who.page, who.wallet, [], 90000)
            expect((await currentResolver()).toLowerCase()).toBe(
              alternative.toLowerCase(),
            )
            return {
              expected: 'ALLOWED',
              actualResolver: await currentResolver(),
              screen: await who.capture('resolver-updated'),
            }
          } finally {
            if (
              (await currentResolver()).toLowerCase() !== original.toLowerCase()
            )
              await send(
                account(actor),
                state.registry,
                encodeFunctionData({
                  abi,
                  functionName: 'setResolver',
                  args: [state.tokenId, original],
                }),
              )
            expect(
              (await resolveRecords(f.leaf, f.records)).every(
                (r) => r.got === r.want,
              ),
            ).toBe(true)
          }
        })
      }
      if (process.env.MATRIX_MAX_LEVEL === '3' && c.level === '3LD')
        evidence.scopeExclusions = [
          'Creating a 4LD below the 3LD subject: excluded, not passed',
        ]
      if (process.env.MATRIX_MAX_LEVEL !== '3' || c.level === '2LD')
        await check('after: create a subname in Explorer', async () => {
          await owner.page.goto(`${owner.base}/${f.leaf}/create-subname`)
          const deployLink = owner.page.getByRole('link', {
            name: 'Deploy subregistry',
            exact: true,
          })
          const label = owner.page.getByLabel('Subname', { exact: true })
          await expect(label.or(deployLink)).toBeVisible({ timeout: 60000 })
          if (await deployLink.isVisible()) {
            await deployLink.click()
            await owner.page
              .getByRole('button', { name: 'Configure registry', exact: true })
              .click({ timeout: 60000 })
            await owner.page
              .getByRole('button', { name: 'Deploy', exact: true })
              .click({ timeout: 60000 })
            await driveTransactionsToSuccess(
              owner.page,
              owner.wallet,
              [],
              120000,
            )
            await owner.page.goto(`${owner.base}/${f.leaf}/create-subname`)
          }
          await label.fill('action-child')
          await owner.page
            .getByLabel('Owner', { exact: true })
            .fill(account('W1').address)
          await owner.page
            .getByRole('button', { name: 'Create subname', exact: true })
            .click()
          await driveTransactionsToSuccess(
            owner.page,
            owner.wallet,
            ['tx-create-ens-subname'],
            90000,
          )
          const created = await v2State(`action-child.${f.leaf}`)
          expect(created?.status).toBe(2)
          expect(created?.latestOwner.toLowerCase()).toBe(
            account('W1').address.toLowerCase(),
          )
          return { created, screen: await owner.capture('created-subname') }
        })
      await check(
        'after: transfer ownership in Explorer without changing records',
        async () => {
          const priorManager =
            c.root_owner !== c.root_manager ? await roles(c.root_manager) : null
          try {
            await owner.page.goto(`${owner.base}/${f.leaf}/ownership/transfer`)
            await owner.page
              .getByPlaceholder('ENS name or address')
              .fill(account('Unrelated').address)
            await expect(
              owner.page.getByRole('button', {
                name: 'Transfer name',
                exact: true,
              }),
            ).toBeEnabled({ timeout: 120000 })
            for (const name of [
              /Detach the resolver/,
              /Set the ETH address/,
              /Revoke everyone/,
            ]) {
              const toggle = owner.page.getByRole('switch', { name })
              if (
                (await toggle.isVisible()) &&
                (await toggle.isEnabled()) &&
                (await toggle.isChecked())
              )
                await toggle.uncheck()
            }
            await owner.page
              .getByRole('button', { name: 'Transfer name', exact: true })
              .click()
            await driveTransactionsToSuccess(
              owner.page,
              owner.wallet,
              [],
              90000,
            )
            const transferred = await v2State(f.leaf)
            expect(transferred?.latestOwner.toLowerCase()).toBe(
              account('Unrelated').address.toLowerCase(),
            )
            expect(
              (await resolveRecords(f.leaf, f.records)).every(
                (r) => r.got === r.want,
              ),
            ).toBe(true)
            if (priorManager !== null)
              expect(await roles(c.root_manager)).toBe(priorManager)
            return {
              transferred,
              managerRolesBefore: priorManager,
              screen: await owner.capture('transferred'),
            }
          } finally {
            const current = await v2State(f.leaf)
            if (
              current?.latestOwner.toLowerCase() ===
              account('Unrelated').address.toLowerCase()
            )
              await send(
                account('Unrelated'),
                current.registry,
                encodeFunctionData({
                  abi,
                  functionName: 'unsafeTransfer',
                  args: [account(ownerId).address, current.tokenId, '0x'],
                }),
              )
          }
        },
      )
      evidence.phase = 'completed selected action workflows'
    } catch (error) {
      evidence.error = String(error)
      throw error
    } finally {
      evidence.finalState = await v2State(f.leaf).catch((e) => String(e))
      try {
        evidence.finalRecords = await resolveRecords(f.leaf, f.records)
      } catch (error) {
        evidence.finalRecordsError = String(error)
        expect.soft(false, `Final record read: ${error}`).toBe(true)
      }
      try {
        evidence.activity = await chainActivity(f.startBlock)
        evidence.afterActivity = evidence.activity
      } catch (error) {
        evidence.activityError = String(error)
        expect.soft(false, `Final activity read: ${error}`).toBe(true)
      }
      evidence.activityCoverage = {
        beforeIncludesPrimaryWorkflow: true,
        afterIncludesAppWorkflows: true,
      }
      evidence.completedAt = new Date().toISOString()
      evidence.assertionErrors = info.errors.map((e) => e.message)
      save()
      for (const context of sessions) await closeFixtureContext(context)
      await info.attach('action workflow evidence', {
        path: resolve(out, `actions-${c.config_id}.json`),
        contentType: 'application/json',
      })
    }
  })
}
