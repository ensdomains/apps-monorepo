import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { injectHeadlessWeb3Provider } from '@ensdomains/headless-web3-provider'
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { getName } from '@ensdomains/ensjs/public'
import { expect, type Browser } from '@playwright/test'
import { encodeFunctionData, namehash, parseAbi, zeroAddress } from 'viem'
import { V1_ENS_REGISTRY } from '../../fixtures/makeV1Name.js'
import { publicClient } from '../../helpers/anvil-client.js'
import { PERMITTED_SIGN_KINDS } from '../../helpers/manager-auth.js'
import { connectWithHeadlessWallet } from '../../helpers/portal-auth.js'
import { resolveRecords } from '../../helpers/resolve-records.js'
import { driveTransactionsToSuccess } from '../../helpers/transaction-modal.js'
import { account, accountKey, send, type seedConfiguration } from './seed.js'
import { installInventory } from './ui-actions.js'
import { v2State } from './probes.js'
import { localSepolia } from './matrix-fixture.js'
import { routeToLocalFork, closeFixtureContext } from './local-fork-routing.js'
import { rethrowUnsettledWallet } from './workflow-check.js'
import type { NamespaceCheck } from './namespace-actions.js'
import { queryFailures } from './diagnostics.js'

type Fixture = Awaited<ReturnType<typeof seedConfiguration>>
const registryABI = parseAbi(['function owner(bytes32 node) view returns(address)', 'function resolver(bytes32 node) view returns(address)', 'function ttl(bytes32 node) view returns(uint64)', 'function setRecord(bytes32 node,address owner,address resolver,uint64 ttl)'])
const resolverABI = parseAbi(['function name(bytes32 node) view returns(string)', 'function setName(bytes32 node,string name)'])
const registrar = ensL1Contracts[supportedL1Chains.sepolia].ensReverseRegistrar.address
const registrarABI = parseAbi(['function setName(string name) returns(bytes32)'])
const original = new Map<string, Map<string, Awaited<ReturnType<typeof readReverse>>>>()
// A saved cleanup checkpoint does not establish that the app write completed.
const verifiedClaims = new Map<string, Set<string>>()
const readReverse = async (actor: string) => {
  const node = namehash(`${account(actor).address.slice(2).toLowerCase()}.addr.reverse`)
  const [owner, resolver, ttl] = await Promise.all([
    publicClient.readContract({ address: V1_ENS_REGISTRY, abi: registryABI, functionName: 'owner', args: [node] }),
    publicClient.readContract({ address: V1_ENS_REGISTRY, abi: registryABI, functionName: 'resolver', args: [node] }),
    publicClient.readContract({ address: V1_ENS_REGISTRY, abi: registryABI, functionName: 'ttl', args: [node] }),
  ])
  const name = resolver === zeroAddress ? '' : await publicClient.readContract({ address: resolver, abi: resolverABI, functionName: 'name', args: [node] })
  return { node, owner, resolver, ttl, name }
}

/** Restore only this fixture's own wallet reverse checkpoints, even after a failed migration. */
export async function restorePrimaryCheckpoints(f: Fixture) {
  const saved = original.get(f.leaf)
  if (!saved) return
  for (const [actor, prior] of saved) {
    await send(account(actor), registrar, encodeFunctionData({ abi: registrarABI, functionName: 'setName', args: [prior.name] }))
    const current = await readReverse(actor)
    if (prior.resolver !== zeroAddress && current.resolver !== prior.resolver) await send(account(actor), prior.resolver, encodeFunctionData({ abi: resolverABI, functionName: 'setName', args: [prior.node, prior.name] }))
    if (current.owner !== prior.owner || current.resolver !== prior.resolver || current.ttl !== prior.ttl) await send(account(actor), V1_ENS_REGISTRY, encodeFunctionData({ abi: registryABI, functionName: 'setRecord', args: [prior.node, prior.owner, prior.resolver, prior.ttl] }))
    expect(await readReverse(actor), 'Restore the exact reverse name, resolver, holder and TTL').toEqual(prior)
  }
  original.delete(f.leaf)
  verifiedClaims.delete(f.leaf)
}

