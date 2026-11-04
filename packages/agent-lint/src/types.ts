/** An inclusive, 1-based range of lines in the new version of a file. */
export type LineRange = { readonly start: number; readonly end: number }

export type FileStatus = 'added' | 'modified' | 'renamed'

/** A file the change touches, with the lines it added or changed. */
export type ChangedFile = {
  readonly path: string
  readonly status: FileStatus
  readonly oldPath?: string
  readonly ranges: ReadonlyArray<LineRange>
}

export type Tool = 'biome' | 'eslint' | 'tsc' | 'text'

/** One problem a checker reported, located by repo-relative path and lines. */
export type Diagnostic = {
  readonly tool: Tool
  readonly rule: string
  readonly path: string
  readonly line: number
  readonly endLine: number
  readonly message: string
}

/**
 * Why a problem counts as the change's own:
 * - `changed-line`: it sits on a line the change added or changed.
 * - `file-rule`: a whole-file rule on a file the change added or renamed.
 * - `count-rose`: it sits elsewhere, but the file has more problems of this
 *   rule than it had at the base.
 */
export type Reason = 'changed-line' | 'file-rule' | 'count-rose'

export type Finding = Diagnostic & {
  readonly reason: Reason
  readonly note?: string
}

/**
 * Problem counts measured on the base version. `measured` holds the
 * tool-and-path pairs that were checked at the base; a measured pair with no
 * entry in `counts` had none of that rule.
 */
export type BaseCounts = {
  readonly measured: ReadonlySet<string>
  readonly counts: ReadonlyMap<string, number>
}
