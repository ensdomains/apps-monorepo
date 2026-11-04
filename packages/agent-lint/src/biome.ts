import { spawnSync } from 'node:child_process'
import type { Diagnostic } from './types.ts'

type Position = { readonly line?: number }
type ReportedDiagnostic = {
  readonly category?: string
  readonly message?: string
  readonly severity?: string
  readonly location?: {
    readonly path?: string
    readonly start?: Position
    readonly end?: Position
  }
}

export type CheckerRun = {
  readonly diagnostics: ReadonlyArray<Diagnostic>
  readonly errors: ReadonlyArray<string>
}

/** Our GritQL plugins start every message with `[plugin-id] `. */
const PLUGIN_MESSAGE = /^\[([a-z0-9-]+)\]\s*(.*)$/su

const toDiagnostic = (d: ReportedDiagnostic): Diagnostic | undefined => {
  const path = d.location?.path
  if (path === undefined) return undefined
  // Lines are 1-based; a whole-file diagnostic, such as a file name, reports line 0.
  const start = Math.max(1, d.location?.start?.line ?? 1)
  const end = Math.max(start, d.location?.end?.line ?? start)
  const category = d.category ?? 'unknown'
  const message = d.message ?? ''
  const plugin = category === 'plugin' ? PLUGIN_MESSAGE.exec(message) : null
  return {
    tool: 'biome',
    rule: plugin?.[1] === undefined ? category : `plugin/${plugin[1]}`,
    path,
    line: start,
    endLine: end,
    message: plugin?.[2] ?? message,
  }
}

const isReport = (
  value: unknown,
): value is { readonly diagnostics?: ReadonlyArray<ReportedDiagnostic> } =>
  typeof value === 'object' &&
  value !== null &&
  (!('diagnostics' in value) || Array.isArray(value.diagnostics))

/** Reads Biome's `--reporter=json` output; a diagnostic with no file is a tool error. */
export const parseBiomeReport = (text: string): CheckerRun => {
  const parsed: unknown = JSON.parse(text)
  if (!isReport(parsed)) {
    return {
      diagnostics: [],
      errors: ['biome printed something other than a JSON report'],
    }
  }
  const all = parsed.diagnostics ?? []
  return {
    diagnostics: all.flatMap((d) => {
      const diagnostic = toDiagnostic(d)
      return diagnostic === undefined ? [] : [diagnostic]
    }),
    errors: all.flatMap((d) =>
      toDiagnostic(d) === undefined
        ? [`${d.category ?? 'biome'}: ${d.message ?? ''}`]
        : [],
    ),
  }
}

const chunks = <T>(
  items: ReadonlyArray<T>,
  size: number,
): ReadonlyArray<ReadonlyArray<T>> =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  )

/** Runs Biome's linter with the agent configuration over files relative to `cwd`. */
export const runBiome = (opts: {
  readonly biome: string
  readonly config: string
  readonly cwd: string
  readonly files: ReadonlyArray<string>
}): CheckerRun =>
  chunks(opts.files, 200)
    .map((batch) => {
      const result = spawnSync(
        opts.biome,
        [
          'lint',
          `--config-path=${opts.config}`,
          '--reporter=json',
          '--max-diagnostics=none',
          '--colors=off',
          '--no-errors-on-unmatched',
          ...batch,
        ],
        { cwd: opts.cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
      )
      if (result.error !== undefined) {
        return {
          diagnostics: [],
          errors: [`biome did not start: ${result.error.message}`],
        }
      }
      try {
        return parseBiomeReport(result.stdout)
      } catch {
        return {
          diagnostics: [],
          errors: [
            `biome output was not a JSON report (exit ${result.status}): ${result.stderr.slice(0, 2000)}`,
          ],
        }
      }
    })
    .reduce<CheckerRun>(
      (acc, run) => ({
        diagnostics: [...acc.diagnostics, ...run.diagnostics],
        errors: [...acc.errors, ...run.errors],
      }),
      { diagnostics: [], errors: [] },
    )