/** Every wallet may claim its own reverse; only a matching forward address is a primary name. */
export async function checkPrimaryActions(browser: Browser, f: Fixture, actor: string, stage: 'before' | 'after', onCheck: (value: NamespaceCheck) => void) {
  if (stage === 'after' && actor !== 'Disconnected' && !verifiedClaims.get(f.leaf)?.has(actor)) {
    onCheck({ app: 'Explorer', actor, stage, action: 'retain reverse and verified primary after migration/refusal', result: 'BLOCKED', detail: 'The before-stage app reverse claim was not verified on chain, so there is no established claim whose retention can be checked. Run this wallet’s before/after primary workflow again with a fresh fixture. This does not prove lost reverse data.', evidence: { prerequisite: 'verified before-stage reverse write', prerequisiteResult: 'NOT ESTABLISHED' } })
    return
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const out = resolve(process.env.REPLACEMENT_RESULTS!, 'primary', f.c.config_id, stage, actor.replaceAll(' ', '-'))
  mkdirSync(out, { recursive: true })
  let ready = false
  let checkpoint: unknown
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(String(error)))
  const action = stage === 'before' ? 'set own reverse and verify primary name' : 'retain reverse and verified primary after migration/refusal'
  try {
    const state = await v2State(f.leaf)
    const baseline = await resolveRecords(f.leaf, f.records)
    await routeToLocalFork(page)
    await installInventory(page, f, state?.latestOwner && state.latestOwner !== zeroAddress ? 'after' : 'before')
    await page.clock.install({ time: new Date(Number((await publicClient.getBlock()).timestamp) * 1000) })
    const wallet = await injectHeadlessWeb3Provider({ page, privateKeys: [accountKey(actor === 'Disconnected' ? 'W1' : actor)], chains: [localSepolia], permitted: [...PERMITTED_SIGN_KINDS] })
    const base = process.env.PORTAL_APP_URL!
    await page.goto(base)
    if (actor !== 'Disconnected') await connectWithHeadlessWallet(page, wallet)
    const address = account(actor === 'Disconnected' ? 'W1' : actor).address
    await page.goto(`${base}/addr/${address}/reverse-resolution`)
    const row = page.getByRole('row').filter({ has: page.getByText('Mainnet', { exact: true }) })
    await expect(row).toBeVisible({ timeout: 60000 })
    ready = true
    if (actor === 'Disconnected') {
      await expect(row.getByRole('button', { name: 'More', exact: true })).toHaveCount(0)
      onCheck({ app: 'Explorer', actor, stage, action, result: 'PASS', detail: 'Loaded reverse-resolution view offers no write control without a connected wallet.' })
      return
    }
    if (stage === 'before') {
      if (!original.has(f.leaf)) original.set(f.leaf, new Map())
      original.get(f.leaf)!.set(actor, await readReverse(actor))
      await row.getByRole('button', { name: 'More', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Mainnet resolution' })
      await dialog.locator('input[name="name"]').fill(f.leaf)
      await dialog.getByRole('button', { name: 'Update', exact: true }).click()
      await driveTransactionsToSuccess(page, wallet, ['tx-update-reverse-name'], 90000)
    }
    const raw = await readReverse(actor)
    expect(raw.name).toBe(f.leaf)
    if (stage === 'before') {
      if (!verifiedClaims.has(f.leaf)) verifiedClaims.set(f.leaf, new Set())
      verifiedClaims.get(f.leaf)!.add(actor)
    }
    const forward = await resolveRecords(f.leaf, { addresses: [{ coinType: 60, value: address }] })
    const matching = forward[0].got.toLowerCase() === address.toLowerCase()
    const primary = await getName(publicClient as never, { address })
    if (matching) { expect(primary?.name).toBe(f.leaf); expect(primary?.match).toBe(true) }
    else expect(primary).toBeNull()
    checkpoint = { raw, forward, primary, matching }
    onCheck({ app: 'Explorer', actor, stage, action: 'exact reverse and forward verification', result: 'PASS', detail: stage === 'before' ? 'Actual app-submitted reverse name is present on chain; independent forward/reverse verification checked. This assertion does not certify the subsequent app display.' : 'The original reverse claim survived migration/refusal and independent forward/reverse verification agrees. App display is assessed separately.', evidence: checkpoint })
    ready = false
    await page.goto(`${base}/addr/${address}/reverse-resolution`)
    await expect(row, 'The reverse-resolution page must load before checking its displayed name').toBeVisible({ timeout: 60000 })
    ready = true
    await expect(row.getByText(f.leaf, { exact: true }).first()).toBeVisible({ timeout: 60000 })
    if (matching) await expect(row.getByText('Primary name', { exact: true })).toBeVisible()
    else await expect(row.getByText('Primary name', { exact: true })).toHaveCount(0)
    expect(await resolveRecords(f.leaf, f.records)).toEqual(baseline)
    const screen = await page.locator('body').innerText()
    writeFileSync(resolve(out, 'result.txt'), screen)
    await page.screenshot({ path: resolve(out, 'result.png'), fullPage: true })
    onCheck({ app: 'Explorer', actor, stage, action, result: 'PASS', detail: stage === 'before' ? 'Actual own-wallet reverse write verified in raw resolver storage; forward-match and Primary name badge checked independently. Claim retained through the migration checkpoint.' : 'The exact before-stage reverse claim survived actual migration/refusal; universal forward/reverse verification and the app Primary name badge agree. Exact name records unchanged.', evidence: { raw, forward, primary, matching, screen } })
  } catch (error) {
    const detail = String(error)
    const screen = await page.locator('body').innerText().catch(() => '')
    const blocked = !ready || !screen.trim() || /HTTP request failed|fetch failed|ECONNREFUSED|missing bytecode|Local matrix wallet request did not settle/.test(detail)
    onCheck({ app: 'Explorer', actor, stage, action, result: blocked ? 'BLOCKED' : 'FAIL', detail: blocked ? 'Loaded app readiness was not established; this does not prove lost reverse data. ' + detail : detail, evidence: { checkpoint, screen, pageErrors, queryFailures: await queryFailures(page) } })
    rethrowUnsettledWallet(error)
  } finally { await closeFixtureContext(context) }
}
