import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { namehash } from 'viem'
import { RESOLVER_ABI, recordChecks } from '../fixtures/v1-records.js'
import { publicClient } from '../helpers/anvil-client.js'
import { readV2NameStatus } from '../helpers/migration-assertions.js'
import { resolveRecords, resolverFor } from '../helpers/resolve-records.js'

const dir = process.env.RECORD_PRESERVATION_EVIDENCE!
const result: any[] = []
for (const file of readdirSync(dir)
  .filter((f) => /^RP\d\d\.json$/.test(f))
  .sort()) {
  const audit = JSON.parse(readFileSync(join(dir, file), 'utf8'))
  for (const n of audit.names) {
    const reads = await resolveRecords(n.name, n.records)
    const status = await readV2NameStatus(n.name).catch(
      (e) => 'ERROR: ' + String(e).split('\n')[0],
    )
    const source = []
    for (const c of recordChecks(namehash(n.name), n.records)) {
      try {
        const v = await publicClient.readContract({
          address: n.beforeResolver,
          abi: RESOLVER_ABI,
          functionName: c.functionName,
          args: c.args,
        } as never)
        source.push({ what: c.what, got: c.normalise(v), want: c.want })
      } catch (e) {
        source.push({ what: c.what, error: String(e).split('\n')[0] })
      }
    }
    result.push({
      id: audit.id,
      name: n.name,
      depth: n.depth,
      before: n.before,
      beforeBlock: n.beforeBlock,
      after: reads,
      afterBlock: String(await publicClient.getBlockNumber({ cacheTime: 0 })),
      v2Status: status,
      resolver: await resolverFor(n.name).catch(() => null),
      oldResolver: n.beforeResolver,
      oldResolverReadback: source,
      migration: audit.migration,
      result:
        status === 2
          ? reads.every((r) => r.got === r.want)
            ? 'PASS'
            : 'FAIL'
          : 'NOT MIGRATED',
      resolutionResult: reads.every((r) => r.got === r.want) ? 'PASS' : 'FAIL',
    })
    console.log(
      audit.id,
      n.name,
      status,
      reads
        .filter((r) => r.got !== r.want)
        .map((r) => r.what)
        .join(','),
    )
  }
}
writeFileSync(
  join(dir, 'independent-readback.json'),
  JSON.stringify(result, null, 2),
)
