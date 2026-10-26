import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { injectHeadlessWeb3Provider } from '@ensdomains/headless-web3-provider'
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { encodeFunctionData, labelhash, namehash, parseAbi, zeroAddress } from 'viem'
import { test, expect, localSepolia, overrideManagerFeatureFlags } from '../matrix-fixture.js'
import { waitForManagerFeatureFlagOverride } from '../../../fixtures/playwright.manager.fixture.js'
import { account, accountKey, seedConfiguration, send, type Configuration } from '../seed.js'
import { installInventory, checkActorUI } from '../ui-actions.js'
import { routeToLocalFork, closeFixtureContext } from '../local-fork-routing.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { sourceRecords, chainActivity } from '../record-evidence.js'
import { resolveRecords } from '../../../helpers/resolve-records.js'
import { PERMITTED_SIGN_KINDS, connectWithHeadlessWallet as connectManager, dismissMatrixBackendOverlay, authorizeTransactionsWhile, clickThroughEnableSessions } from '../../../helpers/manager-auth.js'
import { connectWithHeadlessWallet } from '../../../helpers/portal-auth.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'
import { V1_BASE_REGISTRAR, V1_ENS_REGISTRY, V1_NAME_WRAPPER } from '../../../fixtures/makeV1Name.js'
import { mockV1Names } from '../../../helpers/record-audit-inventory.js'
import { openMigrationFlow, rootRow, upgradeAndSettle } from '../../../helpers/migration-flow.js'
import { afterPermissions, v2State } from '../probes.js'

const configs: Configuration[] = JSON.parse(readFileSync(new URL('../configurations.json', import.meta.url), 'utf8'))
const ids = process.env.MATRIX_IDS?.split(',') ?? ['CFG-0002']
const abi = parseAbi(['function nameExpires(uint256 id) view returns(uint256)', 'function ownerOf(uint256 id) view returns(address)', 'function getData(uint256 id) view returns(address owner,uint32 fuses,uint64 expiry)', 'function owner(bytes32 node) view returns(address)', 'function resolver(bytes32 node) view returns(address)', 'function setResolver(bytes32 node,address resolver)'])

