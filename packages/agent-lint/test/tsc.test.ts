import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { selectNew } from '../src/filter.ts'
import {
  addedByFlags,
  configuredOptions,
  needsPlainRun,
  packageOf,
  parseTscOutput,
  runStrictTsc,
  setsStrictFlags,
} from '../src/tsc.ts'
import type { ChangedFile, Diagnostic } from '../src/types.ts'

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

/** Writes `files` (path to text) under a fresh folder and returns the folder. */
const folderWith = (files: Readonly<Record<string, string>>): string => {
  const root = mkdtempSync(join(tmpdir(), 'agent-lint-tsc-'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

describe('setsStrictFlags', () => {
  const flagsOf = (files: Readonly<Record<string, string>>): boolean => {
    const root = folderWith(files)
    return setsStrictFlags(configuredOptions(join(root, 'tsconfig.json')))
  }

  it('is true when the tsconfig sets the flag, comments and all', () => {
    expect(
      flagsOf({
        'tsconfig.json':
          '{ // strict\n "compilerOptions": { "noUncheckedIndexedAccess": true } }',
      }),
    ).toBe(true)
  })

  it('is true when a config it extends sets the flag', () => {
    expect(
      flagsOf({
        'base.json':
          '{ "compilerOptions": { "noUncheckedIndexedAccess": true } }',
        'tsconfig.json': '{ "extends": "./base.json" }',
      }),
    ).toBe(true)
  })

  it('is false when the flag is off, when it is missing and when the config is unreadable', () => {
    expect(
      flagsOf({
        'tsconfig.json':
          '{ "compilerOptions": { "noUncheckedIndexedAccess": false } }',
      }),
    ).toBe(false)
    expect(flagsOf({ 'tsconfig.json': '{ "compilerOptions": {} }' })).toBe(
      false,
    )
    expect(flagsOf({ 'other.json': '{}' })).toBe(false)
  })

  it('lets the extending config switch the flag off again', () => {
    expect(
      flagsOf({
        'base.json':
          '{ "compilerOptions": { "noUncheckedIndexedAccess": true } }',
        'tsconfig.json':
          '{ "extends": "./base.json", "compilerOptions": { "noUncheckedIndexedAccess": false } }',
      }),
    ).toBe(false)
  })
})

const strictError = (
  path: string,
  line: number,
  message = "Object is possibly 'undefined'.",
): Diagnostic => ({
  tool: 'tsc',
  rule: 'TS2532',
  path,
  line,
  endLine: line,
  message,
})

const modified = (path: string, start: number, end: number): ChangedFile => ({
  path,
  status: 'modified',
  ranges: [{ start, end }],
})

describe('needsPlainRun', () => {
  const changed = [modified('apps/portal/src/a.ts', 10, 12)]

  it('is needed when the strict run reports an error on a changed line', () => {
    expect(
      needsPlainRun([strictError('apps/portal/src/a.ts', 11)], changed),
    ).toBe(true)
  })

  it('is not needed when the errors sit off the changed lines, in other files or in tests', () => {
    expect(needsPlainRun([], changed)).toBe(false)
    expect(
      needsPlainRun([strictError('apps/portal/src/a.ts', 13)], changed),
    ).toBe(false)
    expect(
      needsPlainRun([strictError('apps/portal/src/b.ts', 11)], changed),
    ).toBe(false)
    expect(
      needsPlainRun(
        [strictError('apps/portal/src/a.test.ts', 11)],
        [modified('apps/portal/src/a.test.ts', 10, 12)],
      ),
    ).toBe(false)
  })

  it('never skips a plain run that could still take a reported error away', () => {
    const paths = ['apps/a/src/x.ts', 'apps/a/src/y.ts', 'apps/a/src/x.test.ts']
    const error = fc
      .record({
        path: fc.constantFrom(...paths),
        line: fc.integer({ min: 1, max: 20 }),
        message: fc.constantFrom('one', 'two'),
      })
      .map(({ path, line, message }) => strictError(path, line, message))
    const file = fc
      .record({
        path: fc.constantFrom(...paths),
        start: fc.integer({ min: 1, max: 20 }),
        length: fc.integer({ min: 0, max: 5 }),
      })
      .map(({ path, start, length }) => modified(path, start, start + length))
    fc.assert(
      fc.property(
        fc.array(error, { maxLength: 12 }),
        fc.array(error, { maxLength: 12 }),
        fc.array(file, { maxLength: 4 }),
        (strict, plain, changedFiles) => {
          const reported = (explained: ReadonlyArray<Diagnostic>) =>
            selectNew({
              diagnostics: addedByFlags(explained, strict).filter(
                (d) => !d.path.endsWith('.test.ts'),
              ),
              changed: changedFiles,
              fileLevelRules: new Set(),
            })
          // Whatever the plain run would print, nothing would be reported.
          if (!needsPlainRun(strict, changedFiles)) {
            expect(reported(plain)).toEqual([])
          }
          // And when it is needed, an empty plain run can leave something.
          if (needsPlainRun(strict, changedFiles)) {
            expect(reported([])).not.toEqual([])
          }
        },
      ),
    )
  })
})

describe('runStrictTsc', () => {
  const PATH = 'apps/pkg/src/a.ts'
  const STRICT_ERROR =
    "src/a.ts(3,5): error TS2532: Object is possibly 'undefined'.\n"

  /** A repo with one package whose compiler is a stub that logs each run and prints canned errors. */
  const repoWith = (opts: {
    readonly flag: boolean
    readonly strictOutput: string
    readonly plainOutput: string
    readonly withCompiler?: boolean
  }): { readonly root: string; readonly log: string } => {
    const root = folderWith({
      'apps/pkg/package.json': '{}',
      'apps/pkg/tsconfig.json': JSON.stringify({
        compilerOptions: opts.flag ? { noUncheckedIndexedAccess: true } : {},
      }),
    })
    const log = join(root, 'compiler-runs.log')
    if (opts.withCompiler !== false) {
      const bin = join(root, 'apps/pkg/node_modules/typescript/bin')
      mkdirSync(bin, { recursive: true })
      writeFileSync(
        join(bin, 'tsc'),
        [
          "const { appendFileSync } = require('node:fs')",
          "const strict = process.argv.includes('--noUncheckedIndexedAccess')",
          `appendFileSync(${JSON.stringify(log)}, \`\${strict ? 'strict' : 'plain'}\\n\`)`,
          `process.stdout.write(strict ? ${JSON.stringify(opts.strictOutput)} : ${JSON.stringify(opts.plainOutput)})`,
        ].join('\n'),
      )
    }
    return { root, log }
  }

  const runsIn = (log: string): ReadonlyArray<string> =>
    existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []

  it('does not start the compiler for a package that already sets the flag', async () => {
    const { root, log } = repoWith({
      flag: true,
      strictOutput: STRICT_ERROR,
      plainOutput: STRICT_ERROR,
      withCompiler: false,
    })
    const run = await runStrictTsc({ root, changed: [modified(PATH, 3, 3)] })
    expect(run).toEqual({ diagnostics: [], errors: [] })
    expect(runsIn(log)).toEqual([])
  })

  it('runs the strict compile alone when it reports nothing on a changed line', async () => {
    const { root, log } = repoWith({
      flag: false,
      strictOutput: STRICT_ERROR,
      plainOutput: '',
    })
    const run = await runStrictTsc({ root, changed: [modified(PATH, 40, 41)] })
    expect(run).toEqual({ diagnostics: [], errors: [] })
    expect(runsIn(log)).toEqual(['strict'])
  })

  it('adds the plain compile when the strict one reports on a changed line, and reports only what the flags add', async () => {
    const added = repoWith({
      flag: false,
      strictOutput: STRICT_ERROR,
      plainOutput: '',
    })
    const run = await runStrictTsc({
      root: added.root,
      changed: [modified(PATH, 3, 3)],
    })
    expect(runsIn(added.log)).toEqual(['strict', 'plain'])
    expect(run.diagnostics.map((d) => `${d.path}:${d.line} ${d.rule}`)).toEqual(
      ['apps/pkg/src/a.ts:3 TS2532'],
    )

    const already = repoWith({
      flag: false,
      strictOutput: STRICT_ERROR,
      plainOutput: STRICT_ERROR,
    })
    const quiet = await runStrictTsc({
      root: already.root,
      changed: [modified(PATH, 3, 3)],
    })
    expect(runsIn(already.log)).toEqual(['strict', 'plain'])
    expect(quiet.diagnostics).toEqual([])
  })
})
