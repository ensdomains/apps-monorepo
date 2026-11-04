import { join, relative } from 'node:path'
import { ESLint, type Linter } from 'eslint'
import type { CheckerRun } from './biome.ts'
import { eslintConfig, untypedEslintConfig } from './eslintConfig.ts'
import { splitByTsconfig } from './tsconfigCoverage.ts'
import type { Diagnostic } from './types.ts'

const TYPED = /\.[cm]?tsx?$/u

/** A file outside every tsconfig has no type information to check against. */
const NOT_IN_A_PROJECT = /was not found by the project service|not included in/u

/** A disable comment for a rule this config does not load is not the change's problem. */
const UNKNOWN_RULE = /^Definition for rule '.+' was not found\.?$/u

/**
 * prefer-query-options also asks for a factory around one-element scope keys
 * used for invalidation, which the STYLEGUIDE writes inline itself.
 */
const SKIPPED_MESSAGES: ReadonlySet<string> = new Set([
  '@tanstack/query/prefer-query-options:preferQueryOptionsQueryKey',
])

/** What the ESLint step found, and the files it linted without type information. */
export type EslintRun = CheckerRun & {
  /**
   * TypeScript files that no tsconfig.json covers (repo-relative). ESLint
   * reads types through a tsconfig, and for a file outside every one the
   * project service rebuilds every program it holds before it gives up. These
   * get the rules that need no types.
   */
  readonly untyped: ReadonlyArray<string>
}

const toRun = (
  root: string,
  results: ReadonlyArray<ESLint.LintResult>,
): EslintRun => {
  const messages = results.flatMap((result) =>
    result.messages.map((message) => ({
      path: relative(root, result.filePath),
      message,
    })),
  )
  return {
    diagnostics: messages.flatMap(
      ({ path, message }): ReadonlyArray<Diagnostic> =>
        message.fatal === true ||
        message.ruleId === null ||
        UNKNOWN_RULE.test(message.message) ||
        SKIPPED_MESSAGES.has(`${message.ruleId}:${message.messageId ?? ''}`)
          ? []
          : [
              {
                tool: 'eslint',
                rule: message.ruleId,
                path,
                line: message.line,
                endLine: Math.max(
                  message.line,
                  message.endLine ?? message.line,
                ),
                message: message.message,
              },
            ],
    ),
    errors: messages.flatMap(({ path, message }) =>
      message.fatal === true && !NOT_IN_A_PROJECT.test(message.message)
        ? [`eslint could not parse ${path}: ${message.message}`]
        : [],
    ),
    // A file the project service rejects after all has no types either.
    untyped: messages.flatMap(({ path, message }) =>
      message.fatal === true && NOT_IN_A_PROJECT.test(message.message)
        ? [path]
        : [],
    ),
  }
}

/** Drops the files the config tells ESLint to ignore, which it would skip without a word. */
const withoutIgnored = async (
  eslint: ESLint,
  root: string,
  files: ReadonlyArray<string>,
): Promise<ReadonlyArray<string>> => {
  const ignored = await Promise.all(
    files.map((file) => eslint.isPathIgnored(join(root, file))),
  )
  return files.filter((_, index) => ignored[index] !== true)
}

const eslintWith = (
  root: string,
  config: ReadonlyArray<Linter.Config>,
): ESLint =>
  new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [...config],
    errorOnUnmatchedPattern: false,
    warnIgnored: false,
  })

/** ESLint refuses an empty list of files. */
const lint = async (
  eslint: ESLint,
  files: ReadonlyArray<string>,
): Promise<ReadonlyArray<ESLint.LintResult>> =>
  files.length === 0 ? [] : eslint.lintFiles([...files])

/**
 * Runs the agent ESLint rules over the TypeScript files among `files`: with
 * types on those a tsconfig.json covers, then without types, and without the
 * rules that read them, on the rest, which come back in `untyped`.
 */
export const runEslint = async (opts: {
  readonly root: string
  readonly files: ReadonlyArray<string>
}): Promise<EslintRun> => {
  const typed = opts.files.filter((f) => TYPED.test(f))
  if (typed.length === 0) return { diagnostics: [], errors: [], untyped: [] }
  const eslint = eslintWith(opts.root, eslintConfig(opts.root))
  const { covered, uncovered } = splitByTsconfig(
    opts.root,
    await withoutIgnored(eslint, opts.root, typed),
  )
  const withTypes = toRun(opts.root, await lint(eslint, covered))
  const untyped = [...new Set([...uncovered, ...withTypes.untyped])]
  const withoutTypes = toRun(
    opts.root,
    await lint(eslintWith(opts.root, untypedEslintConfig(opts.root)), untyped),
  )
  return {
    diagnostics: [...withTypes.diagnostics, ...withoutTypes.diagnostics],
    errors: [...withTypes.errors, ...withoutTypes.errors],
    untyped,
  }
}
