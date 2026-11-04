import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { hunkRange, parseDiff } from '../src/diff.ts'
import { stdoutOf } from '../src/process.ts'
import type { LineRange } from '../src/types.ts'

const linesOf = (ranges: ReadonlyArray<LineRange>): ReadonlyArray<number> =>
  ranges.flatMap((r) =>
    Array.from({ length: r.end - r.start + 1 }, (_, i) => r.start + i),
  )

describe('hunkRange', () => {
  it('reads the added side of a hunk header', () => {
    expect(hunkRange('@@ -10,2 +10,3 @@ const x = 1')).toEqual({
      start: 10,
      end: 12,
    })
  })

  it('treats a missing count as one line', () => {
    expect(hunkRange('@@ -40 +41 @@')).toEqual({ start: 41, end: 41 })
  })

  it('has no range for a hunk that only deletes', () => {
    expect(hunkRange('@@ -5,3 +4,0 @@')).toBeUndefined()
  })

  it('ignores lines that are not hunk headers', () => {
    expect(hunkRange('+@@ -1 +1 @@')).toBeUndefined()
  })
})

describe('parseDiff', () => {
  it('reads a modified file with several hunks', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 1111111..2222222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -10,2 +10,3 @@ export const a = 1',
      '-old',
      '-old',
      '+new',
      '+new',
      '+new',
      '@@ -40 +41 @@',
      '-x',
      '+y',
      '@@ -60,2 +61,0 @@',
      '-gone',
      '-gone',
    ].join('\n')
    expect(parseDiff(diff)).toEqual([
      {
        path: 'src/a.ts',
        status: 'modified',
        ranges: [
          { start: 10, end: 12 },
          { start: 41, end: 41 },
        ],
      },
    ])
  })

  it('reads a new file', () => {
    const diff = [
      'diff --git a/src/new.ts b/src/new.ts',
      'new file mode 100644',
      'index 0000000..3333333',
      '--- /dev/null',
      '+++ b/src/new.ts',
      '@@ -0,0 +1,5 @@',
      '+1',
      '+2',
      '+3',
      '+4',
      '+5',
    ].join('\n')
    expect(parseDiff(diff)).toEqual([
      { path: 'src/new.ts', status: 'added', ranges: [{ start: 1, end: 5 }] },
    ])
  })

  it('reads renames with and without edits', () => {
    const diff = [
      'diff --git a/src/old.ts b/src/moved.ts',
      'similarity index 100%',
      'rename from src/old.ts',
      'rename to src/moved.ts',
      'diff --git a/src/b.ts b/src/c.ts',
      'similarity index 80%',
      'rename from src/b.ts',
      'rename to src/c.ts',
      'index 4444444..5555555 100644',
      '--- a/src/b.ts',
      '+++ b/src/c.ts',
      '@@ -3 +3,2 @@',
      '-x',
      '+y',
      '+z',
    ].join('\n')
    expect(parseDiff(diff)).toEqual([
      {
        path: 'src/moved.ts',
        status: 'renamed',
        oldPath: 'src/old.ts',
        ranges: [],
      },
      {
        path: 'src/c.ts',
        status: 'renamed',
        oldPath: 'src/b.ts',
        ranges: [{ start: 3, end: 4 }],
      },
    ])
  })

  it('skips binary files and keeps mode-only changes without ranges', () => {
    const diff = [
      'diff --git a/img.png b/img.png',
      'index 6666666..7777777 100644',
      'Binary files a/img.png and b/img.png differ',
      'diff --git a/run.sh b/run.sh',
      'old mode 100644',
      'new mode 100755',
    ].join('\n')
    expect(parseDiff(diff)).toEqual([
      { path: 'run.sh', status: 'modified', ranges: [] },
    ])
  })

  it('unquotes paths git had to quote', () => {
    const diff = [
      'diff --git "a/src/say \\"hi\\".ts" "b/src/say \\"hi\\".ts"',
      '--- "a/src/say \\"hi\\".ts"',
      '+++ "b/src/say \\"hi\\".ts"',
      '@@ -1 +1 @@',
      '-a',
      '+b',
      'diff --git "a/caf\\303\\251.ts" "b/caf\\303\\251.ts"',
      '--- "a/caf\\303\\251.ts"',
      '+++ "b/caf\\303\\251.ts"',
      '@@ -1 +1 @@',
      '-a',
      '+b',
    ].join('\n')
    expect(parseDiff(diff).map((f) => f.path)).toEqual([
      'src/say "hi".ts',
      'café.ts',
    ])
  })

  it('returns nothing for an empty diff', () => {
    expect(parseDiff('')).toEqual([])
  })

  it('round-trips any set of hunks written as a diff', () => {
    const hunks = fc
      .uniqueArray(fc.integer({ min: 1, max: 5000 }), { maxLength: 12 })
      .chain((starts) =>
        fc.tuple(
          fc.constant([...starts].sort((a, b) => a - b)),
          fc.array(fc.integer({ min: 0, max: 4 }), {
            minLength: starts.length,
            maxLength: starts.length,
          }),
        ),
      )
    fc.assert(
      fc.property(hunks, ([starts, counts]) => {
        const text = [
          'diff --git a/f.ts b/f.ts',
          '--- a/f.ts',
          '+++ b/f.ts',
          ...starts.map((s, i) => `@@ -${s},1 +${s},${counts[i]} @@`),
        ].join('\n')
        const expected = starts.flatMap((s, i) => {
          const n = counts[i] ?? 0
          return n === 0 ? [] : [{ start: s, end: s + n - 1 }]
        })
        expect(parseDiff(text)[0]?.ranges).toEqual(expected)
      }),
    )
  })

  it('marks exactly the lines a real git diff adds', () => {
    // Unique line contents make the longest common subsequence unambiguous,
    // so a minimal diff must mark exactly the lines that are new.
    const edit = fc
      .tuple(
        fc.array(fc.boolean(), { maxLength: 25 }),
        fc.array(fc.nat({ max: 30 }), { maxLength: 10 }),
      )
      .map(([keep, inserts]) => {
        const kept = keep.flatMap((isKept, i) => (isKept ? [`old ${i}`] : []))
        const withNew = inserts.reduce<ReadonlyArray<string>>((acc, at, n) => {
          const i = Math.min(at, acc.length)
          return [...acc.slice(0, i), `new ${n}`, ...acc.slice(i)]
        }, kept)
        return {
          before: keep.map((_, i) => `old ${i}`),
          after: withNew,
        }
      })
    const dir = mkdtempSync(join(tmpdir(), 'agent-lint-diff-'))
    fc.assert(
      fc.property(edit, ({ before, after }) => {
        const a = join(dir, 'before.ts')
        const b = join(dir, 'after.ts')
        writeFileSync(a, before.map((l) => `${l}\n`).join(''))
        writeFileSync(b, after.map((l) => `${l}\n`).join(''))
        const text = gitDiffNoIndex(a, b)
        const marked = linesOf(parseDiff(text)[0]?.ranges ?? [])
        const expected = after.flatMap((l, i) =>
          l.startsWith('new ') ? [i + 1] : [],
        )
        expect(marked).toEqual(expected)
      }),
      { numRuns: 60 },
    )
  })
})

const gitDiffNoIndex = (a: string, b: string): string => {
  try {
    return execFileSync(
      'git',
      ['diff', '--no-index', '--no-color', '--minimal', '-U0', a, b],
      { encoding: 'utf8' },
    )
  } catch (error) {
    // `git diff --no-index` exits 1 when the files differ.
    const out = stdoutOf(error)
    if (out !== undefined) return out
    throw error
  }
}
