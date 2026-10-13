import { issueRhinestoneAccessToken } from './issueRhinestoneAccessToken'

/** Renew this long before expiry, so a token never expires mid-registration. */
const RENEW_BEFORE_EXPIRY_MS = 5 * 60 * 1000

/** Lifetime assumed for a token whose claims cannot be read. */
const FALLBACK_LIFETIME_MS = 10 * 60 * 1000

/**
 * How long a token is good for, from its own `exp - iat`. A duration rather
 * than the absolute `exp`, because `exp` is on the server's clock and the
 * cache runs on the browser's: a slow browser clock would otherwise keep
 * handing out a token Rhinestone has already stopped accepting, and a fast
 * one would mint on every call. The claims are read, not verified: the server
 * that minted the token is the trusted party, and a forged lifetime here only
 * changes when this client asks for another.
 */
export function tokenLifetimeMs(token: string): number {
  const payload = token.split('.')[1]
  if (!payload) return FALLBACK_LIFETIME_MS

  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const claims: unknown = JSON.parse(json)
    if (!claims || typeof claims !== 'object') return FALLBACK_LIFETIME_MS
    const { exp, iat } = claims as {
      readonly exp?: unknown
      readonly iat?: unknown
    }
    return typeof exp === 'number' && typeof iat === 'number' && exp > iat
      ? (exp - iat) * 1000
      : FALLBACK_LIFETIME_MS
  } catch {
    return FALLBACK_LIFETIME_MS
  }
}

/**
 * Hand the SDK one token at a time.
 *
 * Every orchestrator call asks for a token, and a registration makes several
 * in a row, so the token is cached until it is close to expiry and concurrent
 * callers share one mint. A failed mint is not cached: the next call tries
 * again, which is what the SDK's own retry expects.
 */
export function createAccessTokenGetter(
  mint: () => Promise<string>,
  now: () => number = Date.now,
): () => Promise<string> {
  let cached: { readonly token: string; readonly renewAt: number } | undefined
  let inFlight: Promise<string> | undefined

  return () => {
    if (cached && now() < cached.renewAt) return Promise.resolve(cached.token)

    inFlight ??= mint()
      .then((token) => {
        cached = {
          token,
          renewAt: now() + tokenLifetimeMs(token) - RENEW_BEFORE_EXPIRY_MS,
        }
        return token
      })
      .finally(() => {
        inFlight = undefined
      })
    return inFlight
  }
}

export const getRhinestoneAccessToken = createAccessTokenGetter(() =>
  issueRhinestoneAccessToken(),
)
