import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(
  readFileSync(
    resolve(cwd, 'projects/replacement/coverage-manifest.json'),
    'utf8',
  ),
)
const listing = JSON.parse(
  execFileSync(
    'pnpm',
    [
      'exec',
      'playwright',
      'test',
      '-c',
      'projects/replacement/playwright.config.ts',
      '--list',
      '--reporter=json',
    ],
    { cwd, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  ),
)
const specs = []
const visit = (s) => {
  for (const spec of s.specs ?? []) specs.push(spec)
  for (const child of s.suites ?? []) visit(child)
}
for (const suite of listing.suites ?? []) visit(suite)
const mappings = manifest.legacy.map((c) => ({
  ...c,
  tests: specs
    .filter((s) => new RegExp(`\\b${c.id}\\b`).test(s.title))
    .map((s) => ({ title: s.title, file: s.file, line: s.line })),
}))
const errors = mappings
  .filter((c) => !c.tests.length)
  .map((c) => `Missing ${c.id}`)
for (const c of manifest.notExecuted.filter((c) =>
  /DNS|stateful/i.test(c.reason),
))
  if (specs.some((s) => new RegExp(`\\b${c.id}\\b`).test(s.title)))
    errors.push(`Excluded case collected: ${c.id}`)
for (const title of manifest.recordPreservation)
  if (!specs.some((s) => s.title === title))
    errors.push(`Missing record test: ${title}`)
for (let row = 1; row <= 21; row++)
  for (const action of manifest.afterMigration.checks) {
    const title = `AM${String(row).padStart(2, '0')} ${action} `
    if (!specs.some((s) => s.title.startsWith(title)))
      errors.push(`Missing ${title}`)
  }
for (const action of ['send', 'edit', 'roles', 'sync', 'dates'])
  if (!specs.some((s) => s.title.startsWith(`AM10 ${action} gas-recovery `)))
    errors.push(`Missing AM10 ${action} gas recovery`)
const result = {
  testCount: specs.reduce((n, s) => n + s.tests.length, 0),
  legacyCount: mappings.length,
  errors,
  mappings,
}
mkdirSync(resolve(cwd, 'test-results/replacement'), { recursive: true })
writeFileSync(
  resolve(cwd, 'test-results/replacement/coverage.json'),
  JSON.stringify(result, null, 2),
)
console.log(
  `${result.testCount} tests collected; ${result.legacyCount} executed legacy cases mapped; ${errors.length} coverage errors`,
)
if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
}
