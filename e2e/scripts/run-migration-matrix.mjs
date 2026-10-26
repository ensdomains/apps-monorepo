#!/usr/bin/env node
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const option = (name, fallback) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const layer = option('layer', 'core')
const specs = {
  core: '/configurations.spec.ts$',
  ui: '/full-configurations.spec.ts$',
  'ui-records': '/full-configurations.spec.ts$',
  primary: '/full-configurations.spec.ts$',
  dates: '/full-configurations.spec.ts$',
  namespace: '/full-configurations.spec.ts$',
  'namespace-legacy': '/full-configurations.spec.ts$',
  actions: '/action-workflows.spec.ts$',
  resolver: '/resolver-import.spec.ts$',
  setters: '/retained-manager.spec.ts$',
  history: '/history-replay.spec.ts$',
  controls: '/subname-control.spec.ts$',
  'controls-before': '/legacy-subname-control.spec.ts$',
  'refusal-transfer': '/legacy-transfer.spec.ts$',
  'refusal-controls': '/legacy-subname-control.spec.ts$',
  'legacy-transfer': '/legacy-transfer.spec.ts$',
  'grace-recovery': '/ancestor-grace-recovery.spec.ts$',
  'v1-grace-recovery': '/v1-grace-recovery.spec.ts$',
  'expired-reissue': '/expired-reissue.spec.ts$',
  'parent-reclaim-transfer': '/parent-reclaim-transfer.spec.ts$',
  'refusal-parent-reclaim-transfer': '/parent-reclaim-after-refusal.spec.ts$',
  'ancestor-records': '/ancestor-record-checkpoints.spec.ts$',
  'approval-gates': '/approval-gates.spec.ts$',
  'approval-grace': '/approval-grace.spec.ts$',
  'approval-partial': '/approval-partial.spec.ts$',
  'priority-permissions': '/priority-permissions.spec.ts$',
  'priority-races': '/priority-races.spec.ts$',
  'priority-conflict': '/priority-conflict.spec.ts$',
}
if (!(layer in specs)) throw new Error(`Unknown layer ${layer}; use ${Object.keys(specs).join(', ')}`)
const ids = option('ids', process.env.MATRIX_IDS)
if (ids) {
  const known = new Set(JSON.parse(readFileSync(resolve(here, '../projects/migration-matrix/configurations.json'), 'utf8')).map(c => c.config_id))
  for (const id of ids.split(',')) if (!known.has(id)) throw new Error(`Unknown configuration: ${id}`)
}
const supported = args.filter(arg => !arg.startsWith('--layer=') && !arg.startsWith('--ids='))
if (layer === 'history' && (!process.env.MATRIX_READY || !process.env.MATRIX_HISTORY_DIRS))
  throw new Error('History replay requires MATRIX_READY and MATRIX_HISTORY_DIRS from the SAME preserved chain. Run fresh core/UI fixtures with the real indexer first. Never replay another chain’s evidence.')
const prepared = Boolean(process.env.MATRIX_READY)
if (layer === 'ancestor-records') {
  process.env.MATRIX_RECORD_PROFILE ??= 'extended'
  // This layer requests no browser/page fixture. Serialize its bounded RPC
  // work separately so it does not consume or increase browser capacity.
  const pool = process.env.MATRIX_CONTRACT_RESOURCE_POOL ?? resolve(tmpdir(), 'ens-migration-matrix-contract-resource-pool')
  mkdirSync(pool, { recursive: true })
  const capacity = resolve(pool, 'capacity.json')
  const temporaryCapacity = resolve(pool, `capacity-${process.pid}.tmp`)
  writeFileSync(temporaryCapacity, JSON.stringify({ maxConcurrentFixtures: 1, scope: 'Browser-free ancestor record checkpoints only' }))
  renameSync(temporaryCapacity, capacity)
  process.env.MATRIX_RESOURCE_POOL = pool
  process.env.MATRIX_TEST_HEAP_MB ??= '2048'
}
if (layer === 'ui-records') {
  process.env.MATRIX_UI = '1'
  process.env.MATRIX_NAMESPACE_ACTIONS = '0'
  process.env.MATRIX_PRIMARY_ACTIONS = '0'
  process.env.MATRIX_DATE_ACTIONS = '0'
}
if (layer === 'dates') {
  process.env.MATRIX_UI = '0'
  process.env.MATRIX_DATE_ACTIONS = '1'
  if (!prepared) process.env.MATRIX_REAL_INDEXER = '1'
}
if (layer === 'ui' || layer.startsWith('namespace')) process.env.MATRIX_LEGACY_TRANSFER_ACTIONS ??= '1'
if (layer === 'ui' || layer.startsWith('namespace')) process.env.MATRIX_PRIMARY_ACTIONS ??= '1'
if (layer === 'ui' || layer.startsWith('namespace')) process.env.MATRIX_DATE_ACTIONS ??= '1'
if (!prepared && process.env.MATRIX_DATE_ACTIONS === '1') process.env.MATRIX_REAL_INDEXER = '1'
const child = spawn(process.execPath, [resolve(here, prepared ? 'run-prepared-matrix.mjs' : 'run-replacement.mjs'), specs[layer], ...supported], {
  cwd: resolve(here, '../..'), stdio: 'inherit', env: { ...process.env, MATRIX_CACHE_APP_MODULES: process.env.MATRIX_CACHE_APP_MODULES ?? '1', ...(layer.startsWith('refusal-') ? { MATRIX_AFTER_REFUSAL: '1' } : {}), ...(ids ? { MATRIX_IDS: ids } : {}), ...(layer === 'ui' ? { MATRIX_NAMESPACE_ACTIONS: process.env.MATRIX_NAMESPACE_ACTIONS ?? '1' } : {}), ...(layer === 'primary' ? { MATRIX_UI: '0', MATRIX_PRIMARY_ACTIONS: '1' } : {}), ...(layer === 'namespace-legacy' ? { MATRIX_LEGACY_TRANSFER_ACTIONS: '1' } : {}), ...(layer.startsWith('namespace') ? { MATRIX_UI: '0', MATRIX_NAMESPACE_ACTIONS: '1', MATRIX_CACHE_APP_MODULES: '1' } : {}) },
})
child.on('exit', code => { process.exitCode = code ?? 1 })
process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
