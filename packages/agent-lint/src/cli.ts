import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { type CheckerRun, runBiome } from './biome.ts'
import { runEslint } from './eslint.ts'
import { countKey, selectNew, toolPathKey } from './filter.ts'
import { changedFiles, fileAt, repoRoot, resolveBase } from './git.ts'
import { biomeBin } from './paths.ts'
import { withPrerequisites } from './prerequisites.ts'
import { formatReport, summarizeUntyped } from './report.ts'
import { runtimeBiomeConfig } from './runtimeConfig.ts'
import { checkText } from './text.ts'
import { runStrictTsc } from './tsc.ts'
import type { BaseCounts, ChangedFile } from './types.ts'

const USAGE = `Usage: agent-lint [--repo <dir>] [--base <ref>] [--json]

Checks the lines a change adds or modifies against the agent rules.
  --repo  the checkout to check (default: the current directory)
  --base  the branch or commit the change is measured from (default: origin/main);
          the check starts where HEAD split from it
  --json  print the findings as JSON instead of text`

const LINTABLE = /\.(?:[cm]?[jt]sx?|jsonc?|css|graphql)$/u

/** Rules that judge a whole file, so they apply to every added or renamed file. */
const FILE_LEVEL_RULES: ReadonlySet<string> = new Set([
  'lint/style/useFilenamingConvention',
])

/** Writes each file's base version under a scratch folder at its new path. */
const writeBaseCopies = (
  root: string,
  base: string,
  files: ReadonlyArray<ChangedFile>,
): { readonly dir: string; readonly paths: ReadonlyArray<string> } => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-lint-base-'))
  const paths = files.flatMap((file) => {
    const content = fileAt(root, base, file.oldPath ?? file.path)
    if (content === undefined) return []
    const target = join(dir, file.path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
    return [file.path]
  })
  return { dir, paths }
}

const baseCounts = (
  run: CheckerRun,
  measuredPaths: ReadonlyArray<string>,
): BaseCounts => ({
  measured: new Set(measuredPaths.map((p) => toolPathKey('biome', p))),
  counts: new Map(
    [...Map.groupBy(run.diagnostics, countKey)].map(([key, ds]) => [
      key,
      ds.length,
    ]),
  ),
})

const main = async (): Promise<number> => {
  const { values } = parseArgs({
    options: {
      repo: { type: 'string' },
      base: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  })
  if (values.help) {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }
  const root = repoRoot(resolve(values.repo ?? process.cwd()))
  const base = resolveBase(root, values.base)
  const changed = changedFiles(root, base).filter((f) => LINTABLE.test(f.path))
  const paths = changed.map((f) => f.path)
  const biomeConfigPath = runtimeBiomeConfig()

  const head = runBiome({
    biome: biomeBin,
    config: biomeConfigPath,
    cwd: root,
    files: paths,
  })
  const earlier = changed.filter((f) => f.status !== 'added')
  const copies = writeBaseCopies(root, base, earlier)
  const atBase = runBiome({
    biome: biomeBin,
    config: biomeConfigPath,
    cwd: copies.dir,
    files: copies.paths,
  })
  const text = changed.flatMap((f) =>
    /\.[cm]?[jt]sx?$/u.test(f.path) && existsSync(join(root, f.path))
      ? checkText(f.path, readFileSync(join(root, f.path), 'utf8'))
      : [],
  )
  const [eslint, strict] = await Promise.all([
    runEslint({ root, files: paths }),
    runStrictTsc({ root, files: paths }),
  ])

  const exists = (path: string): boolean => existsSync(join(root, path))
  const findings = selectNew({
    diagnostics: withPrerequisites(
      [
        ...head.diagnostics,
        ...eslint.diagnostics,
        ...strict.diagnostics,
        ...text,
      ],
      exists,
    ),
    changed,
    fileLevelRules: FILE_LEVEL_RULES,
    base: baseCounts(
      { ...atBase, diagnostics: withPrerequisites(atBase.diagnostics, exists) },
      copies.paths,
    ),
  })
  const errors = [
    ...head.errors,
    ...atBase.errors,
    ...eslint.errors,
    ...strict.errors,
  ]
  const summary = { base, checked: changed.length, findings, errors }
  process.stdout.write(
    values.json
      ? `${JSON.stringify({ ...summary, untyped: summarizeUntyped(eslint.untyped) }, null, 2)}\n`
      : `${formatReport({ ...summary, untyped: eslint.untyped })}\n`,
  )
  if (errors.length > 0) return 2
  return findings.length > 0 ? 1 : 0
}

process.exitCode = await main()
