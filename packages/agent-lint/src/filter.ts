import type {
  BaseCounts,
  ChangedFile,
  Diagnostic,
  Finding,
  LineRange,
  Tool,
} from './types.ts'

const SEP = '\u0000'

export const toolPathKey = (tool: Tool, path: string): string =>
  `${tool}${SEP}${path}`

export const countKey = (
  d: Pick<Diagnostic, 'tool' | 'rule' | 'path'>,
): string => `${d.tool}${SEP}${d.rule}${SEP}${d.path}`

/**
 * A finding belongs to the line it starts on: a one-line edit inside a long
 * existing construct does not make the change answer for all of it. The
 * per-file count still catches a new problem added inside old code.
 */
const touches = (d: Diagnostic, range: LineRange): boolean =>
  d.line >= range.start && d.line <= range.end

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

/** A whole-file rule judges new names only: an added file, or a rename that changed the name. */
const hasNewName = (file: ChangedFile): boolean =>
  file.status === 'added' ||
  (file.status === 'renamed' &&
    baseName(file.oldPath ?? '') !== baseName(file.path))

const baseCountFor = (
  base: BaseCounts | undefined,
  d: Diagnostic,
): number | undefined =>
  base?.measured.has(toolPathKey(d.tool, d.path)) === true
    ? (base.counts.get(countKey(d)) ?? 0)
    : undefined

const findingsForGroup = (
  group: ReadonlyArray<Diagnostic>,
  file: ChangedFile | undefined,
  fileLevelRules: ReadonlySet<string>,
  base: BaseCounts | undefined,
): ReadonlyArray<Finding> => {
  const first = group[0]
  if (first === undefined) return []
  if (fileLevelRules.has(first.rule)) {
    return file !== undefined && hasNewName(file)
      ? group.map((d) => ({ ...d, reason: 'file-rule' }))
      : []
  }
  const onLines = group.filter(
    (d) => file?.ranges.some((r) => touches(d, r)) === true,
  )
  const elsewhere = group.filter((d) => !onLines.includes(d))
  const atBase = baseCountFor(base, first)
  const rise = atBase === undefined ? 0 : group.length - atBase
  const isUnexplained = rise > onLines.length && elsewhere.length > 0
  const note = `${atBase} at the base, ${group.length} now`
  return [
    ...onLines.map((d): Finding => ({ ...d, reason: 'changed-line' })),
    ...(isUnexplained
      ? elsewhere.map((d): Finding => ({ ...d, reason: 'count-rose', note }))
      : []),
  ]
}

/**
 * Picks out the problems a change is responsible for: those on lines it added
 * or changed, whole-file problems in files it added or renamed, and, where the
 * base was measured, problems elsewhere in a file whose count of that rule
 * went up. Problems that were already there are left out.
 */
export const selectNew = (input: {
  readonly diagnostics: ReadonlyArray<Diagnostic>
  readonly changed: ReadonlyArray<ChangedFile>
  readonly fileLevelRules: ReadonlySet<string>
  readonly base?: BaseCounts
}): ReadonlyArray<Finding> => {
  const files = new Map(input.changed.map((f) => [f.path, f]))
  const groups = Map.groupBy(input.diagnostics, countKey)
  return [...groups.values()]
    .flatMap((group) => {
      const path = group[0]?.path
      return findingsForGroup(
        group,
        path === undefined ? undefined : files.get(path),
        input.fileLevelRules,
        input.base,
      )
    })
    .toSorted(
      (a, b) =>
        a.path.localeCompare(b.path) ||
        a.line - b.line ||
        a.rule.localeCompare(b.rule),
    )
}
