import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { CheckerRun } from './biome.ts'
import { outputOf } from './process.ts'
import { isTestLike } from './testLike.ts'
import type { Diagnostic } from './types.ts'

/**
 * Compiler settings agents are held to in every package, whatever the
 * package's own tsconfig says. The TypeScript README lists them as the
 * repo's strictness baseline; only three of the nineteen tsconfigs set
 * noUncheckedIndexedAccess today. Unused code and switch fall-through are
 * left to Biome, which already reports them.
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

const checkPackage = async (
  root: string,
  packagePath: string,
): Promise<CheckerRun> => {
  const dir = join(root, packagePath)
  const tsc = join(dir, 'node_modules', 'typescript', 'bin', 'tsc')
  if (!existsSync(tsc)) {
    return {
      diagnostics: [],
      errors: [`no TypeScript compiler installed in ${packagePath}`],
    }
  }
  const base = [tsc, '-p', 'tsconfig.json', '--noEmit', '--pretty', 'false']
  const [plain, strict] = await Promise.all([
    outputOf(process.execPath, base, dir),
    outputOf(process.execPath, [...base, ...STRICT_FLAGS], dir),
  ])
  return {
    diagnostics: addedByFlags(
      parseTscOutput(plain, packagePath),
      parseTscOutput(strict, packagePath),
    ),
    errors: [],
  }
}

/** Type-checks each package that holds a changed TypeScript file with the strict flags. */
export const runStrictTsc = async (opts: {
  readonly root: string
  readonly files: ReadonlyArray<string>
}): Promise<CheckerRun> => {
  const packages = [
    ...new Set(
      opts.files
        .filter((f) => /\.[cm]?tsx?$/u.test(f))
        .flatMap((f) => {
          const pkg = packageOf(opts.root, f)
          return pkg === undefined ? [] : [pkg]
        }),
    ),
  ]
  const runs = await Promise.all(
    packages.map((p) => checkPackage(opts.root, p)),
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
