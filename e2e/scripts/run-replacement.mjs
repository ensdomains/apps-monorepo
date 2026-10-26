#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createServer as createSocketServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const cwd = resolve(root, 'e2e')
const args = process.argv.slice(2)
for (const arg of args)
  if (/^(--reporter|--config|--grep-invert)(=|$)|^-c$/.test(arg))
    throw Error(
      'The replacement runner fixes its config, reporter and exclusions; use --project and --grep to select cases.',
    )
const projectArg =
  args.find((a) => a.startsWith('--project='))?.slice(10) ??
  (args.includes('--project') ? args[args.indexOf('--project') + 1] : undefined)
const selectedProjects = projectArg ? projectArg.split(',') : ['matrix']
const allowedProjects = ['matrix']
for (const project of selectedProjects)
  if (!allowedProjects.includes(project))
    throw Error(`Unknown project: ${project}`)
const workerArg =
  args.find((a) => a.startsWith('--workers='))?.slice(10) ??
  (args.includes('--workers') ? args[args.indexOf('--workers') + 1] : undefined)
if (workerArg && workerArg !== '1')
  throw Error('Replacement fixtures run serially; use --workers=1')
const mockProjects = process.env.MATRIX_REAL_INDEXER === '1' ? [] : ['matrix']
const needsIndexer = selectedProjects.some((p) => !mockProjects.includes(p))
const id = `migration-matrix-${Date.now()}-${process.pid}`
const output = resolve(cwd, '.migration-matrix-runs', id)
mkdirSync(output, { recursive: true })
const ports = {
  rpc: 18545,
  manager: 13010,
  explorer: 13011,
  flags: 15672,
  indexer: 15660,
  bundler: 14337,
  paymaster: 13002,
  orchestrator: 13007,
}
const portOffset = Number(process.env.MATRIX_PORT_OFFSET ?? 0)
if (!Number.isInteger(portOffset) || portOffset < 0 || portOffset > 20000) throw Error('Invalid MATRIX_PORT_OFFSET')
for (const key of Object.keys(ports)) ports[key] += portOffset
const env = {
  ...process.env,
  MATRIX_LOCAL_RPC_ONLY: '1',
  SEPOLIA_FORK_URL: process.env.SEPOLIA_FORK_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com',
  SEPOLIA_FORK_BLOCK: readFileSync(
    resolve(cwd, 'infra/fork-block'),
    'utf8',
  ).trim(),
  ANVIL_RPC_URL: `http://127.0.0.1:${ports.rpc}`,
  RPC_URL: `http://127.0.0.1:${ports.rpc}`,
  MANAGER_APP_URL: `http://localhost:${ports.manager}`,
  PORTAL_APP_URL: `http://localhost:${ports.explorer}`,
  E2E_BIGNAME_URL: `http://127.0.0.1:${ports.indexer}`,
  E2E_BUNDLER_URL: `http://127.0.0.1:${ports.bundler}`,
  E2E_PAYMASTER_URL: `http://127.0.0.1:${ports.paymaster}`,
  E2E_ORCHESTRATOR_URL: `http://127.0.0.1:${ports.orchestrator}`,
  E2E_MOCK_BIGNAME: String(
    selectedProjects.length === 1 && mockProjects.includes(selectedProjects[0]),
  ),
  REPLACEMENT_RESULTS: output,
  VITE_ENS_NETWORK: 'sepolia',
  VITE_API_URL: '/api',
  E2E_BACKEND_URL: `http://127.0.0.1:${ports.flags}`,
  VITE_RPC_URL: '/rpc',
  VITE_RPC_URL_SERVER: `http://127.0.0.1:${ports.rpc}`,
  VITE_PIMLICO_BUNDLER_URL: '/bundler',
  VITE_RHINESTONE_ENDPOINT_URL: '/orchestrator',
  VITE_RHINESTONE_CUSTOM_RPC_URLS: JSON.stringify({
    11155111: `http://127.0.0.1:${ports.rpc}`,
  }),
  VITE_BIGNAME_API_URL: `http://127.0.0.1:${ports.indexer}`,
  VITE_USE_MOCK_WALLET: 'false',
  VITE_ENABLE_DEBUG_FEATURES: 'false',
  VITE_FF_USE_EOA: 'false',
  VITE_PUBLIC_POSTHOG_HOST: `http://127.0.0.1:${ports.flags}`,
  VITE_PUBLIC_POSTHOG_KEY: 'replacement-local',
  VITE_MANAGER_APP_URL: `http://localhost:${ports.manager}`,
  VITE_EXPLORER_URL: `http://localhost:${ports.explorer}`,
  BIGNAME_START: 'ensv2',
  BIGNAME_UPSTREAM_IN_FLIGHT: process.env.BIGNAME_UPSTREAM_IN_FLIGHT ?? '2',
}
const exec = (cmd, argv, options = {}) =>
  execFileSync(cmd, argv, { cwd, env, encoding: 'utf8', ...options })
