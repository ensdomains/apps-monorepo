import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { ESLint, type Linter } from 'eslint'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type EslintRun, runEslint } from '../src/eslint.ts'

/** A boolean named `big` breaks the boolean-prefix rule, which needs types. */
const UNPREFIXED_BOOLEAN =
  'declare const count: number\nexport const big = count > 10\n'

/** A test id the file never renders breaks a test rule, which needs no types. */
const FOREIGN_TESTID = "screen.getByTestId('row')\n"

/** A catch that drops its error breaks a source rule, which needs no types. */
const SILENT_CATCH =
  'export const read = (text: string) => {\n  try {\n    return JSON.parse(text)\n  } catch {\n    return null\n  }\n}\n'

/** Breaks one rule that needs types and one that does not. */
const MIXED = UNPREFIXED_BOOLEAN + SILENT_CATCH

/**
 * In the Portal, where every rule that reads types applies to a non-test file.
 * The React rule asks for types only in a file that holds `&&`.
 */
const PORTAL_TOOL = [
  MIXED,
  "export const fail = (): never => {\n  throw new Error('boom')\n}\n",
  'declare const wei: bigint\nexport const gwei = Number(wei)\n',
  'export const both = (isOn: boolean, isOk: boolean) => isOn && isOk\n',
].join('')

/** What the project service answers for a file that no tsconfig lists. */
const NOT_FOUND: Linter.LintMessage = {
  ruleId: null,
  severity: 2,
  fatal: true,
  line: 1,
  column: 1,
  message: 'Parsing error: src/mixed.ts was not found by the project service.',
}

/** A package whose tsconfig lists src and leaves tests out, like transaction-manager. */
const repo = (): string => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'agent-lint-eslint-')))
  const files: Readonly<Record<string, string>> = {
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
    'src/flags.ts': UNPREFIXED_BOOLEAN,
    'src/mixed.ts': MIXED,
    'src/flags.test.ts': UNPREFIXED_BOOLEAN,
    'src/ids.test.ts': FOREIGN_TESTID,
    'vitest.config.ts': MIXED,
    'apps/portal/tools/build.ts': PORTAL_TOOL,
    'tools/types.gen.ts': 'export type Generated = string\n',
  }
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

const found = (run: EslintRun): ReadonlyArray<string> =>
  run.diagnostics.map((d) => `${d.path} ${d.rule}`).toSorted()

afterEach(() => {
  vi.restoreAllMocks()
})

describe('runEslint', () => {
  it('lints a file outside every tsconfig without type information, after the covered files with it', async () => {
    const lint = vi.spyOn(ESLint.prototype, 'lintFiles')
    const run = await runEslint({
      root: repo(),
      files: ['src/flags.ts', 'src/ids.test.ts', 'vitest.config.ts'],
    })
    expect(lint.mock.calls).toEqual([
      [['src/flags.ts']],
      [['src/ids.test.ts', 'vitest.config.ts']],
    ])
    expect(found(run)).toEqual([
      'src/flags.ts @typescript-eslint/naming-convention',
      'src/ids.test.ts agent/no-foreign-testid',
      'vitest.config.ts agent/no-silent-fallback',
    ])
    expect(run.untyped).toEqual(['src/ids.test.ts', 'vitest.config.ts'])
    expect(run.errors).toEqual([])
  })

  it('runs none of the rules that read types on a file with no types', async () => {
    const run = await runEslint({
      root: repo(),
      files: ['apps/portal/tools/build.ts'],
    })
    expect(found(run)).toEqual([
      'apps/portal/tools/build.ts agent/no-silent-fallback',
    ])
    expect(run.errors).toEqual([])
  })

  it('lints with types only, in one pass, when every file is covered', async () => {
    const lint = vi.spyOn(ESLint.prototype, 'lintFiles')
    const run = await runEslint({ root: repo(), files: ['src/flags.ts'] })
    expect(lint.mock.calls).toEqual([[['src/flags.ts']]])
    expect(run.untyped).toEqual([])
  })

  it('lints without types only, in one pass, when no file is covered', async () => {
    const lint = vi.spyOn(ESLint.prototype, 'lintFiles')
    const run = await runEslint({ root: repo(), files: ['vitest.config.ts'] })
    expect(lint.mock.calls).toEqual([[['vitest.config.ts']]])
    expect(found(run)).toEqual(['vitest.config.ts agent/no-silent-fallback'])
    expect(run.untyped).toEqual(['vitest.config.ts'])
  })

  it('still lints a file a tsconfig lists, with types', async () => {
    const run = await runEslint({
      root: repo(),
      files: ['src/flags.ts', 'src/flags.test.ts'],
    })
    expect(run.diagnostics.map((d) => [d.path, d.rule])).toEqual([
      ['src/flags.ts', '@typescript-eslint/naming-convention'],
    ])
  })

  it('lints a file the project service rejects after all without types, and does not drop it', async () => {
    const lintFiles = ESLint.prototype.lintFiles
    vi.spyOn(ESLint.prototype, 'lintFiles').mockImplementationOnce(
      async function (this: ESLint, files) {
        const results = await lintFiles.call(this, files)
        return results.map((result) => ({ ...result, messages: [NOT_FOUND] }))
      },
    )
    const run = await runEslint({ root: repo(), files: ['src/mixed.ts'] })
    expect(found(run)).toEqual(['src/mixed.ts agent/no-silent-fallback'])
    expect(run.untyped).toEqual(['src/mixed.ts'])
    expect(run.errors).toEqual([])
  })

  it('does not count a file that ESLint ignores as untyped', async () => {
    const lint = vi.spyOn(ESLint.prototype, 'lintFiles')
    const run = await runEslint({
      root: repo(),
      files: ['tools/types.gen.ts'],
    })
    expect(lint).not.toHaveBeenCalled()
    expect(run.untyped).toEqual([])
  })

  it('has nothing to run for files that are not TypeScript', async () => {
    expect(await runEslint({ root: repo(), files: ['package.json'] })).toEqual({
      diagnostics: [],
      errors: [],
      untyped: [],
    })
  })
})
