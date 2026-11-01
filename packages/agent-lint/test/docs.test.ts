import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { replaceBlock, ruleTable } from '../src/docs.ts'
import { packageDir } from '../src/paths.ts'
import { RULES } from '../src/registry.ts'

describe('replaceBlock', () => {
  const text = [
    'intro',
    '<!-- agent-lint:rules:start -->',
    'old',
    '<!-- agent-lint:rules:end -->',
    'outro',
  ].join('\n')

  it('replaces only the named block', () => {
    expect(replaceBlock(text, 'rules', 'new')).toBe(
      [
        'intro',
        '<!-- agent-lint:rules:start -->',
        'new',
        '<!-- agent-lint:rules:end -->',
        'outro',
      ].join('\n'),
    )
  })

  it('refuses a document without the block', () => {
    expect(() => replaceBlock('nothing here', 'rules', 'x')).toThrow()
  })
})

describe('ruleTable', () => {
  it('escapes pipes inside cells', () => {
    expect(
      ruleTable([
        { id: 'r', what: 'a | b', wiki: [], styleguide: [], greptile: [] },
      ]),
    ).toContain('a \\| b')
  })
})

describe('the README', () => {
  it('carries the current rule table (run the docs script after changing the registry)', () => {
    const readme = readFileSync(join(packageDir, 'README.md'), 'utf8')
    expect(readme).toBe(replaceBlock(readme, 'rules', ruleTable(RULES)))
  })
})
