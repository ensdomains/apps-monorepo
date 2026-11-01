import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { packageDir } from '../src/paths.ts'

const git = (root: string, args: ReadonlyArray<string>): string =>
  execFileSync(
    'git',
    [
      '-C',
      root,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'core.hooksPath=/dev/null',
      ...args,
    ],
    { encoding: 'utf8' },
  ).trim()

const write = (root: string, files: Readonly<Record<string, string>>): void => {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
}

type Report = {
  readonly findings: ReadonlyArray<{
    readonly path: string
    readonly rule: string
  }>
  readonly errors: ReadonlyArray<string>
  readonly untyped: unknown
}

/** A repo holding `files` in one commit, which is the `base` to measure from. */
const commitRepo = (
  files: Readonly<Record<string, string>>,
): { readonly root: string; readonly base: string } => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'agent-lint-cli-')))
  git(root, ['init', '--quiet'])
  write(root, files)
  git(root, ['add', '--all'])
  git(root, ['commit', '--quiet', '--message', 'base'])
  return { root, base: git(root, ['rev-parse', 'HEAD']) }
}

/** Runs the command on `root`, measuring the working tree from `base`. */
const runCli = (root: string, base: string): Report => {
  const run = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--disable-warning=ExperimentalWarning',
      join(packageDir, 'src', 'cli.ts'),
      '--repo',
      root,
      '--base',
      base,
      '--json',
    ],
    { encoding: 'utf8' },
  )
  const report: Report = JSON.parse(run.stdout)
  return report
}

describe('agent-lint command', () => {
  it('lints a file outside every tsconfig without types, and prints their count and folders', () => {
    const { root, base } = commitRepo({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
        },
        include: ['src'],
        exclude: ['**/*.test.ts'],
      }),
      'src/base.ts': 'export const BASE = 1\n',
    })
    const unprefixed =
      'declare const count: number\nexport const big = count > 10\n'
    write(root, {
      'src/flags.ts': unprefixed,
      'src/flags.test.ts': `${unprefixed}screen.getByTestId('row')\n`,
      'vitest.config.ts': `${unprefixed}export const loose: any = 1\n`,
    })

    const report = runCli(root, base)

    const found = report.findings.map((f) => [f.path, f.rule])
    expect(report.errors).toEqual([])
    // A covered file is linted with types.
    expect(found).toContainEqual([
      'src/flags.ts',
      '@typescript-eslint/naming-convention',
    ])
    // A file outside every tsconfig gets the ESLint rules that need no types, and Biome.
    expect(found).toContainEqual([
      'src/flags.test.ts',
      'agent/no-foreign-testid',
    ])
    expect(found).toContainEqual([
      'vitest.config.ts',
      'lint/suspicious/noExplicitAny',
    ])
    expect(found).not.toContainEqual([
      'vitest.config.ts',
      '@typescript-eslint/naming-convention',
    ])
    expect(report.untyped).toEqual({
      count: 2,
      folders: [
        { folder: '.', count: 1 },
        { folder: 'src', count: 1 },
      ],
      files: ['src/flags.test.ts', 'vitest.config.ts'],
    })
  })
})

describe('agent/no-throw and the invariant helper', () => {
  const INVARIANT = 'packages/utils/src/invariant.ts'
  const BARE_THROW = 'apps/portal/src/features/fail.ts'

  /** Lints a change that adds a bare throw to the Portal, in a repo that does or does not hold invariant. */
  const lintBareThrow = (hasInvariant: boolean): Report => {
    const { root, base } = commitRepo({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
        },
        include: ['apps', 'packages'],
      }),
      'apps/portal/src/features/base.ts': 'export const BASE = 1\n',
      ...(hasInvariant
        ? {
            [INVARIANT]:
              'export const invariant = (condition: boolean, message: string): void => {\n  if (!condition) throw new Error(message)\n}\n',
          }
        : {}),
    })
    write(root, {
      [BARE_THROW]:
        "export const fail = (): never => {\n  throw new Error('boom')\n}\n",
    })
    return runCli(root, base)
  }

  const noThrowPaths = (report: Report): ReadonlyArray<string> =>
    report.findings
      .filter((f) => f.rule === 'agent/no-throw')
      .map((f) => f.path)

  it('reports a bare throw in the Portal when packages/utils has invariant', () => {
    const report = lintBareThrow(true)

    expect(report.errors).toEqual([])
    expect(noThrowPaths(report)).toEqual([BARE_THROW])
  })

  it('reports nothing for the same change in a checkout without invariant, and lints no file without types', () => {
    const report = lintBareThrow(false)

    expect(report.errors).toEqual([])
    expect(report.untyped).toEqual({ count: 0, folders: [], files: [] })
    expect(report.findings).toEqual([])
  })
})
