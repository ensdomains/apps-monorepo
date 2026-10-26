import { readFileSync, writeFileSync } from 'node:fs'
import { seedConfiguration, type Configuration } from './seed.js'
import { publicClient } from '../../helpers/anvil-client.js'
import { resolveRecords } from '../../helpers/resolve-records.js'
import { v2State } from './probes.js'
import { chainActivity } from './record-evidence.js'

const configs: Configuration[] = JSON.parse(readFileSync(new URL('./configurations.json', import.meta.url), 'utf8'))
const evidence = []
for (const [id, key] of [['APR-34','CFG-0001'],['APR-35','CFG-0011']]) {
  const f = await seedConfiguration({ ...configs.find(c => c.config_id === key)!, config_id: id.toLowerCase() })
  const before = await Promise.all(f.names.map(async name => ({ name, state: await v2State(name), records: await resolveRecords(name, f.recordsFor(name)) })))
  for (const n of before) for (const r of n.records) if (r.got !== r.want) throw Error(`${n.name}: seed failed ${r.what}`)
  evidence.push({ id, subject: f.root, names: f.names, before, metadata: await f.metadata(), historySeed: f.historySeed, beforeActivity: await chainActivity(f.startBlock), recordBundles: Object.fromEntries(f.names.map(n => [n, f.recordsFor(n)])) })
}
await publicClient.request({ method: 'anvil_mine' as never, params: ['0x40','0x1'] as never })
writeFileSync(process.env.APPROVAL_WALLET_OUTPUT!, JSON.stringify(evidence, (_k,v) => typeof v === 'bigint' ? String(v) : v, 2))
console.log(evidence.map(e => ({ id: e.id, names: e.names })))
