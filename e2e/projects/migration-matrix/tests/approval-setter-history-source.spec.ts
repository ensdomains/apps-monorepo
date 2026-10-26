import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect } from '@playwright/test'
import { keccak256, labelhash, stringToHex } from 'viem'
import { V1_BASE_REGISTRAR } from '../../../fixtures/makeV1Name.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { chainActivity } from '../record-evidence.js'
import { v2State } from '../probes.js'

test('capture original retained-manager history from the preserved archive', async () => {
  const source = process.env.APPROVAL_CAMPAIGN!
  const saved = JSON.parse(readFileSync(resolve(source, 'runs/setters/supplemental/retained-manager.json'), 'utf8'))
  const beforeRun = JSON.parse(readFileSync(resolve(source, 'runs/setters/run-context.json'), 'utf8'))
  const nextRun = JSON.parse(readFileSync(resolve(source, 'runs/trees/run-context.json'), 'utf8'))
  const from = BigInt(beforeRun.forkRuntime.result.currentBlockNumber)
  const to = BigInt(nextRun.forkRuntime.result.currentBlockNumber) - 1n
  const afterActivity = await chainActivity(from, to)
  const approval = keccak256(stringToHex('Approval(address,address,uint256)'))
  const out = resolve(process.env.REPLACEMENT_RESULTS!, 'observations')
  mkdirSync(out, { recursive: true })
  for (const [index, name] of [saved.name, saved.otherName].entries()) {
    const token = BigInt(labelhash(name.split('.')[0]))
    const grant = afterActivity.events.find(log => log.address.toLowerCase() === V1_BASE_REGISTRAR.toLowerCase() && log.topics[0] === approval && log.topics.length === 4 && BigInt(log.topics[3]!) === token && BigInt(log.topics[2]!) !== 0n)
    expect(grant, 'Exact fresh-name approval must identify the pre-migration checkpoint').toBeTruthy()
    const receipt = await publicClient.getTransactionReceipt({ hash: grant!.transactionHash })
    expect(receipt.status).toBe('success')
    expect(receipt.blockHash).toBe(grant!.blockHash)
    const beforeActivity = await chainActivity(from, grant!.blockNumber - 1n)
    const afterState = await v2State(name)
    expect(afterState?.status).toBe(2)
    const evidence = { configuration: { config_id: `APR08-${index}` }, subject: name, names: [name], beforeActivity, afterActivity, afterState, afterRoot: afterState, afterTreeStates: [{ name, state: afterState }], migrationOutcome: 'success', completedAt: saved.completedAt, scope: 'Read-only reconstruction from the same preserved chain. Original run bounds and the exact per-token approval identify the baseline before migration; no test fixture or event was recreated.', originalSource: resolve(source, 'runs/setters/supplemental/retained-manager.json') }
    writeFileSync(resolve(out, `CFG-APR08-${index}.json`), JSON.stringify(evidence, (_key, value) => typeof value === 'bigint' ? String(value) : value, 2))
  }
})
