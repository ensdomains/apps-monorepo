import { dirname } from 'node:path'
import type { Finding } from './types.ts'

const REASON_NOTE: Readonly<Record<Finding['reason'], string>> = {
  'changed-line': '',
  'file-rule': ' (whole-file rule on a new or renamed file)',
  'count-rose':
    ' (off the changed lines, but this file has more of these than at the base)',
}

const UNTYPED_FOLDERS_SHOWN = 10

/** The files ESLint linted without type information, counted per folder. */
export type UntypedSummary = {
  readonly count: number
  readonly folders: ReadonlyArray<{
    readonly folder: string
    readonly count: number
  }>
  readonly files: ReadonlyArray<string>
}

/** Counts the untyped files per folder, the folder with most files first. */
export const summarizeUntyped = (
  files: ReadonlyArray<string>,
): UntypedSummary => ({
  count: files.length,
  folders: [...Map.groupBy(files, (file) => dirname(file))]
    .map(([folder, inFolder]) => ({ folder, count: inFolder.length }))
    .sort((a, b) => b.count - a.count || a.folder.localeCompare(b.folder)),
  files,
})

const untypedNotice = (files: ReadonlyArray<string>): ReadonlyArray<string> => {
  if (files.length === 0) return []
  const { folders } = summarizeUntyped(files)
  return [
    `agent-lint linted ${files.length} file(s) outside any tsconfig.json without type information: the ESLint rules that read types did not run on them.`,
    ...folders
      .slice(0, UNTYPED_FOLDERS_SHOWN)
      .map(({ folder, count }) => `  ${folder} (${count})`),
    ...(folders.length > UNTYPED_FOLDERS_SHOWN
      ? [`  and ${folders.length - UNTYPED_FOLDERS_SHOWN} more folder(s)`]
      : []),
  ]
}

/** The plain-text report an agent reads after a run. */
export const formatReport = (input: {
  readonly base: string
  readonly checked: number
  readonly findings: ReadonlyArray<Finding>
  readonly errors: ReadonlyArray<string>
  readonly untyped: ReadonlyArray<string>
}): string => {
  const byPath = Map.groupBy(input.findings, (f) => f.path)
  const head =
    input.findings.length === 0
      ? `agent-lint: no new problems in ${input.checked} changed file(s) since ${input.base.slice(0, 9)}.`
      : `agent-lint: ${input.findings.length} new problem(s) in ${byPath.size} file(s) since ${input.base.slice(0, 9)}.`
  const body = [...byPath.entries()].flatMap(([path, findings]) => [
    '',
    path,
    ...findings.map(
      (f) =>
        `  ${String(f.line).padStart(5)}  ${f.rule}  ${f.message.split('\n')[0] ?? ''}${REASON_NOTE[f.reason]}${f.note === undefined ? '' : ` [${f.note}]`}`,
    ),
  ])
  const errors =
    input.errors.length === 0
      ? []
      : [
          '',
          'agent-lint could not finish a check:',
          ...input.errors.map((e) => `  ${e}`),
        ]
  const footer =
    input.findings.length === 0
      ? []
      : [
          '',
          'Fix these, or suppress one with its reason on the line above it:',
          '  // biome-ignore lint/<group>/<rule>: <reason>   (Biome rules)',
          '  // biome-ignore lint/plugin: <reason>           (agent-lint plugins)',
          '  // eslint-disable-next-line <rule> -- <reason>   (ESLint rules)',
          'Compiler findings (TS codes) cannot be suppressed: handle the possibly undefined value,',
          "  for example `const [first = fallback] = list`, `list.at(0)` or `match?.[1] ?? ''`.",
        ]
  return [
    head,
    ...untypedNotice(input.untyped),
    ...body,
    ...errors,
    ...footer,
  ].join('\n')
}
