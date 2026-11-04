import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { countKey, selectNew, toolPathKey } from '../src/filter.ts'
import type { BaseCounts, ChangedFile, Diagnostic } from '../src/types.ts'

const diag = (over: Partial<Diagnostic> = {}): Diagnostic => ({
  tool: 'biome',
  rule: 'lint/style/useBlockStatements',
  path: 'src/a.ts',
  line: 1,
  endLine: 1,
  message: 'm',
  ...over,
})

const modified = (
  ranges: ChangedFile['ranges'],
  path = 'src/a.ts',
): ChangedFile => ({
  path,
  status: 'modified',
  ranges,
})

const noFileRules: ReadonlySet<string> = new Set()

describe('selectNew', () => {
  it('keeps a problem on a changed line and drops one on an untouched line', () => {
    const found = selectNew({
      diagnostics: [
        diag({ line: 5, endLine: 5 }),
        diag({ line: 20, endLine: 20 }),
      ],
      changed: [modified([{ start: 4, end: 6 }])],
      fileLevelRules: noFileRules,
    })
    expect(found.map((f) => [f.line, f.reason])).toEqual([[5, 'changed-line']])
  })

  it('counts a multi-line problem by its first line', () => {
    const problem = diag({ line: 2, endLine: 9 })
    const onLast = selectNew({
      diagnostics: [problem],
      changed: [modified([{ start: 9, end: 9 }])],
      fileLevelRules: noFileRules,
    })
    const onFirst = selectNew({
      diagnostics: [problem],
      changed: [modified([{ start: 2, end: 2 }])],
      fileLevelRules: noFileRules,
    })
    expect([onLast.length, onFirst.length]).toEqual([0, 1])
  })

  it('ignores problems in files the change does not touch', () => {
    const found = selectNew({
      diagnostics: [diag({ path: 'src/other.ts' })],
      changed: [modified([{ start: 1, end: 100 }])],
      fileLevelRules: noFileRules,
    })
    expect(found).toEqual([])
  })

  it('applies whole-file rules only to new names: added files and renames that change the name', () => {
    const rule = 'lint/style/useFilenamingConvention'
    const found = selectNew({
      diagnostics: [
        diag({ rule, path: 'src/renamed.ts', line: 1, endLine: 1 }),
        diag({ rule, path: 'src/kept.ts', line: 1, endLine: 1 }),
        diag({ rule, path: 'lib/moved.ts', line: 1, endLine: 1 }),
      ],
      changed: [
        {
          path: 'src/renamed.ts',
          status: 'renamed',
          oldPath: 'src/x.ts',
          ranges: [],
        },
        modified([{ start: 30, end: 31 }], 'src/kept.ts'),
        {
          path: 'lib/moved.ts',
          status: 'renamed',
          oldPath: 'src/moved.ts',
          ranges: [],
        },
      ],
      fileLevelRules: new Set([rule]),
    })
    expect(found.map((f) => [f.path, f.reason])).toEqual([
      ['src/renamed.ts', 'file-rule'],
    ])
  })

  it('reports problems off the changed lines when the count rose from the base', () => {
    const a = diag({
      tool: 'tsc',
      rule: 'TS2532',
      path: 'src/b.ts',
      line: 3,
      endLine: 3,
    })
    const b = diag({
      tool: 'tsc',
      rule: 'TS2532',
      path: 'src/b.ts',
      line: 8,
      endLine: 8,
    })
    const base: BaseCounts = {
      measured: new Set([toolPathKey('tsc', 'src/b.ts')]),
      counts: new Map([[countKey(a), 1]]),
    }
    const found = selectNew({
      diagnostics: [a, b],
      changed: [],
      fileLevelRules: noFileRules,
      base,
    })
    expect(found.map((f) => [f.line, f.reason, f.note])).toEqual([
      [3, 'count-rose', '1 at the base, 2 now'],
      [8, 'count-rose', '1 at the base, 2 now'],
    ])
  })

  it('treats a measured file with no base entry as having had none', () => {
    const a = diag({
      tool: 'tsc',
      rule: 'TS7006',
      path: 'src/c.ts',
      line: 4,
      endLine: 4,
    })
    const found = selectNew({
      diagnostics: [a],
      changed: [],
      fileLevelRules: noFileRules,
      base: {
        measured: new Set([toolPathKey('tsc', 'src/c.ts')]),
        counts: new Map(),
      },
    })
    expect(found.map((f) => f.reason)).toEqual(['count-rose'])
  })

  it('does not double-report when changed lines already explain the rise', () => {
    const onLine = diag({ line: 5, endLine: 5 })
    const elsewhere = diag({ line: 50, endLine: 50 })
    const found = selectNew({
      diagnostics: [onLine, elsewhere],
      changed: [modified([{ start: 5, end: 5 }])],
      fileLevelRules: noFileRules,
      base: {
        measured: new Set([toolPathKey('biome', 'src/a.ts')]),
        counts: new Map([[countKey(onLine), 1]]),
      },
    })
    expect(found.map((f) => [f.line, f.reason])).toEqual([[5, 'changed-line']])
  })

  const arbRange = fc
    .tuple(fc.integer({ min: 1, max: 200 }), fc.integer({ min: 0, max: 20 }))
    .map(([start, len]) => ({ start, end: start + len }))
  const arbDiag = fc
    .tuple(
      fc.constantFrom('src/a.ts', 'src/b.ts'),
      fc.constantFrom('r1', 'r2'),
      fc.integer({ min: 1, max: 250 }),
      fc.integer({ min: 0, max: 5 }),
    )
    .map(([path, rule, line, span]) =>
      diag({ path, rule, line, endLine: line + span }),
    )
  const arbInput = fc.record({
    diagnostics: fc.array(arbDiag, { maxLength: 30 }),
    ranges: fc.array(arbRange, { maxLength: 6 }),
  })

  it('only ever returns problems it was given', () => {
    fc.assert(
      fc.property(arbInput, ({ diagnostics, ranges }) => {
        const found = selectNew({
          diagnostics,
          changed: [modified(ranges)],
          fileLevelRules: noFileRules,
        })
        const given = new Set(diagnostics)
        expect(
          found.every(({ reason: _r, note: _n, ...d }) =>
            [...given].some((g) => JSON.stringify(g) === JSON.stringify(d)),
          ),
        ).toBe(true)
      }),
    )
  })

  it('keeps every problem that starts on a changed line and nothing else, without a base', () => {
    fc.assert(
      fc.property(arbInput, ({ diagnostics, ranges }) => {
        const found = selectNew({
          diagnostics,
          changed: [modified(ranges)],
          fileLevelRules: noFileRules,
        })
        const touches = (d: Diagnostic) =>
          d.path === 'src/a.ts' &&
          ranges.some((r) => d.line >= r.start && d.line <= r.end)
        expect(found.length).toBe(diagnostics.filter(touches).length)
        expect(
          found.every((f) => touches(f) && f.reason === 'changed-line'),
        ).toBe(true)
      }),
    )
  })

  it('reports nothing off the changed lines when no count rose', () => {
    fc.assert(
      fc.property(arbInput, ({ diagnostics, ranges }) => {
        const counts = new Map(
          [...Map.groupBy(diagnostics, countKey)].map(([key, ds]) => [
            key,
            ds.length,
          ]),
        )
        const found = selectNew({
          diagnostics,
          changed: [modified(ranges)],
          fileLevelRules: noFileRules,
          base: {
            measured: new Set([
              toolPathKey('biome', 'src/a.ts'),
              toolPathKey('biome', 'src/b.ts'),
            ]),
            counts,
          },
        })
        expect(found.every((f) => f.reason === 'changed-line')).toBe(true)
      }),
    )
  })

  it('lists findings by path, then line', () => {
    const found = selectNew({
      diagnostics: [
        diag({ path: 'src/b.ts', line: 2, endLine: 2 }),
        diag({ path: 'src/a.ts', line: 9, endLine: 9 }),
        diag({ path: 'src/a.ts', line: 3, endLine: 3 }),
      ],
      changed: [
        modified([{ start: 1, end: 10 }]),
        modified([{ start: 1, end: 10 }], 'src/b.ts'),
      ],
      fileLevelRules: noFileRules,
    })
    expect(found.map((f) => `${f.path}:${f.line}`)).toEqual([
      'src/a.ts:3',
      'src/a.ts:9',
      'src/b.ts:2',
    ])
  })
})
