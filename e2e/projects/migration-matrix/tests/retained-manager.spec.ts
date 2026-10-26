import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { decodeFunctionResult, encodeFunctionData, namehash, parseAbi, stringToHex } from 'viem'
import { test, expect, connectHeadless, overrideManagerFeatureFlags } from '../matrix-fixture.js'
import { dismissBackendAuthModal } from '../../../helpers/manager-auth.js'
import { mockV1Names } from '../../../helpers/record-audit-inventory.js'
import { openMigrationFlow, rootRow, upgradeAndSettle } from '../../../helpers/migration-flow.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { dnsEncode, resolveRecords } from '../../../helpers/resolve-records.js'
import { account, seedConfiguration, send, type Configuration } from '../seed.js'
import { afterPermissions, v2State } from '../probes.js'

const configs: Configuration[] = JSON.parse(readFileSync(new URL('../configurations.json', import.meta.url), 'utf8'))
const abi = parseAbi([
  'function setText(bytes name,string key,string value)',
  'function setAddress(bytes name,uint256 coinType,bytes value)',
  'function setContenthash(bytes name,bytes value)',
  'function setABI(bytes name,uint256 contentType,bytes value)',
  'function setData(bytes name,string key,bytes value)',
  'function setName(bytes name,string value)',
  'function setInterface(bytes name,bytes4 id,address value)',
  'function resolve(bytes name,bytes data) view returns(bytes)',
  'function grantRootRoles(uint256 roleBitmap,address user) returns(bool)',
  'function linkToRecord(bytes name,uint256 recordId)',
  'function text(bytes32 node,string key) view returns(string)',
  'function addr(bytes32 node,uint256 coinType) view returns(bytes)',
  'function contenthash(bytes32 node) view returns(bytes)',
  'function ABI(bytes32 node,uint256 contentTypes) view returns(uint256,bytes)',
  'function data(bytes32 node,string key) view returns(bytes)',
  'function name(bytes32 node) view returns(string)',
  'function interfaceImplementer(bytes32 node,bytes4 id) view returns(address)',
])

