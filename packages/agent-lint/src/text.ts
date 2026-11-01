import type { Diagnostic } from './types.ts'

type TextRule = {
  readonly id: string
  readonly message: string
  readonly breaks: (line: string) => boolean
}

const ESLINT_DISABLE = /(?:\/\/|\/\*)\s*eslint-disable(?:-next-line|-line)?\b/u
const A11Y_SUPPRESSION =
  /(?:\/\/|\/\*)\s*biome-ignore(?:-all|-start)?\s+lint\/a11y\b/u

/** A line with its string literals emptied, so text inside strings never counts as a comment. */
const withoutStrings = (line: string): string =>
  line.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/gu, "''")

/**
 * Checks no linter can make: they read comments, which Biome plugins cannot
 * see, so they run over the text of each changed file.
 */
export const TEXT_RULES: ReadonlyArray<TextRule> = [
  {
    id: 'text/no-a11y-suppression',
    message:
      'Do not suppress an accessibility rule; fix the markup (STYLEGUIDE.md: never suppress a11y warnings).',
    breaks: (line) => A11Y_SUPPRESSION.test(withoutStrings(line)),
  },
  {
    id: 'text/eslint-disable-reason',
    message:
      'Give the eslint-disable its reason: `// eslint-disable-next-line <rule> -- <reason>`.',
    breaks: (line) => {
      const code = withoutStrings(line)
      return ESLINT_DISABLE.test(code) && !/\s--\s+\S/u.test(code)
    },
  },
]

/** Every line of `text` that breaks a text rule, located in `path`. */
export const checkText = (
  path: string,
  text: string,
): ReadonlyArray<Diagnostic> =>
  text.split('\n').flatMap((line, i) =>
    TEXT_RULES.filter((rule) => rule.breaks(line)).map(
      (rule): Diagnostic => ({
        tool: 'text',
        rule: rule.id,
        path,
        line: i + 1,
        endLine: i + 1,
        message: rule.message,
      }),
    ),
  )
