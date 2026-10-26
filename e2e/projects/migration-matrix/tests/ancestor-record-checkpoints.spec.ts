import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { BaseError, ContractFunctionRevertedError, decodeFunctionResult, encodeFunctionData, namehash, parseAbi, zeroAddress } from 'viem'
import { test, expect } from '../matrix-fixture.js'
import { account, migrateLockedAncestor, seedConfiguration, type Configuration } from '../seed.js'
import { requiresIndependentGraceMigration } from '../migration-policy.js'
import { v2State } from '../probes.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { dnsEncode } from '../../../helpers/resolve-records.js'
import { recordChecks, RESOLVER_ABI } from '../../../fixtures/v1-records.js'
import { V1_NAME_WRAPPER, V1_PUBLIC_RESOLVER } from '../../../fixtures/makeV1Name.js'

const configurations: Configuration[] = JSON.parse(readFileSync(new URL('../configurations.json', import.meta.url), 'utf8'))
const selected = process.env.MATRIX_IDS?.split(',')
const universal = ensL1Contracts[supportedL1Chains.sepolia].ensUniversalResolver.address
const universalABI = parseAbi(['function resolve(bytes name,bytes data) view returns(bytes,address)', 'error ResolverNotFound(bytes name)'])
const wrapperABI = parseAbi(['function getData(uint256 id) view returns(address owner,uint32 fuses,uint64 expiry)'])
const registryABI = parseAbi(['function getSubregistry(string label) view returns(address)'])
const infrastructure = (error: unknown) => /missing bytecode for code hash|historical state|HTTP request failed|fetch failed|ECONNREFUSED|ETIMEDOUT|timed out|socket hang up/i.test(String(error))

