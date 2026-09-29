/**
 * Extract the `scheme://host[:port]` origin from a configured URL so it can be
 * allowlisted in a CSP directive.
 *
 * Returns `null` for unset, relative (`/rpc`, already covered by `'self'`), or
 * unparseable values, so only real absolute http(s) entries are added.
 */
export const originFromEnvUrl = (value: string | undefined): string | null => {
  if (!value || value.startsWith('/')) return null
  try {
    const { protocol, origin } = new URL(value)
    return protocol === 'https:' || protocol === 'http:' ? origin : null
  } catch {
    return null
  }
}
