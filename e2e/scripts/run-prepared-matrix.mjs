import { readFileSync, mkdirSync, openSync, writeFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawn, execFileSync } from 'node:child_process'
const e2e = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readyPath = process.env.MATRIX_READY
const output = process.env.MATRIX_OUTPUT
if (!readyPath || !output) throw new Error('Set MATRIX_READY to the prepared ready.json and MATRIX_OUTPUT to a fresh output directory')
const ready = JSON.parse(readFileSync(readyPath, 'utf8'))
const resourcePool = process.env.MATRIX_RESOURCE_POOL ?? resolve(tmpdir(), 'ens-migration-matrix-resource-pool')
let fixtureCapacity = 4
try { fixtureCapacity = JSON.parse(readFileSync(resolve(resourcePool, 'capacity.json'), 'utf8')).maxConcurrentFixtures ?? 4 } catch {}
const testHeapMb = Number(process.env.MATRIX_TEST_HEAP_MB ?? 8192)
if (!Number.isInteger(testHeapMb) || testHeapMb < 1024) throw new Error('MATRIX_TEST_HEAP_MB must be an integer of at least 1024')
// Long wallet matrices retain Playwright assertion metadata until the test ends.
// Bound concurrency separately; do not change app/indexer/chain memory settings.
const testNodeOptions = `${(process.env.NODE_OPTIONS ?? '').replace(/(?:^|\s)--max[-_]old[-_]space[-_]size(?:=|\s+)\d+/g, '').trim()} --max-old-space-size=${testHeapMb}`.trim()
mkdirSync(output, { recursive: true })
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const hashes = {}
const visit = path => {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const file = resolve(path, entry.name)
    if (entry.isDirectory()) visit(file)
    else if (/\.(ts|json)$/.test(entry.name)) hashes[file.slice(e2e.length + 1)] = sha256(file)
  }
}
visit(resolve(e2e, 'projects/migration-matrix'))
visit(resolve(e2e, 'helpers'))
visit(resolve(e2e, 'fixtures'))
hashes['projects/replacement/strict-reporter.ts'] = sha256(resolve(e2e, 'projects/replacement/strict-reporter.ts'))
let forkRuntime
try {
  const response = await fetch(ready.env.ANVIL_RPC_URL, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'anvil_nodeInfo', params: [] }),
    signal: AbortSignal.timeout(5000),
  })
  forkRuntime = await response.json()
  if (forkRuntime.result?.forkConfig?.forkUrl) {
    const upstream = new URL(forkRuntime.result.forkConfig.forkUrl)
    forkRuntime.result.forkConfig.forkUrl = `${upstream.protocol}//${upstream.host}${upstream.pathname === '/' ? '/' : '/<redacted-path>'}`
  }
} catch (error) { forkRuntime = { error: String(error) } }
writeFileSync(resolve(output, 'run-context.json'), JSON.stringify({
  startedAt: new Date().toISOString(), readyPath,
  candidateCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: e2e, encoding: 'utf8' }).trim(),
  forkRuntime,
  urls: Object.fromEntries(['ANVIL_RPC_URL', 'MANAGER_APP_URL', 'PORTAL_APP_URL', 'E2E_BIGNAME_URL'].map(k => [k, ready.env[k]])),
  selectedConfigurations: process.env.MATRIX_IDS?.split(',') ?? 'all in selected spec',
  primaryWorkflows: process.env.MATRIX_PRIMARY_ACTIONS === '1',
  realIndexerDateWorkflows: process.env.MATRIX_DATE_ACTIONS === '1',
  legacyTransferWorkflows: process.env.MATRIX_LEGACY_TRANSFER_ACTIONS === '1',
  namespaceWorkflows: process.env.MATRIX_NAMESPACE_ACTIONS === '1',
  afterActualRefusal: process.env.MATRIX_AFTER_REFUSAL === '1',
  selectedActors: process.env.MATRIX_UI_ACTORS?.split(',') ?? 'all',
  resourceAdmission: { pool: resourcePool, maximumConcurrentFixtures: fixtureCapacity, queueWait: 'Before fixture setup; not an executed app check' },
  testProcessHeapMb: testHeapMb,
  testArguments: process.argv.slice(2), sourceHashes: hashes,
  excluded: ['DNS', 'legacy stateful suites', ...(process.env.MATRIX_MAX_LEVEL === '3' ? ['All 4LD fixtures and 4LD creation operations'] : [])],
  discovery: 'Seeded inventory unless a test explicitly uses the real indexer',
  staticModuleCache: process.env.MATRIX_CACHE_APP_MODULES === '1' ? 'Only fetched local JS/CSS, keyed by exact Vite URL/version. HTML, APIs, wallets, RPC, permissions and record values remain live.' : 'Disabled',
  staticModuleCacheTransport: 'Bounded shared APIResponse handles; no repeated module-body copies in Playwright step metadata',
  rpcIsolation: 'Public Sepolia fallbacks route to the same local fork; contract responses are not stubbed',
}, null, 2))
const log = openSync(resolve(output, 'run.log'), 'a')
// The prepared checkout already has its locked dependencies. Calling the local
// CLI avoids package-manager auto-install races between independent workers.
const playwrightCli = resolve(e2e, 'node_modules/@playwright/test/cli.js')
const child = spawn(process.execPath, [playwrightCli, 'test', '-c', 'projects/migration-matrix/playwright.config.ts', ...process.argv.slice(2)], {
  cwd: e2e, env: { ...process.env, ...ready.env, NODE_OPTIONS: testNodeOptions, MATRIX_LOCAL_RPC_ONLY: '1', REPLACEMENT_RESULTS: output }, stdio: ['ignore', log, log],
})
child.on('exit', (code) => { console.log(`Matrix runner exited ${code}; evidence: ${output}`); process.exitCode = code ?? 1 })
process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