for (const c of configs.filter(c => ids.includes(c.config_id))) {
  test(`V1 renewal restores editing ${c.config_id}`, async ({ browser }, info) => {
    info.setTimeout(1_200_000)
    const out = resolve(process.env.REPLACEMENT_RESULTS!, 'supplemental')
    mkdirSync(out, { recursive: true })
    // Evidence is intentionally heterogeneous: raw RPC values and UI evidence
    // are serialized intact instead of narrowing away diagnostic fields.
    const evidence: Record<string, any> = { id: `V1-GRACE-RECOVERY-${c.config_id}`, configurations: [c.config_id], configuration: c, checks: {}, appChecks: [], startedAt: new Date().toISOString(), phase: 'fixture', scope: 'Fresh V1 root renewal, exact records and subsequent editing. This recovery does not imply the grace checkpoint itself permits edits, and does not perform a migration.' }
    const save = () => writeFileSync(resolve(out, `v1-grace-recovery-${c.config_id}.json`), JSON.stringify(evidence, (_key, value) => typeof value === 'bigint' ? String(value) : value, 2))
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    let page = await context.newPage()
    let renewalContext: Awaited<ReturnType<typeof browser.newContext>> | undefined
    let managerContext: Awaited<ReturnType<typeof browser.newContext>> | undefined
    const pass = (label: string, action: string, actor: string, detail: string, app: 'Explorer' | 'Manager' = 'Explorer') => {
      evidence.checks[label] = { result: 'PASS', detail }
      evidence.appChecks.push({ app, actor, stage: 'before', action, result: 'PASS', detail })
      save()
    }
    try {
      expect(c.level).toBe('2LD'); expect(c.root_lifecycle).toBe('Grace')
      const f = await seedConfiguration(c)
      await f.advance()
      evidence.subject = f.root; evidence.names = f.names
      const node = namehash(f.root)
      const expiry = () => publicClient.readContract({ address: V1_BASE_REGISTRAR, abi, functionName: 'nameExpires', args: [BigInt(labelhash(f.label))] })
      const manager = () => publicClient.readContract({ address: V1_ENS_REGISTRY, abi, functionName: 'owner', args: [node] })
      const resolver = () => publicClient.readContract({ address: V1_ENS_REGISTRY, abi, functionName: 'resolver', args: [node] })
      const beforeExpiry = await expiry(), beforeManager = await manager(), beforeResolver = await resolver()
      const wrapperData = () => publicClient.readContract({ address: V1_NAME_WRAPPER, abi, functionName: 'getData', args: [BigInt(node)] })
      const beforeWrapper = f.wrappedFor(f.root) ? await wrapperData() : undefined
      evidence.beforeWrapper = beforeWrapper
      const checkpoint = await publicClient.getBlock()
      expect(checkpoint.timestamp).toBeGreaterThanOrEqual(beforeExpiry)
      expect(checkpoint.timestamp).toBeLessThan(beforeExpiry + 90n * 86400n)
      evidence.beforeExpiry = beforeExpiry; evidence.beforeManager = beforeManager
      evidence.beforeRecords = await resolveRecords(f.root, f.records)
      evidence.beforeSourceRecords = await sourceRecords(f.root, f.records)
      evidence.beforeActivity = await chainActivity(f.startBlock)
      const renewer = ensL1Contracts[supportedL1Chains.sepolia].ensEthRenewerV1.address
      evidence.renewable = await publicClient.readContract({ address: renewer, abi: parseAbi(['function isRenewable(string label) view returns(bool)']), functionName: 'isRenewable', args: [f.label] })
      expect(evidence.renewable, 'Actual renewer permits this V1 grace renewal').toBe(true)
      evidence.phase = 'renew V1 root through Explorer'; save()
      await routeToLocalFork(page); await installInventory(page, f, 'before')
      await page.clock.install({ time: new Date(Number(checkpoint.timestamp) * 1000) })
      let wallet = await injectHeadlessWeb3Provider({ page, privateKeys: [accountKey(c.root_owner)], chains: [localSepolia], permitted: [...PERMITTED_SIGN_KINDS] })
      await page.goto(`${process.env.PORTAL_APP_URL}/${f.root}`)
      await connectWithHeadlessWallet(page, wallet)
      const extend = page.getByRole('button', { name: 'Extend', exact: true })
      await expect.poll(async () => await extend.isVisible() || (await page.locator('body').innerText()).includes('Grace ends'), { timeout: 90000 }).toBe(true)
      let renewalApp: 'Explorer' | 'Manager' = 'Explorer'
      if (!await extend.isVisible()) {
        evidence.explorerRenewalScreen = await page.locator('body').innerText()
        const detail = 'The loaded V1 name page displays its grace dates but has no Extend action, although the actual ETHRenewerV1 isRenewable call returns true. Trying Manager is a separate recovery check.'
        evidence.checks['Explorer exposes renewal for a renewable V1 name in grace'] = { result: 'FAIL', detail }
        evidence.appChecks.push({ app: 'Explorer', actor: c.root_owner, stage: 'before', action: 'renew V1 root from its profile', result: 'FAIL', detail })
        expect.soft(false, detail).toBe(true); save()
        renewalApp = 'Manager'
        evidence.phase = 'renew V1 root through Manager after missing Explorer entry'; save()
        renewalContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
        page = await renewalContext.newPage()
        await routeToLocalFork(page); await installInventory(page, f, 'before')
        await page.clock.install({ time: new Date(Number((await publicClient.getBlock()).timestamp) * 1000) })
        wallet = await injectHeadlessWeb3Provider({ page, privateKeys: [accountKey(c.root_owner)], chains: [localSepolia], permitted: [...PERMITTED_SIGN_KINDS] })
        await overrideManagerFeatureFlags(page, { migration: true, 'profile-view-new': true })
        await page.addLocatorHandler(page.getByRole('alertdialog', { name: 'Verify your wallet' }), () => dismissMatrixBackendOverlay(page))
        await page.goto(`${process.env.MANAGER_APP_URL}/renew/${f.root}`)
        await connectManager(page, wallet)
        let done = false
        const authorizing = authorizeTransactionsWhile(page, wallet, () => done)
        try {
          await page.getByRole('button', { name: /pay with stablecoins/i }).click({ timeout: 90000 })
          await clickThroughEnableSessions(page)
          await page.getByRole('button', { name: 'Select USDC', exact: true }).click()
          const renew = page.getByRole('button', { name: /^Renew name$/i })
          const complete = page.getByText('Renewal Complete!', { exact: true })
          await renew.click()
          const approvalPrompt = page.getByText('Approve the renewal payment?', { exact: true })
          await expect.poll(async () => await complete.isVisible() || await approvalPrompt.isVisible() || (await renew.isVisible() && await renew.isEnabled()), { timeout: 180000 }).toBe(true)
          if (await approvalPrompt.isVisible()) {
            evidence.phase = 'confirm exact renewal payment in Manager'; save()
            await page.getByRole('button', { name: 'Approve', exact: true }).click()
            await expect.poll(async () => await complete.isVisible() || (await renew.isVisible() && await renew.isEnabled()), { timeout: 180000 }).toBe(true)
          }
          if (!await complete.isVisible()) await renew.click()
          await expect(complete).toBeVisible({ timeout: 180000 })
        } finally { done = true; await authorizing }
      } else {
      await extend.click()
      const next = page.getByRole('button', { name: 'Next', exact: true })
      const disclaimer = page.getByRole('button', { name: 'Continue', exact: true })
      await expect(next.or(disclaimer).first()).toBeVisible({ timeout: 60000 })
      if (await disclaimer.isVisible()) await disclaimer.click()
      await expect(next).toBeEnabled({ timeout: 90000 }); await next.click()
      const confirm = page.getByRole('button', { name: 'Confirm', exact: true })
      await expect(confirm).toBeEnabled({ timeout: 90000 }); await confirm.click()
      await driveTransactionsToSuccess(page, wallet, [], 180000)
      }
      const renewedExpiry = await expiry()
      expect(renewedExpiry).toBeGreaterThan(beforeExpiry)
      expect(renewedExpiry).toBeGreaterThan((await publicClient.getBlock()).timestamp)
      expect(await manager()).toBe(beforeManager); expect(await resolver()).toBe(beforeResolver)
      const registrarOwner = await publicClient.readContract({ address: V1_BASE_REGISTRAR, abi, functionName: 'ownerOf', args: [BigInt(labelhash(f.label))] })
      expect(registrarOwner.toLowerCase()).toBe((f.wrappedFor(f.root) ? V1_NAME_WRAPPER : account(c.root_owner).address).toLowerCase())
      if (beforeWrapper) {
        const afterWrapper = await wrapperData()
        expect(afterWrapper[0].toLowerCase()).toBe(account(c.root_owner).address.toLowerCase())
        expect(afterWrapper.slice(0, 2)).toEqual(beforeWrapper.slice(0, 2))
        expect(afterWrapper[2]).toBeGreaterThan(beforeWrapper[2])
        expect(afterWrapper[2] - renewedExpiry).toBe(beforeWrapper[2] - beforeExpiry)
        evidence.afterWrapper = afterWrapper
      }
      evidence.afterRegistrarOwner = registrarOwner
      evidence.renewedExpiry = renewedExpiry
      evidence.afterRenewalRecords = await resolveRecords(f.root, f.records)
      expect(evidence.afterRenewalRecords.every((record: { want: string; got: string }) => record.want === record.got)).toBe(true)
      expect(await sourceRecords(f.root, f.records)).toEqual(evidence.beforeSourceRecords)
      evidence.renewalApp = renewalApp
      pass('Actual V1 renewal preserves every record and controller', 'renew V1 root in grace', c.root_owner, `${renewalApp} submitted renewal; actual V1 expiry advanced beyond the current block time. Registry controller, resolver and all seeded source/resolved values are unchanged.`, renewalApp)

      if (process.env.APPROVAL_VERIFY_RENEWAL_WORKAROUND === '1') {
        evidence.scope = 'Fresh grace fixture; real separate renewal followed by Manager migration, to verify the workaround for the failed integrated renewal preview. Original integrated-flow failures remain failures.'
        evidence.phase = 'migrate after separate renewal'; save()
        managerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
        page = await managerContext.newPage()
        await routeToLocalFork(page)
        await page.clock.install({ time: new Date(Number((await publicClient.getBlock()).timestamp) * 1000) })
        wallet = await injectHeadlessWeb3Provider({ page, privateKeys: [accountKey(c.root_owner)], chains: [localSepolia], permitted: [...PERMITTED_SIGN_KINDS] })
        await overrideManagerFeatureFlags(page, { migration: true, 'profile-view-new': true, 'migration-subname-recreation': true })
        await mockV1Names(page, await f.metadata())
        await page.goto(process.env.MANAGER_APP_URL!)
        await connectManager(page, wallet)
        await waitForManagerFeatureFlagOverride(page)
        await dismissMatrixBackendOverlay(page)
        await openMigrationFlow(page)
        const selected = rootRow(page, f.root)
        await expect(selected).toBeEnabled({ timeout: 90000 })
        if (!await selected.isChecked()) await selected.locator('xpath=..').click()
        if (c.retain_manager === 'Keep') {
          const keep = page.getByRole('checkbox', { name: /Keep .* as a manager/ })
          await expect(keep).toBeVisible(); await keep.check()
        }
        evidence.migrationOutcome = await upgradeAndSettle(page, wallet)
        expect(evidence.migrationOutcome).toBe('success')
        evidence.afterState = await v2State(f.root)
        expect(evidence.afterState?.status).toBe(2)
        expect(evidence.afterState?.latestOwner.toLowerCase()).toBe(account(c.root_owner).address.toLowerCase())
        evidence.afterRecords = await resolveRecords(f.root, f.records)
        expect(evidence.afterRecords.filter((r: { want: string; got: string }) => r.want !== r.got)).toEqual([])
        evidence.managerAfter = await afterPermissions(f, c.root_manager)
        evidence.ownerAfter = await afterPermissions(f, c.root_owner)
        evidence.unrelatedAfter = await afterPermissions(f, 'Unrelated')
        // Match the existing migration retention oracle: V2 safeTransferFrom
        // has additional restrictions; unsafeTransfer tests the owner's
        // transfer authority while other wallets retain roles.
        evidence.transferOracle = 'unsafeTransfer: same requirement as retention-oracle.ts'
        for (const action of ['records', 'setResolver', 'unsafeTransfer'] as const) {
          expect(evidence.ownerAfter?.[action].result, `Renewed owner retains ${action}`).toBe('ALLOWED')
          expect(evidence.unrelatedAfter?.[action].result, `Unrelated wallet denied ${action}`).toBe('DENIED')
        }
        if (c.retain_manager === 'Keep') {
          expect(evidence.managerAfter?.registryRoles).toBe(1n << 24n)
          expect(evidence.managerAfter?.resolverRoles).toBe(0x1111111n)
          expect(evidence.managerAfter?.records.result).toBe('ALLOWED')
          expect(evidence.managerAfter?.setResolver.result).toBe('ALLOWED')
          expect(evidence.managerAfter?.unsafeTransfer.result).toBe('DENIED')
          expect(evidence.managerAfter?.grantResolverRole.result).toBe('DENIED')
        }
        evidence.afterActivity = await chainActivity(f.startBlock)
        pass('Separate renewal then migration preserves records and owner', 'migrate after separate renewal', c.root_owner, 'Actual separate app renewal followed by Manager migration succeeded; exact V2 holder and all 18 resolved values match. The retained manager bitmap is checked when selected.', 'Manager')
        evidence.phase = 'completed separate renewal and migration workaround'; save()
        return
      }

      evidence.phase = 'resolver editing after V1 renewal'; save()
      managerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
      const editor = await managerContext.newPage()
      await routeToLocalFork(editor); await installInventory(editor, f, 'before')
      await editor.clock.install({ time: new Date(Number((await publicClient.getBlock()).timestamp) * 1000) })
      const managerWallet = await injectHeadlessWeb3Provider({ page: editor, privateKeys: [accountKey(c.root_manager)], chains: [localSepolia], permitted: [...PERMITTED_SIGN_KINDS] })
      await editor.goto(process.env.PORTAL_APP_URL!); await connectWithHeadlessWallet(editor, managerWallet)
      await editor.goto(`${process.env.PORTAL_APP_URL}/${f.root}/change-resolver`)
      const custom = editor.getByRole('switch', { name: 'Use custom resolver', exact: true })
      const field = editor.getByLabel('Contract address', { exact: true })
      await expect(field.or(custom).first()).toBeVisible({ timeout: 60000 })
      if (await custom.isVisible()) await custom.check()
      try {
        await field.fill(zeroAddress)
        await editor.getByRole('button', { name: 'Save changes', exact: true }).click()
        await driveTransactionsToSuccess(editor, managerWallet, [], 90000)
        expect(await resolver()).toBe(zeroAddress)
      } finally {
        if (await resolver() !== beforeResolver) await send(account(c.root_manager), f.wrappedFor(f.root) ? V1_NAME_WRAPPER : V1_ENS_REGISTRY, encodeFunctionData({ abi, functionName: 'setResolver', args: [node, beforeResolver] }))
        expect(await resolveRecords(f.root, f.records)).toEqual(evidence.afterRenewalRecords)
      }
      pass('Resolver action recovers after actual renewal', 'change resolver after V1 renewal', c.root_manager, 'The renewed V1 name accepted an actual Explorer resolver change. Exact pointer readback passed; fixture cleanup restored the original resolver and every record.')
      evidence.phase = 'record editing after V1 renewal'; save()
      evidence.afterRenewalUI = await checkActorUI(browser, f, c.root_manager, 'before', true, true, 'after-v1-renewal')
      for (const view of evidence.afterRenewalUI) {
        const edit = view.checks.editRecords
        evidence.appChecks.push({ app: view.app, actor: c.root_manager, stage: 'before', action: 'edit records after V1 renewal', ...edit })
        expect.soft(edit.result, `${view.app} edit after actual V1 renewal: ${edit.detail}`).toBe('PASS')
      }
      save()
      const edit = evidence.afterRenewalUI.find((app: { app: string }) => app.app === 'Explorer').checks.editRecords
      expect(edit.result, edit.detail).toBe('PASS'); expect(edit.detail).toContain('Submitted a distinct record')
      pass('Record editing recovers after actual renewal', 'edit records after V1 renewal', c.root_manager, edit.detail)
      evidence.afterRecords = await resolveRecords(f.root, f.records)
      expect(evidence.afterRecords).toEqual(evidence.afterRenewalRecords)
      expect(await sourceRecords(f.root, f.records)).toEqual(evidence.beforeSourceRecords)
      evidence.afterActivity = await chainActivity(f.startBlock)
      evidence.phase = 'completed V1 renewal recovery'; save()
    } catch (error) {
      evidence.error = String(error)
      evidence.screen = await page.locator('body').innerText().catch(() => '')
      await page.screenshot({ path: resolve(out, `v1-grace-recovery-${c.config_id}-failed.png`), fullPage: true }).catch(() => {})
      throw error
    } finally {
      evidence.completedAt = new Date().toISOString(); evidence.assertionErrors = info.errors.map(error => error.message); save()
      await closeFixtureContext(managerContext); await closeFixtureContext(renewalContext); await closeFixtureContext(context)
    }
  })
}
