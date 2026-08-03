#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DEFAULT_PREVIEW_CONFIG = 'wrangler.commemorative-nft-preview.jsonc'
const LIVE_CONFIG = 'wrangler.jsonc'
const PLACEHOLDER_PATTERN = /REPLACE(?:_|-)/i

const fail = (message) => {
  console.error(`Preview deployment blocked: ${message}`)
  process.exit(1)
}

const readConfig = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(
      `could not read strict JSON config ${path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

const requireRecord = (value, name) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${name} must be an object`)
  }
  return value
}

const requireSingleBinding = (value, name) => {
  if (!Array.isArray(value) || value.length !== 1) {
    fail(`${name} must contain exactly one preview binding`)
  }
  return requireRecord(value[0], `${name}[0]`)
}

const requireBareHttpsOrigin = (value, name, { allowEmpty = false } = {}) => {
  if (allowEmpty && value === '') return
  if (typeof value !== 'string' || PLACEHOLDER_PATTERN.test(value)) {
    fail(`${name} must be configured before deployment`)
  }

  let url
  try {
    url = new URL(value)
  } catch {
    fail(`${name} must be a valid HTTPS origin`)
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    fail(`${name} must be a bare HTTPS origin`)
  }
  return url
}

const args = process.argv.slice(2)
let checkOnly = false
let configFile = DEFAULT_PREVIEW_CONFIG
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index]
  if (argument === '--check') {
    checkOnly = true
    continue
  }
  if (argument === '--config') {
    const value = args[index + 1]
    if (!value) fail('--config requires a path')
    configFile = value
    index += 1
    continue
  }
  fail(`unknown argument ${argument}`)
}

const configPath = resolve(configFile)
const liveConfigPath = resolve(LIVE_CONFIG)
if (configPath === liveConfigPath) fail('the live wrangler.jsonc is forbidden')

const preview = requireRecord(readConfig(configPath), 'preview config')
const live = requireRecord(readConfig(liveConfigPath), 'live config')

if (
  typeof preview.name !== 'string' ||
  !/^app-api-worker-commemorative-nft-preview-[a-z0-9-]+$/.test(preview.name) ||
  preview.name.length > 63 ||
  PLACEHOLDER_PATTERN.test(preview.name) ||
  preview.name === live.name
) {
  fail('Worker name must be a unique commemorative NFT preview name')
}
if (preview.workers_dev !== true) fail('workers_dev must be true')
if (preview.preview_urls !== false) fail('preview_urls must be false')
if (preview.main !== live.main)
  fail('preview main must match the reviewed Worker')

for (const forbiddenKey of [
  'containers',
  'durable_objects',
  'migrations',
  'queues',
  'routes',
  'route',
  'triggers',
]) {
  if (forbiddenKey in preview) {
    fail(`${forbiddenKey} is forbidden in the isolated preview config`)
  }
}

const previewKv = requireSingleBinding(preview.kv_namespaces, 'kv_namespaces')
const liveKvIds = new Set(
  Array.isArray(live.kv_namespaces)
    ? live.kv_namespaces.map(({ id }) => id).filter(Boolean)
    : [],
)
if (
  previewKv.binding !== 'KV' ||
  typeof previewKv.id !== 'string' ||
  !/^[0-9a-f]{32}$/i.test(previewKv.id) ||
  liveKvIds.has(previewKv.id)
) {
  fail('KV must use a valid preview-only namespace ID')
}

const previewWorkflow = requireSingleBinding(preview.workflows, 'workflows')
const liveWorkflowNames = new Set(
  Array.isArray(live.workflows)
    ? live.workflows.map(({ name }) => name).filter(Boolean)
    : [],
)
if (
  previewWorkflow.binding !== 'COMMEMORATIVE_NFT_GENERATION' ||
  previewWorkflow.class_name !== 'CommemorativeNftGenerationWorkflow' ||
  typeof previewWorkflow.name !== 'string' ||
  !/^commemorative-nft-generation-preview-[a-z0-9-]+$/.test(
    previewWorkflow.name,
  ) ||
  PLACEHOLDER_PATTERN.test(previewWorkflow.name) ||
  liveWorkflowNames.has(previewWorkflow.name)
) {
  fail('Workflow must use a unique preview-only name')
}

const previewBucket = requireSingleBinding(preview.r2_buckets, 'r2_buckets')
if (
  previewBucket.binding !== 'COMMEMORATIVE_NFT_BUCKET' ||
  previewBucket.bucket_name !== 'ensv2-commemorative-nft-staging'
) {
  fail('preview may bind only the approved commemorative NFT staging bucket')
}

const vars = requireRecord(preview.vars, 'vars')
const baseUrl = requireBareHttpsOrigin(vars.BASE_URL, 'vars.BASE_URL')
if (
  !baseUrl.hostname.endsWith('.workers.dev') ||
  !baseUrl.hostname.startsWith(`${preview.name}.`)
) {
  fail('vars.BASE_URL must be this preview Worker workers.dev origin')
}
requireBareHttpsOrigin(
  vars.COMMEMORATIVE_NFT_GENERATOR_ORIGIN,
  'vars.COMMEMORATIVE_NFT_GENERATOR_ORIGIN',
  { allowEmpty: true },
)

if (
  vars.COMMEMORATIVE_NFT_CONTRACT_ADDRESS !==
    live.vars?.COMMEMORATIVE_NFT_CONTRACT_ADDRESS ||
  vars.COMMEMORATIVE_NFT_RENDERER_REVISION !==
    live.vars?.COMMEMORATIVE_NFT_RENDERER_REVISION
) {
  fail('preview contract and renderer revision must match reviewed staging')
}

console.log(`Preview config validated: ${configPath}`)
if (checkOnly) process.exit(0)

const command = process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler'
const deployment = spawnSync(command, ['deploy', '--config', configPath], {
  stdio: 'inherit',
})
if (deployment.error) fail(deployment.error.message)
process.exit(deployment.status ?? 1)
