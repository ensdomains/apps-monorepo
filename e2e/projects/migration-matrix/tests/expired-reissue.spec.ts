import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { injectHeadlessWeb3Provider } from '@ensdomains/headless-web3-provider'
import { namehash, parseAbi, zeroAddress } from 'viem'
import { test, expect, localSepolia } from '../matrix-fixture.js'
import { account, accountKey, seedConfiguration, type Configuration } from '../seed.js'
import { beforePermissions } from '../probes.js'
import { sourceRecords, chainActivity } from '../record-evidence.js'
import { installInventory } from '../ui-actions.js'
import { routeToLocalFork, closeFixtureContext } from '../local-fork-routing.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { resolveRecords } from '../../../helpers/resolve-records.js'
import { PERMITTED_SIGN_KINDS } from '../../../helpers/manager-auth.js'
import { connectWithHeadlessWallet } from '../../../helpers/portal-auth.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'
import { V1_ENS_REGISTRY, V1_NAME_WRAPPER } from '../../../fixtures/makeV1Name.js'

const configurations: Configuration[] = JSON.parse(readFileSync(new URL('../configurations.json', import.meta.url), 'utf8'))
const ids = process.env.MATRIX_IDS?.split(',') ?? ['CFG-0929']
const abi = parseAbi(['function getData(uint256 id) view returns(address owner,uint32 fuses,uint64 expiry)', 'function resolver(bytes32 node) view returns(address)'])

