import { readFileSync, writeFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { publicClient } from '../../helpers/anvil-client.js'
import { resolveRecords, resolverFor } from '../../helpers/resolve-records.js'
import { v2State } from './probes.js'
import { chainActivity } from './record-evidence.js'

const fixtures = JSON.parse(readFileSync(process.env.APPROVAL_WALLET_INPUT!, 'utf8'))
const fixture = fixtures.find((f: any) => f.id === process.env.APPROVAL_WALLET_ID)
assert(fixture, 'Known independently seeded wallet case')
const errors: string[] = []
const after = []
for (const name of fixture.names) {
  const state = await v2State(name)
  const records = await resolveRecords(name, fixture.recordBundles[name])
  const resolver = await resolverFor(name)
  after.push({ name, state, resolver, records })
  if (process.env.EXPECT_MIGRATED === '1' && state?.status !== 2) errors.push(`${name}: not registered in V2`)
  if (process.env.EXPECT_MIGRATED === '0' && state?.status === 2) errors.push(`${name}: unexpectedly migrated`)
  if (state?.status === 2 && state.latestOwner.toLowerCase() !== '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266') errors.push(`${name}: wrong owner`)
  for (const record of records) if (record.got !== record.want) errors.push(`${name} ${record.what}: ${record.got} != ${record.want}`)
}
const receipts = []
for (const hash of (process.env.APPROVAL_WALLET_HASHES ?? '').split(',').filter(Boolean)) {
  const receipt = await publicClient.getTransactionReceipt({ hash: hash as `0x${string}` })
  const transaction = await publicClient.getTransaction({ hash: hash as `0x${string}` })
  receipts.push({ receipt, transaction })
}
const activity = await chainActivity(BigInt(fixture.beforeActivity.fromBlock))
const evidence = { id: fixture.id, checkedAt: new Date().toISOString(), expectedMigrated: process.env.EXPECT_MIGRATED === '1', after, receipts, activity, errors, status: errors.length ? 'FAIL' : 'PASS', scope: 'Actual on-chain owner, registration, current name resolution, raw logs and receipts; wallet UI and indexed history are reported separately.' }
writeFileSync(process.env.APPROVAL_WALLET_OUTPUT!, JSON.stringify(evidence, (_k,v) => typeof v === 'bigint' ? String(v) : v, 2))
console.log(JSON.stringify({ id: fixture.id, status: evidence.status, errors, names: after.map(n=>({ name:n.name, state:n.state, records:n.records.length })) }, (_k,v)=>typeof v==='bigint'?String(v):v))
assert.equal(errors.length, 0, errors.join('\n'))
