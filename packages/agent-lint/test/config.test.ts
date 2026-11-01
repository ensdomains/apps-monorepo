import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { INVARIANT_PACKAGES } from '../src/eslintConfig.ts'
import { biomeConfig, packageDir } from '../src/paths.ts'
import { TEST_LIKE_GLOBS } from '../src/testLike.ts'

type Groups = Readonly<Record<string, Readonly<Record<string, unknown>>>>

/** Reads a JSONC file (comments, trailing commas) with TypeScript's parser. */
const readJsonc = (path: string): unknown => {
  const { config, error } = ts.parseConfigFileTextToJson(
    path,
    readFileSync(path, 'utf8'),
  )
  if (error !== undefined) throw new Error(`could not parse ${path}`)
  return config
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const ruleGroups = (config: unknown): Groups => {
  const rules =
    isRecord(config) && isRecord(config.linter)
      ? config.linter.rules
      : undefined
  if (!isRecord(rules)) return {}
  return Object.fromEntries(
    Object.entries(rules).flatMap(([group, settings]) =>
      isRecord(settings) ? [[group, settings]] : [],
    ),
  )
}

/** A rule's level, whether written as `"error"` or `{ "level": "error" }`. */
const level = (setting: unknown): string | undefined => {
  if (typeof setting === 'string') return setting
  if (isRecord(setting) && typeof setting.level === 'string') {
    return setting.level
  }
  return undefined
}

/** `group/rule` for every rule a config switches on at warn or error. */
const switchedOn = (groups: Groups): ReadonlyArray<string> =>
  Object.entries(groups).flatMap(([group, rules]) =>
    Object.entries(rules).flatMap(([rule, setting]) => {
      const l = level(setting)
      return l === 'warn' || l === 'error' || l === 'on'
        ? [`${group}/${rule}`]
        : []
    }),
  )

const repoRoot = join(packageDir, '..', '..')
const humanConfigs = [
  'biome.jsonc',
  'apps/manager/biome.jsonc',
  'workers/api-worker/biome.jsonc',
]

describe('the agent Biome config', () => {
  const agent = readJsonc(biomeConfig)
  const agentGroups = ruleGroups(agent)

  it('starts from the recommended preset, as the human root config does', () => {
    const preset =
      isRecord(agent) && isRecord(agent.linter) && isRecord(agent.linter.rules)
        ? agent.linter.rules.preset
        : undefined
    expect(preset).toBe('recommended')
  })

  it('reads the human root config (a guard against a parser that finds nothing)', () => {
    expect(
      switchedOn(ruleGroups(readJsonc(join(repoRoot, 'biome.jsonc')))),
    ).toContain('suspicious/noExplicitAny')
  })

  it.each(humanConfigs)('holds every rule %s switches on, at error', (file) => {
    const human = switchedOn(ruleGroups(readJsonc(join(repoRoot, file))))
    const weaker = human.filter((id) => {
      const [group = '', rule = ''] = id.split('/')
      return level(agentGroups[group]?.[rule]) !== 'error'
    })
    expect(weaker).toEqual([])
  })
})

describe('the test-like file list', () => {
  it('is the same in the Biome config and in src/testLike.ts', () => {
    const agent = readJsonc(biomeConfig)
    const overrides =
      isRecord(agent) && Array.isArray(agent.overrides) ? agent.overrides : []
    const testOverride = overrides.find(
      (o: unknown) =>
        isRecord(o) &&
        Array.isArray(o.includes) &&
        o.includes.includes('**/*.test.*'),
    )
    expect(isRecord(testOverride) ? testOverride.includes : undefined).toEqual([
      ...TEST_LIKE_GLOBS,
    ])
  })
})

describe('the packages no-throw applies to', () => {
  it('are utils and every workspace package that depends on it', () => {
    const dependsOnUtils = (dir: string): boolean => {
      const manifest: unknown = JSON.parse(
        readFileSync(join(repoRoot, dir, 'package.json'), 'utf8'),
      )
      if (!isRecord(manifest)) return false
      return [manifest.dependencies, manifest.devDependencies].some(
        (deps) => isRecord(deps) && '@ens-apps/utils' in deps,
      )
    }
    const workspaces = ['apps', 'packages', 'workers'].flatMap((group) =>
      readdirSync(join(repoRoot, group), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${group}/${entry.name}`)
        .filter((dir) => existsSync(join(repoRoot, dir, 'package.json'))),
    )
    expect([...INVARIANT_PACKAGES]).toEqual(
      workspaces
        .filter((dir) => dir === 'packages/utils' || dependsOnUtils(dir))
        .sort(),
    )
  })
})