for (const c of configurations.filter(c => ids.includes(c.config_id))) {
  test(`expired child parent re-issue ${c.config_id}`, async ({ browser }, info) => {
    info.setTimeout(600_000)
    const out = resolve(process.env.REPLACEMENT_RESULTS!, 'supplemental')
    mkdirSync(out, { recursive: true })
    const actor = process.env.MATRIX_UI_ACTORS?.split(',')[0] ?? c.parent_controller
    const evidence: Record<string, any> = {
      id: `EXPIRED-REISSUE-${c.config_id}`, configurations: [c.config_id], configuration: c,
      startedAt: new Date().toISOString(), phase: 'fixture', checks: {}, appChecks: [],
      scope: 'Fresh expired V1 wrapped child. Test the parent re-issue route advertised by the transfer refusal, separately from migration eligibility. No claim that an expired child should migrate.',
      discovery: 'Mocked exact fixture identities; contract state and transactions are real on the isolated local fork.',
    }
    const save = () => writeFileSync(resolve(out, `expired-reissue-${c.config_id}.json`), JSON.stringify(evidence, (_k, v) => typeof v === 'bigint' ? String(v) : v, 2))
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    let ready = false
    let checkpoint: (() => Promise<unknown>) | undefined
    const capture = async (label: string) => {
      const body = await page.locator('body').innerText()
      writeFileSync(resolve(out, `expired-reissue-${c.config_id}-${label}.txt`), body)
      await page.screenshot({ path: resolve(out, `expired-reissue-${c.config_id}-${label}.png`), fullPage: true })
      return body
    }
    try {
      expect(c.level).not.toBe('2LD')
      expect(c.name_expiry.startsWith('Expired')).toBe(true)
      expect(c.parent_migrated).toBe('No')
      const f = await seedConfiguration(c)
      await f.advance()
      const parent = f.leaf.split('.').slice(1).join('.')
      expect(f.wrappedFor(f.leaf)).toBe(true)
      checkpoint = async () => ({
        block: await publicClient.getBlockNumber(),
        wrapper: await publicClient.readContract({ address: V1_NAME_WRAPPER, abi, functionName: 'getData', args: [BigInt(namehash(f.leaf))] }),
        tree: await Promise.all(f.names.map(async name => ({ name,
          resolver: await publicClient.readContract({ address: V1_ENS_REGISTRY, abi, functionName: 'resolver', args: [namehash(name)] }),
          source: await sourceRecords(name, f.recordsFor(name)),
          resolved: await resolveRecords(name, f.recordsFor(name)),
        }))),
      })
      evidence.subject = f.leaf; evidence.parent = parent; evidence.names = f.names; evidence.actor = actor
      evidence.before = await checkpoint()
      expect(evidence.before.wrapper[0]).toBe(zeroAddress)
      evidence.authority = await beforePermissions(f, actor)
      expect(evidence.authority.transferAsParent.result, 'Parent re-assignment is independently authorized by the actual contract').toBe('ALLOWED')
      await routeToLocalFork(page)
      await installInventory(page, f, 'before')
      await page.clock.install({ time: new Date(Number((await publicClient.getBlock()).timestamp) * 1000) })
      const wallet = await injectHeadlessWeb3Provider({ page, privateKeys: [accountKey(actor)], chains: [localSepolia], permitted: [...PERMITTED_SIGN_KINDS] })
      const base = process.env.PORTAL_APP_URL!
      await page.goto(base); await connectWithHeadlessWallet(page, wallet)
      evidence.phase = 'parent create-subname route'; save()
      await page.goto(`${base}/${parent}/create-subname`)
      const label = page.getByLabel('Subname', { exact: true })
      const refusal = page.getByText(/^(This name is in its grace period|Nobody holds this name|Subnames are locked|Only its owner can create subnames|You can[’']t create subnames here|Permission Denied|Wallet Not Connected|No registrar permissions|Couldn’t check this name)$/, { exact: true })
      await expect(label.or(refusal).first()).toBeVisible({ timeout: 90000 })
      ready = true
      evidence.parentScreen = await capture('parent')
      await expect(label, 'The controlling parent wallet needs a usable re-issue form').toBeVisible()
      await label.fill(f.leaf.split('.')[0]!)
      const recipient = account('Unrelated').address
      evidence.recipient = recipient
      await page.getByLabel('Owner', { exact: true }).fill(recipient)
      const submit = page.getByRole('button', { name: 'Create subname', exact: true })
      await expect.poll(async () => await submit.isEnabled() || /already registered|already taken/i.test(await page.locator('body').innerText()), { timeout: 60000 }).toBe(true)
      evidence.labelScreen = await capture('label')
      await expect(submit, 'An expired wrapped child must be re-issuable by its authorized parent; transfer screen explicitly directs the user here').toBeEnabled()
      await submit.click()
      await driveTransactionsToSuccess(page, wallet, ['tx-create-ens-subname'], 90000)
      evidence.after = await checkpoint()
      expect(evidence.after.wrapper[0].toLowerCase(), 'Actual new effective holder').toBe(recipient.toLowerCase())
      for (const original of evidence.before.tree) {
        const current = evidence.after.tree.find((item: { name: string }) => item.name === original.name)
        expect(current?.resolver, `${original.name} resolver pointer`).toBe(original.resolver)
        expect(current?.source, `${original.name} exact source records and bytes`).toEqual(original.source)
        expect(current?.resolved, `${original.name} public record resolution`).toEqual(original.resolved)
      }
      const detail = 'Parent re-issued the expired V1 wrapped child through Explorer. Actual effective holder is the requested recipient; all seeded tree resolver pointers, source bytes and resolved records are unchanged. This is a re-issue workflow, not successful child migration.'
      evidence.checks['Parent re-issue with record preservation'] = { result: 'PASS', detail }
      evidence.appChecks.push({ app: 'Explorer', actor, stage: 'before', action: 'reissue expired subname through parent', result: 'PASS', detail })
      evidence.afterActivity = await chainActivity(f.startBlock)
      evidence.phase = 'completed expired-child re-issue'; save()
    } catch (error) {
      evidence.error = String(error)
      const infrastructure = /HTTP request failed|fetch failed|ECONNREFUSED|missing bytecode for code hash|Local matrix wallet request did not settle/.test(String(error))
      const result = ready && !infrastructure ? 'FAIL' : 'BLOCKED'
      evidence.screen = await capture('failed').catch(() => '')
      evidence.after = await checkpoint?.().catch(() => null)
      const detail = `${result === 'FAIL' ? 'Loaded parent re-issue workflow failed' : 'Re-issue test could not reach a reliable app checkpoint'}: ${String(error)}`
      evidence.checks['Parent re-issue with record preservation'] = { result, detail }
      evidence.appChecks.push({ app: 'Explorer', actor, stage: 'before', action: 'reissue expired subname through parent', result, detail, evidence: { screen: evidence.screen } })
      throw error
    } finally {
      evidence.completedAt = new Date().toISOString(); evidence.assertionErrors = info.errors.map(error => error.message); save()
      await closeFixtureContext(context)
    }
  })
}
