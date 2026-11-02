import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import ts from 'typescript'
import type { CheckerRun } from './biome.ts'
import { selectNew } from './filter.ts'
import { outputOf } from './process.ts'
import { isTestLike } from './testLike.ts'
import type { ChangedFile, Diagnostic } from './types.ts'

/**
 * Compiler settings agents are held to in every package, whatever the
 * package's own tsconfig says. The TypeScript README lists them as the
 * repo's strictness baseline. A package whose tsconfig already sets them is
 * not compiled here: the strict run would print what its own settings print.
 * Unused code and switch fall-through are left to Biome, which already
 * reports them.
 */
export const STRICT_FLAGS: ReadonlyArray<string> = [
  '--noUncheckedIndexedAccess',
]

const ERROR_LINE = /^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/u

/** Reads `tsc --pretty false` output; continuation lines are dropped. */
export const parseTscOutput = (
  output: string,
  packagePath: string,
): ReadonlyArray<Diagnostic> =>
  output.split('\n').flatMap((line): ReadonlyArray<Diagnostic> => {
    const match = ERROR_LINE.exec(line)
    if (match === null) return []
    const [, file = '', lineNumber = '0', code = '', message = ''] = match
    const at = Number(lineNumber)
    return [
      {
        tool: 'tsc',
        rule: code,
        path: join(packagePath, file),
        line: at,
        endLine: at,
        message,
      },
    ]
  })

/** Errors the strict run has that the package's own settings do not produce. */
export const addedByFlags = (
  plain: ReadonlyArray<Diagnostic>,
  strict: ReadonlyArray<Diagnostic>,
): ReadonlyArray<Diagnostic> => {
  const key = (d: Diagnostic) => `${d.path}:${d.line}:${d.rule}:${d.message}`
  const before = new Set(plain.map(key))
  return strict.filter((d) => !before.has(key(d)))
}

/** The nearest folder above `file` holding both a package.json and a tsconfig.json. */
export const packageOf = (root: string, file: string): string | undefined => {
  const walk = (dir: string): string | undefined => {
    if (
      existsSync(join(root, dir, 'package.json')) &&
      existsSync(join(root, dir, 'tsconfig.json'))
    ) {
      return dir
    }
    return dir === '.' || dir === '' ? undefined : walk(dirname(dir))
  }
  return walk(dirname(file))
}

/**
 * The compiler options a package's tsconfig.json ends up with, `extends`
 * included. Only the options are read: no file is listed or opened.
 */
export const configuredOptions = (configPath: string): ts.CompilerOptions => {
  const read = ts.readConfigFile(configPath, ts.sys.readFile)
  if (read.error !== undefined) return {}
  return ts.parseJsonConfigFileContent(
    read.config,
    { ...ts.sys, readDirectory: () => [] },
    dirname(configPath),
    undefined,
    configPath,
  ).options
}

/** Whether the options already hold every strict flag, so the flags add no error. */
export const setsStrictFlags = (options: ts.CompilerOptions): boolean =>
  STRICT_FLAGS.every((flag) => options[flag.replace(/^--/u, '')] === true)

/**
 * Whether the plain run is needed. The plain run only takes errors away from
 * the strict run, and the report keeps only what sits on a changed line of a
 * file that is not a test, so a strict run with nothing there has nothing left
 * to take away from.
 */
export const needsPlainRun = (
  strict: ReadonlyArray<Diagnostic>,
  changed: ReadonlyArray<ChangedFile>,
): boolean =>
  selectNew({
    diagnostics: strict.filter((d) => !isTestLike(d.path)),
    changed,
    fileLevelRules: new Set(),
  }).length > 0

const checkPackage = async (
  root: string,
  packagePath: string,
  changed: ReadonlyArray<ChangedFile>,
): Promise<CheckerRun> => {
  const dir = join(root, packagePath)
  if (setsStrictFlags(configuredOptions(join(dir, 'tsconfig.json')))) {
    return { diagnostics: [], errors: [] }
  }
  const tsc = join(dir, 'node_modules', 'typescript', 'bin', 'tsc')
  if (!existsSync(tsc)) {
    return {
      diagnostics: [],
      errors: [`no TypeScript compiler installed in ${packagePath}`],
    }
  }
  const base = [tsc, '-p', 'tsconfig.json', '--noEmit', '--pretty', 'false']
  const strict = parseTscOutput(
    await outputOf(process.execPath, [...base, ...STRICT_FLAGS], dir),
    packagePath,
  )
  if (!needsPlainRun(strict, changed)) return { diagnostics: [], errors: [] }
  const plain = parseTscOutput(
    await outputOf(process.execPath, base, dir),
    packagePath,
  )
  return { diagnostics: addedByFlags(plain, strict), errors: [] }
}

/**
 * Type-checks each package that holds a changed TypeScript file with the
 * strict flags: the strict run first, and the plain run only when the strict
 * run reports an error on a changed line. A package that already sets the
 * flags is not compiled.
 */
export const runStrictTsc = async (opts: {
  readonly root: string
  readonly changed: ReadonlyArray<ChangedFile>
}): Promise<CheckerRun> => {
  const packages = [
    ...new Set(
      opts.changed
        .map((f) => f.path)
        .filter((f) => /\.[cm]?tsx?$/u.test(f))
        .flatMap((f) => {
          const pkg = packageOf(opts.root, f)
          return pkg === undefined ? [] : [pkg]
        }),
    ),
  ]
  const runs = await Promise.all(
    packages.map((p) => checkPackage(opts.root, p, opts.changed)),
  )
  const found = runs
    .flatMap((r) => r.diagnostics)
    .filter((d) => !isTestLike(d.path))
  return {
    // The same error can be printed twice for one location.
    diagnostics: [
      ...new Map(
        found.map((d) => [`${d.path}:${d.line}:${d.rule}`, d]),
      ).values(),
    ],
    errors: runs.flatMap((r) => r.errors),
  }
}
