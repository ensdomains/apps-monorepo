import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { retentionAssertions } from '../projects/migration-matrix/retention-oracle.js'

const directory = process.argv[2]
if (!directory) throw new Error('Supply the matrix execution directory')
const observations = []
for (const run of readdirSync(directory, { withFileTypes: true }).filter(
  (d) => d.isDirectory() && d.name.startsWith('matrix-'),
)) {
  let files: string[]
  try {
    files = readdirSync(resolve(directory, run.name, 'observations'))
  } catch {
    continue
  }
  for (const name of files.filter((n) => /^CFG-.*\.json$/.test(n))) {
    const file = `${run.name}/observations/${name}`
    let raw: string, data: any
    try {
      raw = readFileSync(resolve(directory, file), 'utf8')
      data = JSON.parse(raw)
    } catch {
      continue
    }
    if (!data.completedAt || data.harnessInvalid) continue
    observations.push({
      file,
      config_id: data.configuration.config_id,
      sourceHash: createHash('sha256').update(raw).digest('hex'),
      checks: retentionAssertions(data.configuration, data),
    })
  }
}
const output = {
  generatedAt: new Date().toISOString(),
  layer:
    'Executable assertion analysis of saved actual chain reads; not a fresh app run and not indexed-history proof.',
  oracleHash: createHash('sha256')
    .update(
      readFileSync(
        new URL(
          '../projects/migration-matrix/retention-oracle.ts',
          import.meta.url,
        ),
      ),
    )
    .digest('hex'),
  observations,
}
writeFileSync(
  resolve(directory, 'retention-assertions.json'),
  JSON.stringify(output, null, 2),
)
const failures = observations.flatMap((o) =>
  o.checks
    .filter((c) => c.result === 'FAIL')
    .map((c) => ({ file: o.file, ...c })),
)
console.log(
  JSON.stringify({
    observations: observations.length,
    checks: observations.reduce((n, o) => n + o.checks.length, 0),
    failures,
  }),
)
if (failures.length) process.exitCode = 1
