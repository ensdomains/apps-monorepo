import { issueRhinestoneAccessToken } from './issueRhinestoneAccessToken'

/** Renew this long before `exp`, so a token never expires mid-registration. */
const RENEW_BEFORE_EXPIRY_MS = 5 * 60 * 1000

/** Lifetime assumed for a token whose `exp` cannot be read. */
const FALLBACK_LIFETIME_MS = 10 * 60 * 1000

/**
 * When a token should be replaced, from its own `exp` claim. The claim is
 * read, not verified: the server that minted it is the one that is trusted,
 * and a forged `exp` here only changes when this client asks for a new one.
 */
export function renewAtFor(token: string, issuedAt: number): number {
  const payload = token.split('.')[1]
  if (!payload) return issuedAt + FALLBACK_LIFETIME_MS

  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const claims: unknown = JSON.parse(json)
    const exp =
      claims && typeof claims === 'object' && 'exp' in claims
        ? claims.exp
        : undefined
    return typeof exp === 'number'
      ? exp * 1000 - RENEW_BEFORE_EXPIRY_MS
      : issuedAt + FALLBACK_LIFETIME_MS
  } catch {
    return issuedAt + FALLBACK_LIFETIME_MS
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
        cached = { token, renewAt: renewAtFor(token, now()) }
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