const playwright = [
  'exec',
  'playwright',
  'test',
  '-c',
  'projects/migration-matrix/playwright.config.ts',
  ...args,
]
if (args.includes('--list')) {
  const child = spawn('pnpm', playwright, { cwd, env, stdio: 'inherit' })
  child.on('exit', (code) => (process.exitCode = code ?? 1))
} else {
  const children = []
  const run = (cmd, argv, options = {}) =>
    new Promise((ok, no) => {
      const child = spawn(cmd, argv, { cwd, env, detached: true, ...options })
      children.push(child)
      child.on('error', no)
      child.on('exit', (code) =>
        code === 0 ? ok() : no(Error(`${cmd} exited ${code}; see run logs`)),
      )
    })
  let flags
  let compose
  let started = false
  let stopping = false
  const stop = () => {
    if (stopping) return
    stopping = true
    for (const child of children) {
      if (child.exitCode !== null || child.signalCode !== null) continue
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch {}
    }
    flags?.close()
    if (started)
      try {
        exec('docker', [...compose, 'logs', '--no-color', '--tail', '200'], {
          stdio: [
            'ignore',
            openSync(resolve(output, 'services.log'), 'a'),
            openSync(resolve(output, 'services.log'), 'a'),
          ],
          timeout: 15000,
        })
      } catch {}
    if (started)
      try {
        exec('docker', [...compose, 'down', '--volumes', '--remove-orphans'], {
          stdio: 'ignore',
          timeout: 120000,
        })
      } catch {
        console.error(
          `Cleanup failed. Run docker compose -p ${id} -f ${output}/compose.json down --volumes`,
        )
      }
  }
  process.on('SIGINT', () => {
    stop()
    process.exit(130)
  })
  process.on('SIGTERM', () => {
    stop()
    process.exit(143)
  })
  const rpc = async (method, params = []) => {
    const r = await fetch(env.ANVIL_RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(120000),
    })
    const body = await r.json()
    if (body.error) throw Error(JSON.stringify(body.error))
    return body.result
  }
  const wait = async (label, check, seconds = 180) => {
    const end = Date.now() + seconds * 1000
    while (Date.now() < end) {
      try {
        if (await check()) return
      } catch {}
      await new Promise((r) => setTimeout(r, 1000))
    }
    throw Error(`${label} did not become ready; see ${output}`)
  }
  try {
    if (Number(process.versions.node.split('.')[0]) < 22)
      throw Error('Node 22+ is required; Node 24 is recommended')
    for (const port of Object.values(ports))
      await new Promise((ok, no) => {
        const s = createSocketServer()
        s.once('error', () =>
          no(
            Error(
              `Port ${port} is occupied. Existing services were not changed.`,
            ),
          ),
        )
        s.listen(port, () => s.close(ok))
      })
    const dockerMemory = Number(
      exec('docker', ['info', '--format', '{{.MemTotal}}']).trim(),
    )
    if (needsIndexer && dockerMemory < 28 * 1024 ** 3)
      throw Error(
        'Full-history indexing needs at least 28 GiB assigned to Docker (48 GiB recommended).',
      )
    exec('cast', ['--version'], { stdio: 'ignore' })
    if (needsIndexer)
      exec(
        'docker',
        ['image', 'inspect', env.BIGNAME_IMAGE ?? 'bigname:e2e-anvil-fork'],
        { stdio: 'ignore' },
      )
    const config = JSON.parse(
      exec('docker', [
        'compose',
        '-f',
        resolve(cwd, 'infra/docker-compose.yml'),
        '--profile',
        'bigname',
        'config',
        '--format',
        'json',
      ]),
    )
    writeFileSync(
      resolve(output, 'run-metadata.json'),
      JSON.stringify(
        {
          runId: id,
          startedAt: new Date().toISOString(),
          projects: selectedProjects,
          arguments: args,
          forkBlock: env.SEPOLIA_FORK_BLOCK,
          indexerStart: env.BIGNAME_START,
          upstreamInFlight: env.BIGNAME_UPSTREAM_IN_FLIGHT,
          mockedDiscoveryProjects: mockProjects,
          excluded: ['DNS', 'legacy stateful'],
          commit: exec('git', ['rev-parse', 'HEAD']).trim(),
          workingTreeChanges: exec('git', ['status', '--porcelain'])
            .trim()
            .split('\n'),
        },
        null,
        2,
      ),
    )
    config.name = id
    for (const network of Object.values(config.networks ?? {}))
      delete network.name
    for (const volume of Object.values(config.volumes ?? {})) delete volume.name
    const selected = [
      'upstream-cache',
      'anvil-cache-init',
      'anvil',
      'alto',
      'paymaster',
      'mockestrator',
      'bigname-postgres',
      'bigname-init',
      'bigname-roles',
      'bigname-rpc',
      'bigname-runner',
      'bigname-api',
    ]
    for (const name of Object.keys(config.services))
      if (!selected.includes(name)) delete config.services[name]
    // The one-shot cache initializer needs only the isolated fixture network.
    // Avoid allocating a second Docker subnet for every prepared test stack.
    config.services['anvil-cache-init'].networks = { e2e: null }
    delete config.networks.default
    if (process.env.MATRIX_FORK_UPSTREAM_RPC_URL)
      config.services['upstream-cache'].environment.UPSTREAM_RPC_URL =
        process.env.MATRIX_FORK_UPSTREAM_RPC_URL
    const exposed = {
      anvil: ports.rpc,
      alto: ports.bundler,
      paymaster: ports.paymaster,
      mockestrator: ports.orchestrator,
      'bigname-api': ports.indexer,
    }
    for (const [name, service] of Object.entries(config.services)) {
      service.ports = (service.ports ?? [])
        .slice(0, exposed[name] ? 1 : 0)
        .map((p) => ({
          ...p,
          published: String(exposed[name]),
          host_ip: '127.0.0.1',
        }))
      delete service.container_name
    }
    config.services.anvil.mem_limit = process.env.MATRIX_ANVIL_MEMORY ?? '16g'
    config.services.anvil.init = true
    for (const [flag, value] of [['--timeout', '180000'], ['--retries', '10'], ['--slots-in-an-epoch', '32'], ['--max-persisted-states', '100000'], ['--cache-path', '/state/history']]) {
      const existing = config.services.anvil.command.indexOf(flag)
      if (existing >= 0) config.services.anvil.command[existing + 1] = value
      else config.services.anvil.command.push(flag, value)
    }
    if (playwright.some(arg => arg.includes('migration-matrix'))) {
      const epochFlag = config.services.anvil.command.indexOf('--slots-in-an-epoch')
      if (epochFlag >= 0) config.services.anvil.command[epochFlag + 1] = '32'
    }
    const stateDirectory = resolve(output, 'anvil-state')
    mkdirSync(stateDirectory, { recursive: true, mode: 0o777 })
    chmodSync(stateDirectory, 0o777)
    // Full historical snapshots grow with this campaign; frequent overlapping
    // dumps can exhaust memory. Preserve history with a bounded dump interval.
    config.services.anvil.command.push('--state', '/state/anvil.json', '--state-interval', process.env.MATRIX_SNAPSHOT_INTERVAL ?? '1800', '--preserve-historical-states')
    config.services.anvil.volumes.push({ type: 'bind', source: stateDirectory, target: '/state' })
    Object.assign(config.services['bigname-rpc'].environment, {
      UPSTREAM_IN_FLIGHT: '2', UPSTREAM_CHUNK: '5', UPSTREAM_MIN_INTERVAL_MS: '500',
      ...(process.env.MATRIX_HISTORY_RPC_URL ? { UPSTREAM_RPC_URL: process.env.MATRIX_HISTORY_RPC_URL } : {}),
    })
    config.services.anvil.healthcheck = {
      ...config.services.anvil.healthcheck,
      start_period: '120s',
      retries: 60,
      timeout: '10s',
    }
    config.services['bigname-runner'].mem_limit = '8g'
    // This generated configuration can contain the caller's upstream URL.
    const file = resolve(output, 'compose.json')
    writeFileSync(file, JSON.stringify(config), { mode: 0o600 })
    compose = ['compose', '-p', id, '-f', file, '--profile', 'bigname']
    started = true
    console.log(`Fresh isolated stack: ${id}. Evidence: ${output}`)
    if (process.env.MATRIX_CACHE_SEED_PREFIX) {
      const sourcePrefix = process.env.MATRIX_CACHE_SEED_PREFIX
      if (!/^[a-z0-9_-]+$/.test(sourcePrefix)) throw Error('Invalid cache source prefix')
      for (const suffix of ['anvil-upstream-cache', 'bigname-rpc-cache']) {
        exec('docker', ['volume', 'create', `${id}_${suffix}`], { stdio: 'ignore' })
        exec('docker', ['run', '--rm', '-v', `${sourcePrefix}_${suffix}:/source:ro`, '-v', `${id}_${suffix}:/dest`, 'alpine', 'cp', '-an', '/source/.', '/dest/'], { stdio: 'ignore' })
      }
    }
    await run('docker', [...compose, 'up', '-d', 'anvil'], {
      stdio: [
        'ignore',
        openSync(resolve(output, 'infra.log'), 'a'),
        openSync(resolve(output, 'infra.log'), 'a'),
      ],
    })
    console.log('Waiting for the fresh fork to respond…')
    await wait(
      'Anvil',
      async () => (await rpc('eth_chainId')) === '0xaa36a7',
      300,
    )
    await wait(
      'Anvil health',
      () =>
        exec('docker', [...compose, 'ps', '--format', 'json', 'anvil'])
          .trim()
          .split('\n')
          .some((line) => JSON.parse(line).Health === 'healthy'),
      300,
    )
    // The snapshot loader preserves headers but does not restore TimeManager's
    // offset. Pin the next block before any service can submit transactions;
    // never mine an earlier timestamp after a future-dated grace fixture.
    const clockHead = await rpc('eth_getBlockByNumber', ['latest', false])
    await rpc('evm_setNextBlockTimestamp', [Math.max(parseInt(clockHead.timestamp, 16) + 1, Math.floor(Date.now() / 1000))])
    await rpc('anvil_setBlockTimestampInterval', [1])
    await run(
      'docker',
      [...compose, 'up', '-d', 'alto', 'paymaster', 'mockestrator'],
      {
        stdio: [
          'ignore',
          openSync(resolve(output, 'infra.log'), 'a'),
          openSync(resolve(output, 'infra.log'), 'a'),
        ],
      },
    )
    const latest = await rpc('eth_getBlockByNumber', ['latest', false])
    const now = Math.floor(Date.now() / 1000)
    // The real indexer needs two epochs of local finalized blocks. Mocked discovery reads latest state and only needs the clock advanced.
    const bootstrapBlocks = needsIndexer ? 64 : 1
    if (parseInt(latest.timestamp, 16) < now - bootstrapBlocks)
      await rpc('evm_setNextBlockTimestamp', [now - bootstrapBlocks + 1])
    for (let remaining = bootstrapBlocks; remaining > 0; remaining -= 128)
      await rpc('anvil_mine', [
        `0x${Math.min(remaining, 128).toString(16)}`,
        '0x1',
      ])
    for (const script of ['fund-account.sh'])
      await run(
        'bash',
        [
          resolve(cwd, 'infra/scripts', script),
          ...(script === 'fund-account.sh'
            ? ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266']
            : []),
        ],
        {
          stdio: [
            'ignore',
            openSync(resolve(output, 'funding.log'), 'a'),
            openSync(resolve(output, 'funding.log'), 'a'),
          ],
        },
      )
    await run('pnpm', ['exec', 'tsx', 'scripts/fund-replacement.ts'], {
      stdio: [
        'ignore',
        openSync(resolve(output, 'funding.log'), 'a'),
        openSync(resolve(output, 'funding.log'), 'a'),
      ],
    })
    if (needsIndexer) {
      console.log('Waiting for the new indexer database to catch up…')
      const requiredIndexedHead = BigInt(await rpc('eth_blockNumber'))
      // Leave two complete epochs after the last fixture setup transaction.
      // Waiting for the moving tip itself deadlocks a finalized-only indexer.
      await rpc('anvil_mine', ['0x40', '0x1'])
      await run(
        'docker',
        [...compose, 'up', '-d', 'bigname-api', 'bigname-runner'],
        {
          stdio: [
            'ignore',
            openSync(resolve(output, 'indexer.log'), 'a'),
            openSync(resolve(output, 'indexer.log'), 'a'),
          ],
        },
      )
      let nextIndexerProgress = 0
      await wait(
        'Indexer',
        async () => {
          const r = await fetch(`${env.E2E_BIGNAME_URL}/v1/status`, {
            signal: AbortSignal.timeout(5000),
          })
          const j = await r.json()
          const chain = j.data?.chains?.['11155111']
          const head = BigInt(await rpc('eth_blockNumber'))
          if (Date.now() >= nextIndexerProgress) {
            console.log(
              `Indexer: ingested ${chain?.latest_block ?? 'pending'}, published ${chain?.indexed_block ?? 'pending'}, chain head ${head}`,
            )
            nextIndexerProgress = Date.now() + 30_000
          }
          const ready = BigInt(chain?.indexed_block ?? 0) >= requiredIndexedHead
          if (ready)
            writeFileSync(
              resolve(output, 'indexer-ready.json'),
              JSON.stringify(j, null, 2),
            )
          return ready
        },
        7200,
      )
    }
    if (needsIndexer) {
      const { rootRegistry, rootEntryKey } = JSON.parse(
        readFileSync(resolve(output, 'chain-config.json'), 'utf8'),
      )
      if (
        !/^0x[0-9a-fA-F]{40}$/.test(rootRegistry) ||
        !/^0x[0-9a-f]{64}$/.test(rootEntryKey)
      )
        throw Error('Invalid root registry in app manifest')
      const count = exec('docker', [
        ...compose,
        'exec',
        '-T',
        'bigname-postgres',
        'psql',
        '-U',
        'bigname',
        '-d',
        'bigname',
        '-Atc',
        `SELECT count(*) FROM bigname_phase.project_ens_v2_entry_owner WHERE registry = '${rootRegistry.toLowerCase()}' AND entry_key = '${rootEntryKey}' AND status = 'registered'`,
      ]).trim()
      if (!Number.isSafeInteger(Number(count)) || Number(count) < 1)
        throw Error(
          'Indexer head caught up but ENSv2 root registry history is missing',
        )
      writeFileSync(
        resolve(output, 'root-history.json'),
        JSON.stringify(
          { rootRegistry, rootEntryKey, count: Number(count) },
          null,
          2,
        ),
      )
    }
    console.log('Starting isolated Manager and Explorer…')
    flags = createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Headers', '*')
      if (req.url === '/wallet/fund') {
        try {
          let body = ''
          for await (const chunk of req) body += chunk
          const { address } = JSON.parse(body)
          if (!/^0x[0-9a-fA-F]{40}$/.test(address))
            throw Error('Invalid fixture address')
          const balance = BigInt(
            await rpc('eth_getBalance', [address, 'latest']),
          )
          if (balance < 10n ** 18n) throw Error('Fixture wallet was not funded')
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ success: true }))
        } catch {
          res.statusCode = 500
          res.end('Fixture funding precondition failed')
        }
        return
      }
      if (req.url?.includes('.js')) {
        res.setHeader('Content-Type', 'application/javascript')
        res.end('')
        return
      }
      if (!/^\/(flags|decide|batch|capture|e|i)([/?]|$)/.test(req.url ?? '')) {
        res.statusCode = 404
        res.end('This endpoint is outside the replacement fixture backend')
        return
      }
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          featureFlags: { migration: true, 'profile-view-new': true, 'migration-subname-recreation': true },
          featureFlagPayloads: {},
        }),
      )
    }).listen(ports.flags, '127.0.0.1')
    let managerProcess
    const startApp = (app, port, directWallet = false) => {
      const log = openSync(resolve(output, `${app}.log`), 'a')
      const child = spawn(
        'pnpm',
        ['exec', 'vite', 'dev', '--port', String(port), '--strictPort'],
        {
          cwd: resolve(root, 'apps', app),
          env: { ...env, VITE_FF_USE_EOA: String(directWallet) },
          detached: true,
          stdio: ['ignore', log, log],
        },
      )
      children.push(child)
      return child
    }
    for (const [app, port] of [
      ['manager', ports.manager],
      ['portal', ports.explorer],
    ]) {
      const child = startApp(app, port)
      if (app === 'manager') managerProcess = child
    }
    for (const url of [env.MANAGER_APP_URL, env.PORTAL_APP_URL])
      await wait(
        url,
        async () =>
          (await fetch(url, { signal: AbortSignal.timeout(30000) })).ok,
        600,
      )
    if (process.env.MATRIX_PREPARE_ONLY === '1') {
      writeFileSync(resolve(output, 'ready.json'), JSON.stringify({ ports, env: Object.fromEntries(Object.entries(env).filter(([key]) => /^(ANVIL_RPC_URL|RPC_URL|MANAGER_APP_URL|PORTAL_APP_URL|E2E_|REPLACEMENT_RESULTS)/.test(key))) }, null, 2))
      console.log(`Prepared matrix environment: ${output}`)
      await new Promise(() => {})
    }
    let failed = false
    const outcomes = []
    let directWallet = false
    for (const project of selectedProjects) {
      const needsDirectWallet = project === 'migration-indexed-eoa'
      if (needsDirectWallet !== directWallet) {
        process.kill(-managerProcess.pid, 'SIGTERM')
        await new Promise((done) => managerProcess.once('exit', done))
        // Wait until Vite releases the port before starting the other signer mode.
        await wait('Manager shutdown', async () => {
          try {
            await fetch(env.MANAGER_APP_URL, {
              signal: AbortSignal.timeout(1000),
            })
            return false
          } catch {
            return true
          }
        })
        managerProcess = startApp('manager', ports.manager, needsDirectWallet)
        await wait(
          'Manager signer mode',
          async () =>
            (
              await fetch(env.MANAGER_APP_URL, {
                signal: AbortSignal.timeout(5000),
              })
            ).ok,
        )
        directWallet = needsDirectWallet
      }
      const projectOutput = resolve(output, project)
      mkdirSync(projectOutput, { recursive: true })
      const filtered = args.filter(
        (a, i) =>
          !a.startsWith('--project=') &&
          a !== '--project' &&
          args[i - 1] !== '--project',
      )
      const child = spawn(
        'pnpm',
        [
          'exec',
          'playwright',
          'test',
          '-c',
          'projects/migration-matrix/playwright.config.ts',
          `--project=${project}`,
          ...filtered,
        ],
        {
          cwd,
          env: {
            ...env,
            E2E_MOCK_BIGNAME: String(mockProjects.includes(project)),
            E2E_MANAGER_SIGNER: directWallet ? 'eoa' : 'hca',
            REPLACEMENT_RESULTS: projectOutput,
          },
          detached: true,
          stdio: 'inherit',
        },
      )
      children.push(child)
      const code = await new Promise((ok) =>
        child.on('exit', (code) => ok(code ?? 1)),
      )
      failed ||= code !== 0
      outcomes.push({ project, exitCode: code })
    }
    writeFileSync(
      resolve(output, 'run-results.json'),
      JSON.stringify(outcomes, null, 2),
    )
    process.exitCode = failed ? 1 : 0
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  } finally {
    stop()
  }
}
