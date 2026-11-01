import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { addedByFlags, packageOf, parseTscOutput } from '../src/tsc.ts'

describe('parseTscOutput', () => {
  it('reads error lines and places them under the package', () => {
    const output = [
      "src/a.ts(12,5): error TS2532: Object is possibly 'undefined'.",
      '  Continuation detail that is not an error line.',
      "src/b/c.tsx(3,1): error TS18048: 'x' is possibly 'undefined'.",
      '',
    ].join('\n')
    expect(parseTscOutput(output, 'apps/portal')).toEqual([
      {
        tool: 'tsc',
        rule: 'TS2532',
        path: 'apps/portal/src/a.ts',
        line: 12,
        endLine: 12,
        message: "Object is possibly 'undefined'.",
      },
      {
        tool: 'tsc',
        rule: 'TS18048',
        path: 'apps/portal/src/b/c.tsx',
        line: 3,
        endLine: 3,
        message: "'x' is possibly 'undefined'.",
      },
    ])
  })

  it('returns nothing for a clean run', () => {
    expect(parseTscOutput('', 'packages/utils')).toEqual([])
  })
})

describe('addedByFlags', () => {
  it('keeps only errors the strict run adds', () => {
    const missing = parseTscOutput(
      "src/x.ts(2,32): error TS2307: Cannot find module 'api-worker/hc'.",
      'apps/manager',
    )
    const strictOnly = parseTscOutput(
      "src/y.ts(9,3): error TS2532: Object is possibly 'undefined'.",
      'apps/manager',
    )
    expect(addedByFlags(missing, [...missing, ...strictOnly])).toEqual(
      strictOnly,
    )
  })
})

describe('packageOf', () => {
  it('finds the nearest folder with both a package.json and a tsconfig.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'agent-lint-pkg-'))
    mkdirSync(join(root, 'apps/portal/src/deep'), { recursive: true })
    writeFileSync(join(root, 'apps/portal/package.json'), '{}')
    writeFileSync(join(root, 'apps/portal/tsconfig.json'), '{}')
    writeFileSync(join(root, 'apps/portal/src/deep/tsconfig.json'), '{}')
    expect(packageOf(root, 'apps/portal/src/deep/a.ts')).toBe('apps/portal')
    expect(packageOf(root, 'scripts/loose.ts')).toBeUndefined()
  })
})
