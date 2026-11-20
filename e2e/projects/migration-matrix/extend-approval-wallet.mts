import { readFileSync, writeFileSync } from 'node:fs'
import { publicClient } from '../../helpers/anvil-client.js'
import { resolveRecords } from '../../helpers/resolve-records.js'
import { v2State } from './probes.js'
import { chainActivity } from './record-evidence.js'
import { type Configuration, seedConfiguration } from './seed.js'

const configs: Configuration[] = JSON.parse(
  readFileSync(new URL('./configurations.json', import.meta.url), 'utf8'),
)
const path = process.env.APPROVAL_WALLET_OUTPUT!
const evidence = JSON.parse(readFileSync(path, 'utf8'))
const existing = evidence.find((e: any) => e.id === 'APR-35')
const f = await seedConfiguration({
  ...configs.find((c) => c.config_id === 'CFG-0001')!,
  config_id: 'apr-35-second',
})
const before = await Promise.all(
  f.names.map(async (name) => ({
    name,
    state: await v2State(name),
    records: await resolveRecords(name, f.recordsFor(name)),
  })),
)
for (const n of before)
  for (const r of n.records)
    if (r.got !== r.want) throw Error(`${n.name}: seed failed ${r.what}`)
existing.roots = [existing.subject, f.root]
existing.names.push(...f.names)
existing.before.push(...before)
existing.metadata.push(...(await f.metadata()))
Object.assign(
  existing.recordBundles,
  Object.fromEntries(f.names.map((n) => [n, f.recordsFor(n)])),
)
existing.beforeActivity = await chainActivity(
  BigInt(existing.beforeActivity.fromBlock),
)
existing.fixtureNote =
  'Second root ensures multiple approval calls can exercise actual EIP-5792 batching. Wallet-installed EIP-7702 delegation was preserved; capabilities are not stubbed.'
await publicClient.request({
  method: 'anvil_mine' as never,
  params: ['0x40', '0x1'] as never,
})
writeFileSync(
  path,
  JSON.stringify(
    evidence,
    (_k, v) => (typeof v === 'bigint' ? String(v) : v),
    2,
  ),
)
console.log(existing.names)
