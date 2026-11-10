import { dirname, resolve } from 'node:path'
import { build } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('debug profile selection', () => {
  it.each([
    ['not-defined.example', true],
    ['nested.not-defined.example', true],
    ['example', false],
    ['example.eth', false],
    ['not-defined.example.eth', false],
  ])('uses a synchronous suffix check for %s', async (name, isCandidate) => {
    vi.stubEnv('DEV', true)
    const { isMaybeDebugName } = await import('./debug-features')
    const { getDebugProfileRecords } = await import('../features/profile/MOCK')
    expect(isMaybeDebugName(name)).toBe(isCandidate)
    expect(getDebugProfileRecords(name)).toBeUndefined()
  })

  it('keeps every supported text key reachable in the records fixture', async () => {
    vi.stubEnv('DEV', true)
    const { getDebugProfileRecords } = await import('../features/profile/MOCK')
    const { staticTextRecords, textRecords } = await import(
      '../features/profile/data/records'
    )
    const keys = getDebugProfileRecords('debug-records.example')?.texts.map(
      ({ key }) => key,
    )
    expect(keys).toEqual(
      expect.arrayContaining([
        ...staticTextRecords,
        ...textRecords.map(({ key }) => key),
        'links',
      ]),
    )
  })

  it.each([
    'debug-records.example',
    'debug-long.example',
    'debug-empty.example',
    'debug-unsupported.example',
    'debug-malformed.example',
  ])('serves %s in development and opt-in previews only', async (name) => {
    for (const { isDev, flag, isEnabled } of [
      { isDev: true, flag: 'false', isEnabled: true },
      { isDev: false, flag: 'true', isEnabled: true },
      { isDev: false, flag: 'false', isEnabled: false },
    ]) {
      vi.resetModules()
      vi.stubEnv('DEV', isDev)
      vi.stubEnv('VITE_ENABLE_DEBUG_FEATURES', flag)
      const { getDebugProfileRecords } = await import(
        '../features/profile/MOCK'
      )
      const { isMaybeDebugName } = await import('./debug-features')
      expect(isMaybeDebugName(name)).toBe(isEnabled)
      expect(getDebugProfileRecords(name) !== undefined).toBe(isEnabled)
    }
  })

  it('selects each fixture when debug features are enabled', async () => {
    vi.resetModules()
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_ENABLE_DEBUG_FEATURES', 'true')
    const { getDebugProfileRecords, DEBUG_PROFILE, DEBUG_ADDRESSES_PROFILE } =
      await import('../features/profile/MOCK')
    expect(getDebugProfileRecords('debug.example')).toBe(DEBUG_PROFILE)
    expect(getDebugProfileRecords('debug-addresses.example')).toBe(
      DEBUG_ADDRESSES_PROFILE,
    )
    expect(getDebugProfileRecords('onshow.eth')).toBeUndefined()
  })

  it('does not serve either fixture in production without the debug flag', async () => {
    vi.resetModules()
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_ENABLE_DEBUG_FEATURES', 'false')
    const { getDebugProfileRecords } = await import('../features/profile/MOCK')
    expect(getDebugProfileRecords('debug.example')).toBeUndefined()
    expect(getDebugProfileRecords('debug-addresses.example')).toBeUndefined()
  })
})

it.each(['false', 'true'])(
  'excludes fixture modules from production unless opted in (%s)',
  async (flag) => {
    const root = process.cwd()
    const serviceDir = resolve(root, 'src/features/profile/service')
    const entries = [
      resolve(serviceDir, 'profileRecords.ts'),
      resolve(serviceDir, 'profileAvatarRecords.ts'),
      resolve(serviceDir, 'profileOwner.ts'),
    ]
    const debugFeatures = resolve(root, 'src/utils/debug-features.ts')
    const mockModule = resolve(dirname(serviceDir), 'MOCK.ts')
    const bundledModules = new Set([...entries, debugFeatures, mockModule])
    const result = await build({
      configFile: false,
      root,
      envFile: false,
      logLevel: 'silent',
      define: {
        'import.meta.env.DEV': 'false',
        'import.meta.env.VITE_ENABLE_DEBUG_FEATURES': JSON.stringify(flag),
      },
      resolve: { alias: { '@': resolve(root, 'src') } },
      build: {
        write: false,
        minify: false,
        rolldownOptions: {
          input: entries,
          preserveEntrySignatures: 'strict',
          external: (id, importer) => {
            if (id === '@/utils/debug-features') return false
            const resolved =
              id.startsWith('.') && importer
                ? resolve(dirname(importer), `${id}.ts`)
                : id
            return (
              !bundledModules.has(resolved) &&
              !bundledModules.has(`${resolved}.ts`)
            )
          },
        },
      },
    })
    const outputs = Array.isArray(result) ? result : [result]
    const chunks = outputs
      .flatMap((output) => {
        if (!('output' in output)) throw new Error('Expected a completed build')
        return output.output
      })
      .filter((item) => item.type === 'chunk')
    expect(chunks.some((chunk) => mockModule in chunk.modules)).toBe(
      flag === 'true',
    )
    expect(
      chunks
        .map((chunk) => chunk.code)
        .join('\n')
        .includes('debug-long.example'),
    ).toBe(flag === 'true')
  },
)
