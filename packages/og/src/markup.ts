/**
 * Markup helpers for the HTML handed to satori.
 *
 * Cards are built as HTML strings rather than JSX because the renderer runs on
 * the worker, so both of these are string operations applied on the way in.
 */

const ESCAPE_HTML_RE = /["&'<>]/g
const ESCAPE_HTML_CHARS = new Map([
  ['"', '&quot;'],
  ['&', '&amp;'],
  ["'", '&#39;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
])

/**
 * Escape a value interpolated into card markup.
 *
 * Names, avatar URIs and text records are all attacker-controlled for any name
 * someone can register, and the markup is parsed as HTML before it reaches
 * satori. Slashes and `+` are deliberately left alone so base64 `data:` URIs
 * survive intact.
 */
export function escapeHtml(value: string): string {
  return value.replace(
    ESCAPE_HTML_RE,
    (char) => ESCAPE_HTML_CHARS.get(char) ?? char,
  )
}

/**
 * Strip the whitespace between a card's tags.
 *
 * satori keeps inter-element whitespace as a real (zero-width) flex child, so
 * indented markup gains a leading child on every row and `gap` opens a gap
 * before the first element that should be there — shifting the row over by one
 * gap and stealing two gaps' worth of width from whatever is set to `flex: 1`.
 * Collapsing it is what makes card templates safe to indent.
 */
export function collapseMarkup(html: string): string {
  return html.replace(/>\s+</g, '><').trim()
}