test('retained manager: all seven setters commit, and privileges remain isolated', async ({ page, wallet }, info) => {
  info.setTimeout(600000)
  const output = resolve(process.env.REPLACEMENT_RESULTS!, 'supplemental')
  mkdirSync(output, { recursive: true })
  const evidence: Record<string, unknown> = { id: 'ROLE-SEVEN', configurations: ['CFG-0003'], checks: {}, discovery: 'Seeded inventory; all role reads, writes and resolution are real fork calls.' }
  const checks = evidence.checks as Record<string, unknown>
  const save = () => writeFileSync(resolve(output, 'retained-manager.json'), JSON.stringify(evidence, (_k,v) => typeof v === 'bigint' ? String(v) : v, 2))
  const check = async (key: string, run: () => Promise<unknown>) => {
    try { checks[key] = { result: 'PASS', evidence: await run() } }
    catch (error) { checks[key] = { result: 'FAIL', error: String(error) }; expect.soft(false, `${key}: ${error}`).toBe(true) }
    save()
  }
  try {
    const c = configs.find(c => c.config_id === 'CFG-0003')!
    const first = await seedConfiguration(c)
    evidence.name = first.root
    evidence.before = await resolveRecords(first.root, first.records)
    expect((evidence.before as Awaited<ReturnType<typeof resolveRecords>>).every(r => r.got === r.want)).toBe(true)
    await page.clock.install({ time: new Date(Number((await publicClient.getBlock()).timestamp) * 1000) })
    await overrideManagerFeatureFlags(page, { migration: true, 'profile-view-new': true, 'migration-subname-recreation': true })
    await mockV1Names(page, await first.metadata())
    await connectHeadless(page, wallet)
    await dismissBackendAuthModal(page, { timeout: 3000 })
    await openMigrationFlow(page)
    await expect(rootRow(page, first.root)).toBeChecked({ timeout: 60000 })
    await page.getByRole('checkbox', { name: /Keep .* as a manager/ }).check()
    expect(await upgradeAndSettle(page, wallet)).toBe('success')
    evidence.after = await resolveRecords(first.root, first.records)
    expect((evidence.after as Awaited<ReturnType<typeof resolveRecords>>).every(r => r.got === r.want)).toBe(true)
    const post = await afterPermissions(first, 'W2')
    expect(post?.resolverRoles).toBe(0x1111111n)
    expect(post?.registryRoles).toBe(1n << 24n)
    evidence.roles = post
    const resolver = post!.resolver
    const encoded = dnsEncode(first.root), node = namehash(first.root)
    const variants = [
      { setter: 'setText', setterArgs: [encoded, 'description', 'retained manager text ✓'], getter: 'text', getterArgs: [node, 'description'], want: 'retained manager text ✓' },
      { setter: 'setAddress', setterArgs: [encoded, 60n, account('W3').address], getter: 'addr', getterArgs: [node, 60n], want: account('W3').address.toLowerCase() },
      { setter: 'setContenthash', setterArgs: [encoded, '0xe30101701220b4b78f5e39d72872c0b0fe1d684c185c0ee3c4d783abdd452c8a9271def0e669'], getter: 'contenthash', getterArgs: [node], want: '0xe30101701220b4b78f5e39d72872c0b0fe1d684c185c0ee3c4d783abdd452c8a9271def0e669' },
      { setter: 'setABI', setterArgs: [encoded, 1n, stringToHex('[{"type":"function","name":"changed","inputs":[],"outputs":[],"stateMutability":"view"}]')], getter: 'ABI', getterArgs: [node, 1n], want: [1n, stringToHex('[{"type":"function","name":"changed","inputs":[],"outputs":[],"stateMutability":"view"}]')] },
      { setter: 'setData', setterArgs: [encoded, 'matrix.retention', '0x0102abcd'], getter: 'data', getterArgs: [node, 'matrix.retention'], want: '0x0102abcd' },
      { setter: 'setName', setterArgs: [encoded, 'retained-manager.eth'], getter: 'name', getterArgs: [node], want: 'retained-manager.eth' },
      { setter: 'setInterface', setterArgs: [encoded, '0x12345678', account('W3').address], getter: 'interfaceImplementer', getterArgs: [node, '0x12345678'], want: account('W3').address.toLowerCase() },
    ]
    for (const v of variants) await check(v.setter, async () => {
      const calldata = encodeFunctionData({ abi, functionName: v.setter, args: v.setterArgs } as never)
      const receipt = await send(account('W2'), resolver, calldata)
      const read = { abi, functionName: v.getter, args: v.getterArgs } as never
      const raw = await publicClient.readContract({ address: resolver, abi, functionName: 'resolve', args: [encoded, encodeFunctionData(read)] })
      const decoded = decodeFunctionResult({ ...(read as object), data: raw } as never)
      expect(typeof decoded === 'string' && decoded.startsWith('0x') ? decoded.toLowerCase() : decoded).toEqual(v.want)
      return { transactionHash: receipt.transactionHash, raw, decoded }
    })
    for (const v of [
      { key: 'cannot grant root roles', fn: 'grantRootRoles', args: [0x1111111n, account('Unrelated').address] },
      { key: 'cannot relink records', fn: 'linkToRecord', args: [encoded, 0n] },
    ]) await check(v.key, async () => {
      await expect(publicClient.call({ account: account('W2').address, to: resolver, data: encodeFunctionData({ abi, functionName: v.fn, args: v.args } as never) })).rejects.toThrow(/revert/i)
      return 'Actual EVM call denied; no admin or link grant added.'
    })
    const other = await seedConfiguration({ ...c, root_manager: 'W3', name_manager: 'W3' })
    evidence.otherName = other.root
    await mockV1Names(page, await other.metadata())
    await openMigrationFlow(page)
    await expect(rootRow(page, other.root)).toBeChecked({ timeout: 60000 })
    await page.getByRole('checkbox', { name: /Keep .* as a manager/ }).check()
    expect(await upgradeAndSettle(page, wallet)).toBe('success')
    await check('no cross-name authority', async () => {
      const otherPost = await afterPermissions(other, 'W2')
      expect(otherPost?.resolver).not.toBe(resolver)
      expect(otherPost?.resolverRoles).toBe(0n)
      expect(otherPost?.records.result).toBe('DENIED')
      const state = await v2State(other.root)
      expect(state?.status).toBe(2)
      return otherPost
    })
  } finally {
    evidence.completedAt = new Date().toISOString()
    evidence.assertionErrors = info.errors.map(e => e.message)
    evidence.finalUI = await page.locator('body').innerText().catch(() => '')
    save()
    await info.attach('retained manager evidence', { path: resolve(output, 'retained-manager.json'), contentType: 'application/json' })
  }
})
