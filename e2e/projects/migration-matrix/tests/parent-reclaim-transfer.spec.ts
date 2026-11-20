import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { injectHeadlessWeb3Provider } from '@ensdomains/headless-web3-provider'
import { encodeFunctionData, labelhash, namehash, parseAbi } from 'viem'
import {
  V1_BASE_REGISTRAR,
  V1_ENS_REGISTRY,
} from '../../../fixtures/makeV1Name.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { PERMITTED_SIGN_KINDS } from '../../../helpers/manager-auth.js'
import { connectWithHeadlessWallet } from '../../../helpers/portal-auth.js'
import { resolveRecords } from '../../../helpers/resolve-records.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'
import { closeFixtureContext, routeToLocalFork } from '../local-fork-routing.js'
import { expect, localSepolia, test } from '../matrix-fixture.js'
import { beforePermissions } from '../probes.js'
import { chainActivity, sourceRecords } from '../record-evidence.js'
import {
  account,
  accountKey,
  type Configuration,
  seedConfiguration,
  send,
} from '../seed.js'
import { installInventory } from '../ui-actions.js'

const configurations: Configuration[] = JSON.parse(
  readFileSync(new URL('../configurations.json', import.meta.url), 'utf8'),
)
const ids = process.env.MATRIX_IDS?.split(',') ?? ['CFG-0036']
const abi = parseAbi([
  'function owner(bytes32 node) view returns(address)',
  'function ownerOf(uint256 id) view returns(address)',
  'function resolver(bytes32 node) view returns(address)',
  'function setOwner(bytes32 node,address owner)',
])
for (const c of configurations.filter((c) => ids.includes(c.config_id))) {
  test(`parent reclaim then child transfer ${c.config_id}`, async ({
    browser,
  }, info) => {
    info.setTimeout(600_000)
    const out = resolve(process.env.REPLACEMENT_RESULTS!, 'supplemental')
    mkdirSync(out, { recursive: true })
    const actor = c.root_owner
    const evidence: Record<string, any> = {
      id: `PARENT-RECLAIM-TRANSFER-${c.config_id}`,
      configurations: [c.config_id],
      configuration: c,
      actor,
      phase: 'fixture',
      startedAt: new Date().toISOString(),
      checks: {},
      appChecks: [],
      scope:
        'Fresh independent V1 workflow: follow Reclaim the parent first, reclaim the split manager role, then transfer the child while retaining tree records. This is not migration, and temporarily removes the original manager’s role.',
    }
    const save = () =>
      writeFileSync(
        resolve(out, `parent-reclaim-transfer-${c.config_id}.json`),
        JSON.stringify(
          evidence,
          (_k, v) => (typeof v === 'bigint' ? String(v) : v),
          2,
        ),
      )
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      }),
      page = await context.newPage()
    let cleanup: (() => Promise<void>) | undefined,
      ready = false
    const capture = async (label: string) => {
      const text = await page.locator('body').innerText()
      writeFileSync(
        resolve(out, `parent-reclaim-transfer-${c.config_id}-${label}.txt`),
        text,
      )
      await page.screenshot({
        path: resolve(
          out,
          `parent-reclaim-transfer-${c.config_id}-${label}.png`,
        ),
        fullPage: true,
      })
      return text
    }
    try {
      expect(c.level).toBe('3LD')
      expect(c.root_type).toBe('Unwrapped')
      expect(c.wrapping).toBe('Unwrapped')
      expect(c.root_lifecycle).toBe('Active')
      expect(c.root_owner).not.toBe(c.root_manager)
      const f = await seedConfiguration(c)
      await f.advance()
      evidence.subject = f.leaf
      evidence.names = f.names
      evidence.historySeed = f.historySeed
      const rootNode = namehash(f.root),
        node = namehash(f.leaf)
      const manager = (name: string) =>
        publicClient.readContract({
          address: V1_ENS_REGISTRY,
          abi,
          functionName: 'owner',
          args: [namehash(name)],
        })
      const registrant = () =>
        publicClient.readContract({
          address: V1_BASE_REGISTRAR,
          abi,
          functionName: 'ownerOf',
          args: [BigInt(labelhash(f.label))],
        })
      const tree = () =>
        Promise.all(
          f.names.map(async (name) => ({
            name,
            resolver: await publicClient.readContract({
              address: V1_ENS_REGISTRY,
              abi,
              functionName: 'resolver',
              args: [namehash(name)],
            }),
            records: await resolveRecords(name, f.recordsFor(name)),
            source: await sourceRecords(name, f.recordsFor(name)),
          })),
        )
      const originalParentManager = await manager(f.root),
        originalChildManager = await manager(f.leaf),
        originalRegistrant = await registrant(),
        recipient = account('Unrelated').address
      evidence.before = {
        parentManager: originalParentManager,
        childManager: originalChildManager,
        registrant: originalRegistrant,
        tree: await tree(),
      }
      cleanup = async () => {
        if ((await manager(f.leaf)) === recipient)
          await send(
            account('Unrelated'),
            V1_ENS_REGISTRY,
            encodeFunctionData({
              abi,
              functionName: 'setOwner',
              args: [node, originalChildManager],
            }),
          )
        if ((await manager(f.root)) === account(actor).address)
          await send(
            account(actor),
            V1_ENS_REGISTRY,
            encodeFunctionData({
              abi,
              functionName: 'setOwner',
              args: [rootNode, originalParentManager],
            }),
          )
        expect(await manager(f.root)).toBe(originalParentManager)
        expect(await manager(f.leaf)).toBe(originalChildManager)
        expect(await registrant()).toBe(originalRegistrant)
        expect(await tree()).toEqual(evidence.before.tree)
      }
      evidence.beforeActivity = await chainActivity(f.startBlock)
      evidence.beforePermission = await beforePermissions(f, actor)
      expect(evidence.beforePermission.transferAsParent.result).toBe('DENIED')
      await routeToLocalFork(page)
      await installInventory(page, f, 'before')
      await page.clock.install({
        time: new Date(
          Number((await publicClient.getBlock()).timestamp) * 1000,
        ),
      })
      const wallet = await injectHeadlessWeb3Provider({
        page,
        privateKeys: [accountKey(actor)],
        chains: [localSepolia],
        permitted: [...PERMITTED_SIGN_KINDS],
      })
      const base = process.env.PORTAL_APP_URL!
      await page.goto(base)
      await connectWithHeadlessWallet(page, wallet)
      evidence.phase = 'follow reclaim-parent instruction'
      save()
      await page.goto(`${base}/${f.leaf}/ownership/transfer`)
      await expect(
        page.getByText('Reclaim the parent first', { exact: true }),
      ).toBeVisible({ timeout: 60000 })
      ready = true
      evidence.instruction = await capture('instruction')
      await page
        .getByRole('link', { name: `Go to ${f.root}`, exact: true })
        .click()
      await page
        .getByRole('button', { name: /Reclaim manager$/ })
        .click({ timeout: 60000 })
      await driveTransactionsToSuccess(page, wallet, [], 90000)
      expect(await manager(f.root)).toBe(account(actor).address)
      expect(await registrant()).toBe(originalRegistrant)
      expect(await manager(f.leaf)).toBe(originalChildManager)
      expect(await tree()).toEqual(evidence.before.tree)
      evidence.afterReclaimPermission = await beforePermissions(f, actor)
      expect(evidence.afterReclaimPermission.transferAsParent.result).toBe(
        'ALLOWED',
      )
      evidence.afterReclaimParentManager = await manager(f.root)
      evidence.phase = 'return to child transfer'
      save()
      await page.goto(`${base}/${f.leaf}/ownership/transfer`)
      const input = page.getByPlaceholder('ENS name or address')
      await expect(input).toBeVisible({ timeout: 60000 })
      await input.fill(recipient)
      const submit = page.getByRole('button', {
        name: 'Transfer name',
        exact: true,
      })
      await expect(submit).toBeEnabled({ timeout: 120000 })
      for (const label of [
        /Detach the resolver/,
        /Set the ETH address/,
        /Revoke everyone/,
      ]) {
        const toggle = page.getByRole('switch', { name: label })
        if (await toggle.isVisible()) {
          await expect(toggle).toBeEnabled()
          if (await toggle.isChecked()) await toggle.uncheck()
        }
      }
      await submit.click()
      await driveTransactionsToSuccess(page, wallet, [], 120000)
      expect(await manager(f.leaf)).toBe(recipient)
      expect(await manager(f.root)).toBe(account(actor).address)
      expect(await registrant()).toBe(originalRegistrant)
      expect(await tree()).toEqual(evidence.before.tree)
      evidence.after = {
        parentManager: await manager(f.root),
        childManager: await manager(f.leaf),
        registrant: await registrant(),
        tree: await tree(),
      }
      evidence.successScreen = await capture('transferred')
      await cleanup()
      evidence.cleanup =
        'PASS — exact parent/child controllers and all records restored'
      // Keep the exact original and workflow logs for the independent, real-indexer
      // history replay. Capturing logs alone does not establish history retention.
      evidence.afterActivity = await chainActivity(f.startBlock)
      const detail =
        'Explorer’s parent link, Reclaim manager transaction and subsequent child transfer all completed. The actual recipient became child controller, the parent registrant stayed unchanged, and every resolver pointer and source/resolved record stayed intact. This recovery replaces the previous parent manager; it does not preserve that wallet’s role. Exact fixture controllers were restored afterward.'
      evidence.checks['Parent reclaim followed by actual child transfer'] = {
        result: 'PASS',
        detail,
      }
      evidence.appChecks.push({
        app: 'Explorer',
        actor,
        stage: 'before',
        action: 'reclaim parent then transfer child',
        result: 'PASS',
        detail,
      })
      evidence.phase = 'completed parent reclaim transfer'
      save()
    } catch (error) {
      evidence.error = String(error)
      evidence.screen = await capture('failed').catch(() => '')
      const result =
        ready &&
        !/HTTP request failed|ECONNREFUSED|Local matrix wallet request did not settle/.test(
          String(error),
        )
          ? 'FAIL'
          : 'BLOCKED'
      evidence.checks['Parent reclaim followed by actual child transfer'] = {
        result,
        detail: String(error),
      }
      evidence.appChecks.push({
        app: 'Explorer',
        actor,
        stage: 'before',
        action: 'reclaim parent then transfer child',
        result,
        detail: String(error),
        evidence: { screen: evidence.screen },
      })
      throw error
    } finally {
      try {
        await cleanup?.()
      } catch (error) {
        evidence.cleanupError = String(error)
        expect
          .soft(false, `Exact fixture cleanup failed: ${String(error)}`)
          .toBe(true)
      }
      evidence.completedAt = new Date().toISOString()
      evidence.assertionErrors = info.errors.map((error) => error.message)
      save()
      await closeFixtureContext(context)
    }
  })
}
