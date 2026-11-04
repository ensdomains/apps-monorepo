import type { Diagnostic } from './types.ts'

type Prerequisite = {
  readonly rule: string
  /** The repo-relative file a finding at `path` needs, or undefined when none applies. */
  readonly file: (path: string) => string | undefined
}

/**
 * Rules that point at code a checkout may not have yet. no-throw sends a
 * state only a bug can reach to invariant() in packages/utils; a checkout
 * from before that file landed cannot follow the rule, so it applies only
 * where the file exists.
 */
const PREREQUISITES: ReadonlyArray<Prerequisite> = [
  {
    rule: 'agent/no-throw',
    file: () => 'packages/utils/src/invariant.ts',
  },
]

/** Drops findings of a rule whose prerequisite file the checked repo lacks. */
export const withPrerequisites = (
  diagnostics: ReadonlyArray<Diagnostic>,
  exists: (path: string) => boolean,
): ReadonlyArray<Diagnostic> =>
  diagnostics.filter((d) => {
    const file = PREREQUISITES.find((p) => p.rule === d.rule)?.file(d.path)
    return file === undefined || exists(file)
  })
