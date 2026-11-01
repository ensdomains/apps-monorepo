import { describe, expect, it } from 'vitest'
import { formatReport, summarizeUntyped } from '../src/report.ts'

const none = { base: 'abcdef1234567', checked: 3, findings: [], errors: [] }

describe('summarizeUntyped', () => {
  it('counts the files per folder, the folder with most files first', () => {
    expect(
      summarizeUntyped([
        'packages/b/vitest.config.ts',
        'packages/a/src/x.test.ts',
        'packages/a/src/y.test.ts',
      ]),
    ).toEqual({
      count: 3,
      folders: [
        { folder: 'packages/a/src', count: 2 },
        { folder: 'packages/b', count: 1 },
      ],
      files: [
        'packages/b/vitest.config.ts',
        'packages/a/src/x.test.ts',
        'packages/a/src/y.test.ts',
      ],
    })
  })

  it('has nothing to count when every file had types', () => {
    expect(summarizeUntyped([])).toEqual({ count: 0, folders: [], files: [] })
  })
})

describe('formatReport', () => {
  it('says nothing about type information when every file had it', () => {
    expect(formatReport({ ...none, untyped: [] })).toBe(
      'agent-lint: no new problems in 3 changed file(s) since abcdef123.',
    )
  })

  it('counts the files linted without types and names their folders, under the head line', () => {
    expect(
      formatReport({
        ...none,
        untyped: [
          'packages/a/src/x.test.ts',
          'packages/a/src/y.test.ts',
          'packages/b/vitest.config.ts',
        ],
      }),
    ).toBe(
      [
        'agent-lint: no new problems in 3 changed file(s) since abcdef123.',
        'agent-lint linted 3 file(s) outside any tsconfig.json without type information: the ESLint rules that read types did not run on them.',
        '  packages/a/src (2)',
        '  packages/b (1)',
      ].join('\n'),
    )
  })

  it('lists ten folders and counts the rest', () => {
    const untyped = Array.from({ length: 12 }, (_, i) => `f${i}/vite.config.ts`)
    const lines = formatReport({ ...none, untyped }).split('\n')
    expect(lines).toHaveLength(1 + 1 + 10 + 1)
    expect(lines.at(-1)).toBe('  and 2 more folder(s)')
  })

  it('keeps the untyped-files notice ahead of the findings', () => {
    const text = formatReport({
      ...none,
      findings: [
        {
          tool: 'biome',
          rule: 'lint/style/noNestedTernary',
          path: 'src/a.ts',
          line: 4,
          endLine: 4,
          message: 'No nested ternary.',
          reason: 'changed-line',
        },
      ],
      untyped: ['vitest.config.ts'],
    })
    expect(text.indexOf('linted 1 file(s)')).toBeGreaterThan(
      text.indexOf('1 new problem(s)'),
    )
    expect(text.indexOf('linted 1 file(s)')).toBeLessThan(
      text.indexOf('src/a.ts'),
    )
  })
})
