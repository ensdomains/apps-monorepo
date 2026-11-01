import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { packageDir } from '../src/paths.ts'
import {
  runtimeBiomeConfig,
  withAbsolutePlugins,
} from '../src/runtimeConfig.ts'

describe('withAbsolutePlugins', () => {
  it('points relative plugin paths at the plugins folder and drops the schema line', () => {
    const text = [
      '{',
      '  "$schema": "../node_modules/@biomejs/biome/configuration_schema.json",',
      '  "plugins": ["./plugins/a.grit", { "path": "./plugins/b.grit" }]',
      '}',
    ].join('\n')
    expect(withAbsolutePlugins(text, '/x/plugins')).toBe(
      [
        '{',
        '  "plugins": ["/x/plugins/a.grit", { "path": "/x/plugins/b.grit" }]',
        '}',
      ].join('\n'),
    )
  })
})

describe('runtimeBiomeConfig', () => {
  it('writes the config outside the package, with no relative plugin path left', () => {
    const path = runtimeBiomeConfig()
    expect(path.startsWith(packageDir)).toBe(false)
    expect(readFileSync(path, 'utf8')).not.toContain('"./plugins/')
  })
})
