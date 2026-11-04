import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import type { Linter } from 'eslint'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { eslintConfig } from '../src/eslintConfig.ts'
import { biomeConfig } from '../src/paths.ts'
import { RULES } from '../src/registry.ts'
import { TEXT_RULES } from '../src/text.ts'
import { STRICT_FLAGS } from '../src/tsc.ts'

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readJsonc = (path: string): unknown =>
  ts.parseConfigFileTextToJson(path, readFileSync(path, 'utf8')).config

const levelOf = (setting: unknown): unknown =>
  isRecord(setting) ? setting.level : setting

const biomeRules = (config: unknown): ReadonlyArray<string> => {
  const rules =
    isRecord(config) && isRecord(config.linter)
      ? config.linter.rules
      : undefined
  if (!isRecord(rules)) return []
  return Object.entries(rules).flatMap(([group, settings]) =>
    isRecord(settings)
      ? Object.entries(settings).flatMap(([rule, setting]) =>
          levelOf(setting) === 'error' ? [`lint/${group}/${rule}`] : [],
        )
      : [],
  )
}

const biomePlugins = (config: unknown): ReadonlyArray<string> => {
  const plugins = isRecord(config) ? config.plugins : undefined
  if (!Array.isArray(plugins)) return []
  return plugins.flatMap((entry: unknown) => {
    const path = isRecord(entry) ? entry.path : entry
    return typeof path === 'string' ? [`plugin/${basename(path, '.grit')}`] : []
  })
}

const isOn = (setting: Linter.RuleEntry | undefined): boolean =>
  setting === 'error' || (Array.isArray(setting) && setting[0] === 'error')

const eslintRules = (): ReadonlyArray<string> =>
  eslintConfig('/repo').flatMap((block) =>
    Object.entries(block.rules ?? {}).flatMap(([id, setting]) =>
      isOn(setting) ? [id] : [],
    ),
  )

describe('the rule registry', () => {
  const biome = readJsonc(biomeConfig)
  const enabled = [
    ...biomeRules(biome),
    ...biomePlugins(biome),
    ...eslintRules(),
    ...STRICT_FLAGS.map((flag) => `tsc/${flag.replace(/^--/u, '')}`),
    ...TEXT_RULES.map((r) => r.id),
  ]

  it('lists every rule agent-lint switches on, and nothing else', () => {
    expect(RULES.map((r) => r.id).toSorted()).toEqual(enabled.toSorted())
  })

  it('lists each rule once', () => {
    const ids = RULES.map((r) => r.id)
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
  })
})
