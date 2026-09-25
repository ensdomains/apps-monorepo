/** Output-context encoders for untrusted notification fields. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: notification display values must not inject control characters or newlines
const C0_CONTROLS = /[\u0000-\u001F\u007F]/g

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export const normalizeNotificationName = (name: string): string =>
  name.replace(C0_CONTROLS, '').trim()

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character)

export const encodeNamePathSegment = (name: string): string =>
  encodeURIComponent(normalizeNotificationName(name))