for (const c of configurations.filter(c => requiresIndependentGraceMigration(c) && (!selected || selected.includes(c.config_id)))) {
  test(`live ancestor record checkpoints ${c.config_id}`, async ({}, info) => {
    info.setTimeout(600_000)
    const output = resolve(process.env.REPLACEMENT_RESULTS!, 'supplemental')
    mkdirSync(output, { recursive: true })
    const evidence: Record<string, any> = {
      id: `ANCESTOR-RECORDS-${c.config_id}`, configurations: [c.config_id], configuration: c,
      startedAt: new Date().toISOString(), phase: 'fixture', recordProfile: process.env.MATRIX_RECORD_PROFILE,
      scope: 'Fresh independent fixture. Read each checkpoint immediately at the current chain head, before and after each protocol ancestor migration and after entering grace. This does not execute the subject app migration, permission workflows or indexed history.',
      discovery: 'No app discovery used; actual contract records, receipts, ownership and lifecycle only.',
      checks: {}, checkpoints: [], ancestorReceipts: [],
    }
    const save = () => writeFileSync(resolve(output, `ancestor-records-${c.config_id}.json`), JSON.stringify(evidence, (_k, value) => typeof value === 'bigint' ? String(value) : value, 2))
    const check = (label: string, condition: boolean, blocked = false) => {
      const result = blocked ? 'BLOCKED' : condition ? 'PASS' : 'FAIL'
      evidence.checks[label] = { result }
      expect.soft(result, label).toBe('PASS')
    }
    try {
      expect(process.env.MATRIX_RECORD_PROFILE).toBe('extended')
      const f = await seedConfiguration(c)
      evidence.names = f.names; evidence.subject = f.leaf
      const root = await v2State(f.root)
      evidence.rootV2Expiry = root.expiry
      const capture = async (label: string, grace: boolean, receipt?: Awaited<ReturnType<typeof migrateLockedAncestor>>) => {
        evidence.phase = label; save()
        const head = await publicClient.getBlockNumber({ cacheTime: 0 })
        const block = await publicClient.getBlock({ blockNumber: head })
        const childWrapper = await publicClient.readContract({ address: V1_NAME_WRAPPER, abi: wrapperABI, functionName: 'getData', args: [BigInt(namehash(f.leaf))] })
        const visibleRootSubregistry = await publicClient.readContract({ address: root.registry, abi: registryABI, functionName: 'getSubregistry', args: [root.label] })
        const point: Record<string, any> = { label, blockNumber: head, blockHash: block.hash, timestamp: block.timestamp, childWrapper, visibleRootSubregistry, names: [] }
        for (const name of f.names) {
          const reads: Record<string, any>[] = []
          for (const item of recordChecks(namehash(name), f.recordsFor(name))) {
            const call = { abi: RESOLVER_ABI, functionName: item.functionName, args: item.args } as never
            const data = encodeFunctionData(call)
            const resolvedRead = async () => {
              try {
                const [raw, resolver] = await publicClient.readContract({ address: universal, abi: universalABI, functionName: 'resolve', args: [dnsEncode(name), data] })
                return { got: item.normalise(decodeFunctionResult({ ...(call as object), data: raw } as never)), raw, resolver }
              } catch (error) {
                const reverted = error instanceof BaseError ? error.walk(cause => cause instanceof ContractFunctionRevertedError) : undefined
                return { error: String(error), blocked: infrastructure(error), errorName: reverted instanceof ContractFunctionRevertedError ? reverted.data?.errorName : undefined }
              }
            }
            const sourceRead = async () => {
              try {
                const result = await publicClient.call({ to: V1_PUBLIC_RESOLVER, data })
                return { got: item.normalise(decodeFunctionResult({ ...(call as object), data: result.data } as never)), raw: result.data }
              } catch (error) { return { error: String(error), blocked: infrastructure(error) } }
            }
            const [resolved, stored] = await Promise.all([resolvedRead(), sourceRead()])
            reads.push({ what: item.what, want: item.want, resolved, stored })
          }
          point.names.push({ name, reads, publicMatches: reads.filter(r => r.resolved.got === r.want).length, sourceMatches: reads.filter(r => r.stored.got === r.want).length })
        }
        evidence.checkpoints.push(point)
        const allReads = point.names.flatMap((n: any) => n.reads)
        const sourceBlocked = allReads.some((r: any) => r.stored.blocked)
        const publicBlocked = allReads.some((r: any) => r.resolved.blocked)
        const baseline = evidence.checkpoints[0]
        check(`${label}: source values match all 18 seeded records per name`, point.names.every((n: any) => n.reads.length === 18 && n.sourceMatches === 18), sourceBlocked)
        check(`${label}: source bytes unchanged`, point.names.every((n: any, i: number) => n.reads.every((r: any, j: number) => Boolean(r.stored.raw) && r.stored.raw === baseline.names[i].reads[j].stored.raw)), sourceBlocked)
        check(`${label}: ${grace ? 'public routing reports ResolverNotFound in ancestor grace' : 'all public records resolve exactly'}`, grace ? allReads.every((r: any) => r.resolved.errorName === 'ResolverNotFound') : point.names.every((n: any) => n.publicMatches === 18), publicBlocked)
        check(`${label}: active child retains its holder`, childWrapper[0] !== zeroAddress && childWrapper[0] === baseline.childWrapper[0] && block.timestamp < childWrapper[2])
        check(`${label}: ancestor grace boundary`, grace ? block.timestamp === root.expiry + 1n : block.timestamp < root.expiry)
        check(`${label}: reads share the captured live head`, await publicClient.getBlockNumber({ cacheTime: 0 }) === head)
        if (evidence.ancestorReceipts.length) check(`${label}: migrated ancestor visibility`, grace ? visibleRootSubregistry === zeroAddress : visibleRootSubregistry !== zeroAddress)
        if (receipt) check(`${label}: exact successful migration receipt`, receipt.status === 'success' && receipt.blockHash === block.hash && receipt.blockNumber === head)
        save()
      }
      await capture('Before any ancestor migration', false)
      for (const name of f.names.slice(0, -1)) {
        const owner = name === f.root ? c.root_owner : c.parent_controller
        const receipt = await migrateLockedAncestor(name, account(owner))
        evidence.ancestorReceipts.push(receipt)
        await capture(`After ${name.split('.').length}LD ancestor migration, before grace`, false, receipt)
      }
      await f.advance()
      await capture('After V2 ancestor enters grace', true)
      evidence.phase = 'completed live record checkpoints'
    } catch (error) {
      evidence.error = String(error)
      evidence.harnessInvalid = infrastructure(error)
      evidence.checks['Complete reliable checkpoint sequence'] = { result: evidence.harnessInvalid ? 'BLOCKED' : 'FAIL', detail: String(error) }
      throw error
    } finally {
      const results = Object.values(evidence.checks).map((x: any) => x.result)
      evidence.result = results.includes('FAIL') ? 'FAIL' : results.includes('BLOCKED') || !results.length ? 'BLOCKED' : 'PASS'
      if (evidence.result === 'BLOCKED') evidence.harnessInvalid = true
      evidence.completedAt = new Date().toISOString(); evidence.assertionErrors = info.errors.map(error => error.message); save()
    }
  })
}
