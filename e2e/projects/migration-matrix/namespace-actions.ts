import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { injectHeadlessWeb3Provider } from '@ensdomains/headless-web3-provider'
import { expect, type Browser } from '@playwright/test'
import { encodeFunctionData, labelhash, namehash, parseAbi, zeroAddress } from 'viem'
import { V1_BASE_REGISTRAR, V1_ENS_REGISTRY, V1_NAME_WRAPPER } from '../../fixtures/makeV1Name.js'
import { publicClient } from '../../helpers/anvil-client.js'
import { PERMITTED_SIGN_KINDS } from '../../helpers/manager-auth.js'
import { connectWithHeadlessWallet } from '../../helpers/portal-auth.js'
import { resolveRecords } from '../../helpers/resolve-records.js'
import { driveTransactionsToSuccess } from '../../helpers/transaction-modal.js'
import { account, accountKey, send, type seedConfiguration } from './seed.js'
import { beforePermissions, afterPermissions, v2State } from './probes.js'
import { installInventory } from './ui-actions.js'
import { localSepolia } from './matrix-fixture.js'
import { routeToLocalFork, closeFixtureContext } from './local-fork-routing.js'
import { roleQueryEvidence, queryFailures } from './diagnostics.js'
import { legacyTransferAuthority, legacyTransferDenialTitle } from './transfer-authority.js'
import { checkWorkflow } from './workflow-check.js'
import { transferReadiness, transferPreparationEvidence } from './transfer-readiness.js'
import { createSubnameReadiness, createSubnameQueryEvidence } from './create-subname-readiness.js'

type Fixture = Awaited<ReturnType<typeof seedConfiguration>>
export type NamespaceCheck = { app: 'Explorer' | 'Manager'; actor: string; stage: 'before' | 'after'; action: string; result: 'PASS' | 'FAIL' | 'BLOCKED'; detail: string; evidence?: unknown }
const legacyABI = parseAbi(['function resolver(bytes32 node) view returns(address)', 'function owner(bytes32 node) view returns(address)', 'function setResolver(bytes32 node,address resolver)', 'function setRecord(bytes32 node,address owner,address resolver,uint64 ttl)', 'function getData(uint256 id) view returns(address owner,uint32 fuses,uint64 expiry)'])
const modernABI = parseAbi(['function getResolver(string label) view returns(address)', 'function setResolver(uint256 id,address resolver)', 'function getSubregistry(string label) view returns(address)', 'function setSubregistry(uint256 id,address registry)', 'function unregister(uint256 id)', 'function roles(uint256 resource,address user) view returns(uint256)', 'function revokeRoles(uint256 resource,uint256 roles,address user) returns(bool)', 'function unsafeTransfer(address to,uint256 tokenId,bytes data)'])

