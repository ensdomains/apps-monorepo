/**
 * Encode untrusted notification fields for a specific output context.
 * Do not invent extra escaping for Handlebars: `{{name}}` already HTML-escapes
 * the substituted value and does not re-parse it as template syntax.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: strip C0 so names cannot inject newlines
const C0_CONTROLS = /[\u0000-\u001F\u007F]/g

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Drop C0 controls so a name cannot inject newlines into plain-text bodies. */
export const normalizeNotificationName = (name: string): string =>
  name.replace(C0_CONTROLS, '').trim()

/** HTML text / Telegram HTML parse_mode. */
export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char)

export const encodeNamePathSegment = (name: string): string =>
  encodeURIComponent(normalizeNotificationName(name))

export const buildManagerAppPathUrl = (
  managerAppUrl: string,
  pathname: string,
): string => new URL(pathname, managerAppUrl).toString()
