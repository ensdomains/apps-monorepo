import { isTestLike } from './testLike.ts'
import type { Diagnostic } from './types.ts'

type TextRule = {
  readonly id: string
  readonly message: string
  /** The 1-based lines of a file's text that break the rule. */
  readonly lines: (text: string, path: string) => ReadonlyArray<number>
}

const ESLINT_DISABLE = /(?:\/\/|\/\*)\s*eslint-disable(?:-next-line|-line)?\b/u
const A11Y_SUPPRESSION =
  /(?:\/\/|\/\*)\s*biome-ignore(?:-all|-start)?\s+lint\/a11y\b/u
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}\u{FE0F}/u

/**
 * A comment or a string literal, whichever starts first, so `//` inside a
 * string or after `http:` never reads as a comment. Regex literals are not
 * tokenized; a stray quote in one can skew the rest of its line.
 */
const COMMENT_OR_STRING =
  /(?<![:\\])\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\[\s\S]|[^`\\])*`/gu

/** A line with its string literals emptied, so text inside strings never counts as a comment. */
const withoutStrings = (line: string): string =>
  line.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/gu, "''")

/** A rule that judges each line by itself. */
const eachLine =
  (breaks: (line: string) => boolean) =>
  (text: string): ReadonlyArray<number> =>
    text.split('\n').flatMap((line, i) => (breaks(line) ? [i + 1] : []))

/** The lines of `text` where an emoji sits inside a `//` or block comment. */
const emojiCommentLines = (text: string): ReadonlyArray<number> =>
  EMOJI.test(text)
    ? [...text.matchAll(COMMENT_OR_STRING)].flatMap(({ 0: token, index }) =>
        token.startsWith('/')
          ? token
              .split('\n')
              .flatMap((line, i) =>
                EMOJI.test(line)
                  ? [text.slice(0, index).split('\n').length + i]
                  : [],
              )
          : [],
      )
    : []

/**
 * Checks no linter can make: they read comments, which Biome plugins cannot
 * see, so they run over the text of each changed file.
 */
export const TEXT_RULES: ReadonlyArray<TextRule> = [
  {
    id: 'text/no-a11y-suppression',
    message:
      'Do not suppress an accessibility rule; fix the markup (STYLEGUIDE.md: never suppress a11y warnings).',
    lines: eachLine((line) => A11Y_SUPPRESSION.test(withoutStrings(line))),
  },
  {
    id: 'text/eslint-disable-reason',
    message:
      'Give the eslint-disable its reason: `// eslint-disable-next-line <rule> -- <reason>`.',
    lines: eachLine((line) => {
      const code = withoutStrings(line)
      return ESLINT_DISABLE.test(code) && !/\s--\s+\S/u.test(code)
    }),
  },
  {
    id: 'text/no-emoji-in-comments',
    message: 'No emojis in comments; say it in words.',
    lines: (text, path) => (isTestLike(path) ? [] : emojiCommentLines(text)),
  },
]

/** Every line of `text` that breaks a text rule, located in `path`. */
export const checkText = (
  path: string,
  text: string,
): ReadonlyArray<Diagnostic> =>
  TEXT_RULES.flatMap((rule) =>
    rule.lines(text, path).map(
      (line): Diagnostic => ({
        tool: 'text',
        rule: rule.id,
        path,
        line,
        endLine: line,
        message: rule.message,
      }),
    ),
  ).toSorted((a, b) => a.line - b.line)