/** Committed namespace actions with restoration, independently before and after migration/refusal. */
export async function checkNamespaceActions(browser: Browser, f: Fixture, actor: string, stage: 'before' | 'after', onCheck: (check: NamespaceCheck) => void) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const pageErrors: string[] = []
  const requestFailures: { path: string; url: string; method: string; error?: string }[] = []
  page.on('pageerror', error => pageErrors.push(String(error)))
  page.on('requestfailed', request => {
    const url = new URL(request.url())
    requestFailures.push({ path: url.pathname, url: `${url.origin}${url.pathname}`, method: request.method(), error: request.failure()?.errorText })
  })
  const out = resolve(process.env.REPLACEMENT_RESULTS!, 'namespace', f.c.config_id, stage, actor.replaceAll(' ', '-'))
  mkdirSync(out, { recursive: true })
  const state = await v2State(f.leaf)
  const migrated = Boolean(state && state.latestOwner !== zeroAddress)
  const baseline = await resolveRecords(f.leaf, f.records)
  const permission = actor === 'Disconnected' ? null : migrated ? await afterPermissions(f, actor) : await beforePermissions(f, actor)
  const currentResolver = () => migrated
    ? publicClient.readContract({ address: state!.registry, abi: modernABI, functionName: 'getResolver', args: [state!.label] })
    : publicClient.readContract({ address: V1_ENS_REGISTRY, abi: legacyABI, functionName: 'resolver', args: [namehash(f.leaf)] })
  const originalResolver = await currentResolver()
  let temporaryChild: string | undefined
  const capture = async (action: string) => {
    const body = await page.locator('body').innerText()
    writeFileSync(resolve(out, `${action}.txt`), body)
    await page.screenshot({ path: resolve(out, `${action}.png`), fullPage: true })
    return body
  }
  const capturedInput = async (label: string) => {
    const input = page.getByLabel(label, { exact: true })
    return await input.count().catch(() => 0) ? input.inputValue({ timeout: 1000 }).catch(() => null) : null
  }
  const capturedCreateDisabled = async () => {
    const button = page.getByRole('button', { name: 'Create subname', exact: true })
    return await button.count().catch(() => 0) ? button.isDisabled({ timeout: 1000 }).catch(() => null) : null
  }
  let ready = false
  const check = (action: string, run: () => Promise<{ detail: string; evidence?: unknown }>) => checkWorkflow(
    run,
    () => ready,
    async () => ({
      screen: await capture(action).catch(() => ''),
      pageErrors: [...pageErrors], requestFailures: [...requestFailures], queryFailures: await queryFailures(page),
      transferPreparation: action === 'full name transfer' ? await transferPreparationEvidence(page) : undefined,
      createForm: action === 'create subname' ? {
        label: await capturedInput('Subname'),
        owner: await capturedInput('Owner'),
        disabled: await capturedCreateDisabled(),
        availabilityQueries: await createSubnameQueryEvidence(page),
      } : undefined,
    }),
    result => onCheck({ app: 'Explorer', actor, stage, action, ...result }),
  )
  try {
    await routeToLocalFork(page)
    await installInventory(page, f, migrated ? 'after' : 'before')
    await page.clock.install({ time: new Date(Number((await publicClient.getBlock()).timestamp) * 1000) })
    const wallet = await injectHeadlessWeb3Provider({ page, privateKeys: [accountKey(actor === 'Disconnected' ? 'W1' : actor)], chains: [localSepolia], permitted: [...PERMITTED_SIGN_KINDS] })
    const base = process.env.PORTAL_APP_URL!
    await page.goto(base)
    if (actor !== 'Disconnected') await connectWithHeadlessWallet(page, wallet)
    await check('change resolver', async () => {
      if (permission?.setResolver.result === 'BLOCKED') throw new Error('Authority unavailable: ' + permission.setResolver.detail)
      await page.goto(`${base}/${f.leaf}/change-resolver`)
      const field = page.getByLabel('Contract address', { exact: true })
      const custom = page.getByRole('switch', { name: 'Use custom resolver', exact: true })
      const denied = page.getByText(/^(Permission Denied|Wallet Not Connected)$/, { exact: true })
      const registryError = page.getByText('Could not find registry for this name.', { exact: true })
      await expect(field.or(custom).or(denied).or(registryError).first()).toBeVisible({ timeout: 60000 })
      ready = true
      if (await registryError.isVisible()) throw new Error('Loaded app error: could not find registry for this name. The app failed to provide either the resolver action or an explicit permission/renewal gate; this is not a successful policy refusal.')
      if (actor === 'Disconnected' || permission?.setResolver.result === 'DENIED') {
        await expect(denied).toBeVisible()
        await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toHaveCount(0)
        expect(await currentResolver()).toBe(originalResolver)
        return { detail: 'Loaded app refusal matches this wallet’s authority; resolver and exact records unchanged.', evidence: { screen: await capture('resolver-denied') } }
      }
      expect(permission?.setResolver.result).toBe('ALLOWED')
      await expect(denied, 'Contract-authorized wallet must be allowed into the resolver form').toHaveCount(0)
      try {
        if (migrated) {
          await expect(custom).toBeVisible()
          await custom.check()
          await expect(custom).toBeChecked()
        } else if (await custom.isVisible()) await custom.check()
        await expect(field, 'Custom resolver selection exposes an address field').toBeVisible()
        await field.fill(zeroAddress)
        await page.getByRole('button', { name: 'Save changes', exact: true }).click()
        await driveTransactionsToSuccess(page, wallet, [], 90000)
        expect(await currentResolver()).toBe(zeroAddress)
        return { detail: 'Actual app transaction cleared the resolver; exact registry read confirmed the new pointer. Restored the original pointer and complete baseline records.', evidence: { before: originalResolver, observed: zeroAddress, screen: await capture('resolver-cleared') } }
      } finally {
        if (await currentResolver() !== originalResolver) {
          const receipt = migrated
            ? await send(account(actor), state!.registry, encodeFunctionData({ abi: modernABI, functionName: 'setResolver', args: [state!.tokenId, originalResolver] }))
            : await send(account(actor), f.wrappedFor(f.leaf) ? V1_NAME_WRAPPER : V1_ENS_REGISTRY, encodeFunctionData({ abi: legacyABI, functionName: 'setResolver', args: [namehash(f.leaf), originalResolver] }))
          expect(receipt.status).toBe('success')
        }
        expect(await currentResolver()).toBe(originalResolver)
        expect(await resolveRecords(f.leaf, f.records)).toEqual(baseline)
      }
    })
    // Resolve-changing checks restore before this next action. A failed cleanup
    // aborts the fixture rather than allowing a contaminated migration baseline.
    expect(await currentResolver()).toBe(originalResolver)
    expect(await resolveRecords(f.leaf, f.records)).toEqual(baseline)
    ready = false
    // Creating below a 3LD is a 4LD operation, even when the fixture is in scope.
    if (process.env.MATRIX_MAX_LEVEL !== '3' || f.c.level === '2LD') await check('create subname', async () => {
      await page.goto(`${base}/${f.leaf}/create-subname`)
      const field = page.getByLabel('Subname', { exact: true })
      const deploy = page.getByRole('link', { name: 'Deploy subregistry', exact: true })
      const denial = page.getByText(/^(This name is in its grace period|Nobody holds this name|Subnames are locked|Only its owner can create subnames|You can[’']t create subnames here|Permission Denied|Wallet Not Connected|No registrar permissions)$/, { exact: true })
      await expect(field.or(deploy).or(denial).first()).toBeVisible({ timeout: 60000 })
      ready = true
      const authority = permission?.createSubname
      if (!migrated && f.c.level === '2LD' && f.c.root_lifecycle === 'Grace') {
        await expect(page.getByText('This name is in its grace period', { exact: true })).toBeVisible()
        return { detail: 'Loaded V1 2LD grace gate requires renewal before creating subnames; contract authority remains reported separately.', evidence: { authority, screen: await capture('create-grace-gate') } }
      }
      if (actor === 'Disconnected') {
        const create = page.getByRole('button', { name: 'Create subname', exact: true })
        if (await create.count()) await expect(create).toBeDisabled()
        else await expect(create).toHaveCount(0)
        return { detail: 'No connected signer can submit a child creation.', evidence: { screen: await capture('create-disconnected') } }
      }
      if (authority?.result === 'DENIED' || (migrated && !authority && (permission as Awaited<ReturnType<typeof afterPermissions>>)?.setSubregistry.result === 'DENIED')) {
        await expect(field).toHaveCount(0)
        return { detail: 'Loaded app provides no child creation form to this unauthorized wallet.', evidence: { authority, screen: await capture('create-denied') } }
      }
      const originalSubregistry = migrated ? await publicClient.readContract({ address: state!.registry, abi: modernABI, functionName: 'getSubregistry', args: [state!.label] }) : undefined
      const label = `checked-${actor.toLowerCase().replaceAll(' ', '-')}-${stage}`
      const name = `${label}.${f.leaf}`
      temporaryChild = name
      let created = false
      try {
        if (await deploy.isVisible()) {
          expect((permission as Awaited<ReturnType<typeof afterPermissions>>)?.setSubregistry.result).toBe('ALLOWED')
          await deploy.click()
          await page.getByRole('button', { name: 'Configure registry', exact: true }).click({ timeout: 60000 })
          await page.getByRole('button', { name: 'Deploy', exact: true }).click({ timeout: 60000 })
          await driveTransactionsToSuccess(page, wallet, [], 120000)
          await page.goto(`${base}/${f.leaf}/create-subname`)
        } else expect(authority?.result).toBe('ALLOWED')
        await expect(denial, 'Contract-authorized wallet must be allowed into the child creation form').toHaveCount(0)
        ready = false
        await field.fill(label)
        await page.getByLabel('Owner', { exact: true }).fill(account(actor).address)
        const preparation = await createSubnameReadiness(page, label, account(actor).address)
        ready = preparation.result !== 'pending'
        if (preparation.result !== 'ready') throw new Error(preparation.detail)
        await page.getByRole('button', { name: 'Create subname', exact: true }).click()
        await driveTransactionsToSuccess(page, wallet, ['tx-create-ens-subname'], 90000)
        created = true
        const actual = migrated ? (await v2State(name))?.latestOwner : f.wrappedFor(f.leaf)
          ? (await publicClient.readContract({ address: V1_NAME_WRAPPER, abi: legacyABI, functionName: 'getData', args: [BigInt(namehash(name))] }))[0]
          : await publicClient.readContract({ address: V1_ENS_REGISTRY, abi: legacyABI, functionName: 'owner', args: [namehash(name)] })
        expect(actual?.toLowerCase()).toBe(account(actor).address.toLowerCase())
        expect(await resolveRecords(f.leaf, f.records)).toEqual(baseline)
        return { detail: 'App-created child has the exact requested holder; parent records remain unchanged. Temporary child removed before the next checkpoint.', evidence: { name, actual, screen: await capture('created') } }
      } finally {
        // Also detect a committed transaction when the UI completion assertion
        // failed, so no undiscovered child can alter migration eligibility.
        if (migrated) {
          const child = await v2State(name)
          if (child?.status === 2) await send(account(actor), child.registry, encodeFunctionData({ abi: modernABI, functionName: 'unregister', args: [child.tokenId] }))
          if (originalSubregistry === zeroAddress) await send(account(actor), state!.registry, encodeFunctionData({ abi: modernABI, functionName: 'setSubregistry', args: [state!.tokenId, zeroAddress] }))
        } else {
          const childOwner = await publicClient.readContract({ address: V1_ENS_REGISTRY, abi: legacyABI, functionName: 'owner', args: [namehash(name)] })
          if (created || childOwner !== zeroAddress) await send(account(actor), f.wrappedFor(f.leaf) ? V1_NAME_WRAPPER : V1_ENS_REGISTRY, encodeFunctionData({ abi: legacyABI, functionName: 'setRecord', args: [namehash(name), zeroAddress, zeroAddress, 0n] }))
          expect(await publicClient.readContract({ address: V1_ENS_REGISTRY, abi: legacyABI, functionName: 'owner', args: [namehash(name)] })).toBe(zeroAddress)
        }
        expect(await resolveRecords(f.leaf, f.records)).toEqual(baseline)
      }
    })
    if (!migrated && process.env.MATRIX_LEGACY_TRANSFER_ACTIONS === '1') {
      const tokenABI = parseAbi(['function ownerOf(uint256 id) view returns(address)', 'function transferFrom(address from,address to,uint256 id)', 'function safeTransferFrom(address from,address to,uint256 id,uint256 amount,bytes data)', 'function setOwner(bytes32 node,address owner)'])
      const node = namehash(f.leaf)
      const registryOwner = () => publicClient.readContract({ address: V1_ENS_REGISTRY, abi: legacyABI, functionName: 'owner', args: [node] })
      const wrappedData = () => publicClient.readContract({ address: V1_NAME_WRAPPER, abi: legacyABI, functionName: 'getData', args: [BigInt(node)] })
      const holder = () => f.wrappedFor(f.leaf) ? wrappedData().then(data => data[0]) : f.c.level === '2LD'
        ? publicClient.readContract({ address: V1_BASE_REGISTRAR, abi: tokenABI, functionName: 'ownerOf', args: [BigInt(labelhash(f.label))] }).catch(() => null)
        : registryOwner()
      const originalManager = await registryOwner(), originalHolder = await holder()
      const wrapper = f.wrappedFor(f.leaf) ? await wrappedData() : null
      const signerFor = (address: string) => {
        const id = ['W1', 'W2', 'W3', 'W4', 'Operator', 'Resolver delegate', 'Unrelated'].find(id => account(id).address.toLowerCase() === address.toLowerCase())
        if (!id) throw new Error('Fixture cleanup cannot sign for unexpected holder ' + address)
        return account(id)
      }
      const restore = async () => {
        const currentHolder = await holder()
        if (currentHolder !== originalHolder) {
          if (!currentHolder || !originalHolder || currentHolder === zeroAddress) throw new Error('Fixture holder disappeared; cleanup cannot invent an owner')
          if (f.wrappedFor(f.leaf)) await send(signerFor(currentHolder), V1_NAME_WRAPPER, encodeFunctionData({ abi: tokenABI, functionName: 'safeTransferFrom', args: [currentHolder, originalHolder, BigInt(node), 1n, '0x'] }))
          else if (f.c.level === '2LD') await send(signerFor(currentHolder), V1_BASE_REGISTRAR, encodeFunctionData({ abi: tokenABI, functionName: 'transferFrom', args: [currentHolder, originalHolder, BigInt(labelhash(f.label))] }))
          else await send(signerFor(currentHolder), V1_ENS_REGISTRY, encodeFunctionData({ abi: tokenABI, functionName: 'setOwner', args: [node, originalHolder] }))
        }
        const manager = await registryOwner()
        if (manager !== originalManager) await send(signerFor(manager), V1_ENS_REGISTRY, encodeFunctionData({ abi: tokenABI, functionName: 'setOwner', args: [node, originalManager] }))
        expect(await registryOwner()).toBe(originalManager)
        expect(await holder()).toBe(originalHolder)
        if (wrapper) expect(await wrappedData()).toEqual(wrapper)
        if (await currentResolver() !== originalResolver) {
          const controller = f.wrappedFor(f.leaf) ? originalHolder : originalManager
          if (!controller || controller === zeroAddress) throw new Error('Cannot restore resolver without the original controller')
          await send(signerFor(controller), f.wrappedFor(f.leaf) ? V1_NAME_WRAPPER : V1_ENS_REGISTRY, encodeFunctionData({ abi: legacyABI, functionName: 'setResolver', args: [node, originalResolver] }))
        }
        expect(await currentResolver()).toBe(originalResolver)
        expect(await resolveRecords(f.leaf, f.records)).toEqual(baseline)
      }
      if (f.c.level === '2LD' && f.c.root_type === 'Unwrapped' && f.c.root_owner !== f.c.root_manager && actor === f.c.root_owner && f.c.root_lifecycle === 'Active') {
        ready = false
        await check('reclaim manager', async () => {
          await page.goto(`${base}/${f.leaf}/ownership`)
          const reclaim = page.getByRole('button', { name: /Reclaim manager$/ })
          await expect(reclaim).toBeVisible({ timeout: 60000 }); ready = true
          try {
            await reclaim.click(); await driveTransactionsToSuccess(page, wallet, [], 90000)
            expect(await registryOwner()).toBe(account(actor).address)
            expect(await holder()).toBe(originalHolder)
            expect(await resolveRecords(f.leaf, f.records)).toEqual(baseline)
            return { detail: 'Actual reclaim changed only the manager; token holder and every record retained. Restored the exact split before the next check.', evidence: { screen: await capture('reclaim') } }
          } finally { await restore() }
        })
        await restore()
      }
      ready = false
      await check('full name transfer', async () => {
        const legacyPermission = permission as Awaited<ReturnType<typeof beforePermissions>> | null
        const right = legacyPermission ? legacyTransferAuthority(legacyPermission, wrapper && f.c.level !== '2LD' ? { wrappedSubnameHolder: wrapper[0] } : undefined) : null
        if (right?.result === 'BLOCKED') throw new Error('Authority unavailable: ' + right.detail)
        await page.goto(`${base}/${f.leaf}/ownership/transfer`)
        const input = page.getByPlaceholder('ENS name or address')
        const denial = page.getByText(legacyTransferDenialTitle).first()
        await expect(input.or(denial).first()).toBeVisible({ timeout: 60000 }); ready = true
        if (actor === 'Disconnected' || right?.result === 'DENIED') {
          await expect(denial).toBeVisible()
          if (actor !== 'Disconnected' && right?.requiresReissue) await expect(page.getByText('This subname has expired', { exact: true })).toBeVisible()
          await expect(page.getByRole('button', { name: 'Transfer name', exact: true })).toHaveCount(0)
          await restore()
          return { detail: right?.requiresReissue ? 'Loaded expired-subname refusal matches the live zero holder. Exact holder, manager, resolver, fuses/expiry and records unchanged. Parent re-issue remains a separate workflow, not a transfer PASS.' : 'Loaded V1 transfer refusal matches contract authority; exact holder, manager, resolver, fuses/expiry and records unchanged.', evidence: { authority: right, screen: await capture('legacy-transfer-denied') } }
        }
        expect(right?.result).toBe('ALLOWED')
        const recipient = account('Unrelated').address
        expect(originalHolder?.toLowerCase()).not.toBe(recipient.toLowerCase())
        try {
          await expect(input).toBeVisible(); await input.fill(recipient)
          const submit = page.getByRole('button', { name: 'Transfer name', exact: true })
          // The recipient field appears before the resolver/role options have
          // loaded. Wait for the settled form before choosing preservation.
          await expect(submit).toBeEnabled({ timeout: 120000 })
          for (const label of [/Detach the resolver/, /Set the ETH address/, /Revoke everyone/]) {
            const toggle = page.getByRole('switch', { name: label })
            if (await toggle.isVisible()) {
              await expect(toggle).toBeEnabled()
              if (await toggle.isChecked()) await toggle.uncheck()
              await expect(toggle).not.toBeChecked()
            }
          }
          await capture('legacy-transfer-preserve-options')
          await submit.click()
          ready = false
          const preparation = await transferReadiness(page)
          ready = preparation.result !== 'pending'
          if (preparation.result !== 'ready') throw new Error(preparation.detail)
          await driveTransactionsToSuccess(page, wallet, [], 120000)
          expect((await holder())?.toLowerCase()).toBe(recipient.toLowerCase())
          if (!f.wrappedFor(f.leaf)) expect((await registryOwner()).toLowerCase()).toBe(recipient.toLowerCase())
          if (wrapper) expect((await wrappedData()).slice(1)).toEqual(wrapper.slice(1))
          expect(await resolveRecords(f.leaf, f.records)).toEqual(baseline)
          return { detail: 'Real Explorer transfer reached the new holder with all records and wrapped fuses/expiry unchanged. Exact original holder and manager restored before the next actor/migration checkpoint.', evidence: { authority: right, recipient, originalHolder, originalManager, screen: await capture('legacy-transferred') } }
        } finally { await restore() }
      })
      // Failed restoration aborts this configuration, so later stages cannot
      // pass from a name whose ownership or records were silently changed.
      await restore()
    }
    if (migrated) {
      ready = false
      await check('grant registry role', async () => {
        const right = (permission as Awaited<ReturnType<typeof afterPermissions>>)?.grantResolverRole
        if (right?.result === 'BLOCKED') throw new Error('Authority unavailable: ' + right.detail)
        const roles = () => publicClient.readContract({ address: state!.registry, abi: modernABI, functionName: 'roles', args: [state!.resource, account('Unrelated').address] })
        const initial = await roles()
        await page.goto(`${base}/${f.leaf}/roles`)
        await expect(page.getByRole('heading', { name: /Roles$/, exact: false }).first()).toBeVisible({ timeout: 60000 })
        if (actor !== 'Disconnected') await expect.poll(async () => {
          const queries = (await roleQueryEvidence(page)).filter((q: any) => q.active && JSON.stringify(q.key).includes('getNameRolesForAccount') && JSON.stringify(q.key).toLowerCase().includes(account(actor).address.toLowerCase()))
          return queries.length >= 2 && queries.every((q: any) => q.status === 'success')
        }, { timeout: 60000 }).toBe(true)
        ready = true
        const add = page.getByRole('button', { name: 'Add user', exact: true })
        if (actor === 'Disconnected' || right?.result === 'DENIED') {
          let exactControl: { visible: boolean; enabled?: boolean } = { visible: false }
          if (await add.isVisible()) {
            await add.click()
            const role = page.locator('#add-ROLE_SET_RESOLVER-manager')
            await expect(role).toBeVisible({ timeout: 30000 })
            exactControl = { visible: true, enabled: await role.isEnabled() }
            const specific = { oracleVersion: 'specific-registry-grant-v1', authority: right, exactControl, roles: await roles(), queries: await roleQueryEvidence(page) }
            writeFileSync(resolve(out, 'grant-specific-control.json'), JSON.stringify(specific, (_key, value) => typeof value === 'bigint' ? String(value) : value, 2))
            expect(exactControl.enabled, 'Explorer must disable this exact Set Resolver grant when the actual contract denies it; Add user can legitimately serve other roles').toBe(false)
          }
          expect(await roles()).toBe(initial)
          return { detail: 'After actual role queries settled, the exact Set Resolver grant is unavailable or disabled. Other delegation controls are not treated as equivalent to this permission. Exact recipient roles unchanged.', evidence: { oracleVersion: 'specific-registry-grant-v1', authority: right, exactControl, screen: await capture('grant-denied') } }
        }
        expect(right?.result).toBe('ALLOWED')
        try {
          await add.click()
          await page.getByLabel('User name or address').fill(account('Unrelated').address)
          await page.locator('#add-ROLE_SET_RESOLVER-manager').click()
          await page.getByRole('button', { name: 'Save', exact: true }).click()
          await driveTransactionsToSuccess(page, wallet, ['tx-grant-roles'], 90000)
          expect(await roles()).toBe(initial | (1n << 24n))
          expect(await resolveRecords(f.leaf, f.records)).toEqual(baseline)
          return { detail: 'Submitted the exact Set Resolver grant through Explorer; read back the exact bitmap and preserved all records. Removed only the newly granted permission during cleanup.', evidence: { initial, granted: await roles(), screen: await capture('grant-submitted') } }
        } finally {
          const added = await roles() & ~initial
          if (added) await send(account(actor), state!.registry, encodeFunctionData({ abi: modernABI, functionName: 'revokeRoles', args: [state!.resource, added, account('Unrelated').address] }))
          expect(await roles()).toBe(initial)
        }
      })
      ready = false
      await check('full name transfer', async () => {
        const right = (permission as Awaited<ReturnType<typeof afterPermissions>>)?.unsafeTransfer
        if (right?.result === 'BLOCKED') throw new Error('Authority unavailable: ' + right.detail)
        const original = (await v2State(f.leaf))!
        const recipient = account('Unrelated').address
        await page.goto(`${base}/${f.leaf}/ownership/transfer`)
        const field = page.getByPlaceholder('ENS name or address')
        const denial = page.getByText(/^(Not authorized|Wallet Not Connected|Permission Denied|Transfer not available|Connect your wallet|Connect wallet)$/).first()
        await expect(field.or(denial).first()).toBeVisible({ timeout: 60000 })
        ready = true
        if (actor === 'Disconnected' || right?.result === 'DENIED') {
          await expect(page.getByRole('button', { name: 'Transfer name', exact: true })).toHaveCount(0)
          expect(await v2State(f.leaf)).toEqual(original)
          return { detail: 'Loaded transfer refusal; original holder, registration and records unchanged.', evidence: { authority: right, screen: await capture('transfer-denied') } }
        }
        expect(right?.result).toBe('ALLOWED')
        try {
          await field.fill(recipient)
          const submit = page.getByRole('button', { name: 'Transfer name', exact: true })
          await expect(submit).toBeEnabled({ timeout: 120000 })
          for (const label of [/Detach the resolver/, /Set the ETH address/, /Revoke everyone/, /Detach the registry/]) {
            const toggle = page.getByRole('switch', { name: label })
            if (await toggle.isVisible()) {
              await expect(toggle).toBeEnabled()
              if (await toggle.isChecked()) await toggle.uncheck()
              await expect(toggle).not.toBeChecked()
            }
          }
          await capture('transfer-preserve-options')
          await submit.click()
          ready = false
          const preparation = await transferReadiness(page)
          ready = preparation.result !== 'pending'
          if (preparation.result !== 'ready') throw new Error(preparation.detail)
          await driveTransactionsToSuccess(page, wallet, [], 90000)
          expect((await v2State(f.leaf))?.latestOwner.toLowerCase()).toBe(recipient.toLowerCase())
          expect(await resolveRecords(f.leaf, f.records)).toEqual(baseline)
          return { detail: 'Actual transfer reached the recipient with exact records retained. The recipient restored the original holder before the next wallet check.', evidence: { screen: await capture('transfer-submitted') } }
        } finally {
          const current = await v2State(f.leaf)
          if (current?.latestOwner.toLowerCase() === recipient.toLowerCase()) await send(account('Unrelated'), current.registry, encodeFunctionData({ abi: modernABI, functionName: 'unsafeTransfer', args: [original.latestOwner, current.tokenId, '0x'] }))
          expect((await v2State(f.leaf))?.latestOwner.toLowerCase()).toBe(original.latestOwner.toLowerCase())
          expect(await resolveRecords(f.leaf, f.records)).toEqual(baseline)
        }
      })
    }
    if (temporaryChild) {
      const remains = migrated ? (await v2State(temporaryChild))?.status === 2
        : await publicClient.readContract({ address: V1_ENS_REGISTRY, abi: legacyABI, functionName: 'owner', args: [namehash(temporaryChild)] }) !== zeroAddress
      expect(remains, 'Namespace fixture cleanup must remove the temporary child before migration or another actor').toBe(false)
    }
  } finally { await closeFixtureContext(context) }
}
