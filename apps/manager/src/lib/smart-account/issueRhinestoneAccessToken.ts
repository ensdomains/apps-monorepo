import { TaggedError } from '@ens-apps/utils/neverthrow'
import { createServerFn } from '@tanstack/react-start'
import { importJWK, SignJWT } from 'jose'
import { isAddress } from 'viem'
import { getConnectionCookie } from '@/lib/connection-cookie'

type TokenRefusal = 'no-wallet' | 'rate-limited' | 'not-configured'

/**
 * Why a token was not minted. `reason` is what callers branch on; `message`
 * is what reaches the browser, so it never carries a secret value.
 */
export class RhinestoneTokenError extends TaggedError('RhinestoneTokenError')<{
  readonly message: string
  readonly reason: TokenRefusal
  readonly cause: unknown
}> {}

/**
 * How long a token is accepted for. A registration runs about two minutes end
 * to end and the client renews five minutes before expiry, so ten covers a
 * whole run without a mid-flow renewal and still bounds a leaked token at a
 * sixth of the SDK signer's default hour. Rhinestone has no revocation, so
 * the lifetime is the only bound there is.
 */
const ACCESS_TOKEN_LIFETIME = '10m'

/** The audience Rhinestone's own signer sets; the orchestrator checks it. */
const RHINESTONE_AUDIENCE = 'rhinestone-api'

const CREDENTIAL_NAMES = [
  'RHINESTONE_JWT_PRIVATE_KEY',
  'RHINESTONE_INTEGRATOR_ID',
  'RHINESTONE_PROJECT_ID',
  'RHINESTONE_APP_ID',
  'RHINESTONE_KEY_ID',
] as const

/**
 * Mint a Rhinestone orchestrator access token for the browser.
 *
 * The private JWK stays in the worker as a secret; the client only ever holds
 * a token that expires. An access token on its own cannot sponsor an intent,
 * that takes a second per-intent token this app does not mint, so the worst a
 * stolen token buys is submitting intents the thief pays for, under our
 * project's quota, until it expires.
 *
 * Minting is limited to callers presenting a connected wallet, the same cookie
 * the route guards read, and rate-limited through the
 * `RHINESTONE_TOKEN_RATE_LIMIT` binding (absent in local dev, where the limit
 * is skipped). Two buckets: one keyed by the connecting address Cloudflare
 * stamps, which the caller cannot choose, and one by the wallet. The cookie is set by the
 * client, so it is not proof of holding the wallet, and a limit keyed by it
 * alone would be a fresh bucket per forged value; it keeps the mint off the
 * anonymous path and bounds what one wallet can ask for. Proving the wallet
 * would cost a signing prompt.
 */
export const issueRhinestoneAccessToken = createServerFn({
  method: 'POST',
}).handler(async (): Promise<string> => {
  const wallet = getConnectionCookie()
  if (!wallet || !isAddress(wallet)) {
    throw new RhinestoneTokenError({
      message: 'Connect a wallet before requesting a Rhinestone token',
      reason: 'no-wallet',
      cause: undefined,
    })
  }

  const { env } = await import('cloudflare:workers')

  if (env.RHINESTONE_TOKEN_RATE_LIMIT) {
    const { getRequestHeader } = await import('@tanstack/react-start/server')
    // Cloudflare stamps this at the edge from the connection itself, so a
    // caller cannot pick their bucket the way they could with X-Forwarded-For.
    const address = getRequestHeader('cf-connecting-ip') ?? 'unknown'
    const limiter = env.RHINESTONE_TOKEN_RATE_LIMIT
    const [byAddress, byWallet] = await Promise.all([
      limiter.limit({ key: `ip:${address}` }),
      limiter.limit({ key: `wallet:${wallet.toLowerCase()}` }),
    ])
    if (!byAddress.success || !byWallet.success) {
      throw new RhinestoneTokenError({
        message: 'Too many token requests, try again shortly',
        reason: 'rate-limited',
        cause: undefined,
      })
    }
  }

  return mintAccessToken(readJwtCredentials(env))
})

interface JwtCredentials {
  readonly privateKey: JsonWebKey
  readonly integratorId: string
  readonly projectId: string
  readonly appId: string
  readonly keyId: string
}

/**
 * The same token `@rhinestone/sdk/jwt-server`'s `createJwtSigner` issues,
 * claim for claim, with a shorter lifetime: the SDK hardcodes one hour and
 * exposes no way to change it. ES256 only, which is what the dashboard
 * generates; a key of another type is a configuration error, not a case.
 */
async function mintAccessToken(jwt: JwtCredentials): Promise<string> {
  if (jwt.privateKey.kty !== 'EC' || jwt.privateKey.crv !== 'P-256') {
    throw new RhinestoneTokenError({
      message:
        'Rhinestone token signing is not configured (RHINESTONE_JWT_PRIVATE_KEY must be a P-256 EC key)',
      reason: 'not-configured',
      cause: undefined,
    })
  }
  const key = await importJWK(jwt.privateKey, 'ES256')
  return new SignJWT({ typ: 'access', app_id: jwt.appId })
    .setProtectedHeader({ alg: 'ES256', kid: jwt.keyId })
    .setIssuer(jwt.integratorId)
    .setSubject(jwt.projectId)
    .setAudience(RHINESTONE_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_LIFETIME)
    .sign(key)
}

/**
 * Read the signing credentials, refusing to mint from a partial set. The
 * message names every variable that is missing rather than the first, since
 * "all five" and "just one" point at different mistakes, and never echoes a
 * value, since it reaches the browser.
 */
function readJwtCredentials(env: Cloudflare.Env): JwtCredentials {
  const missing = CREDENTIAL_NAMES.filter((name) => {
    const value = env[name]
    return typeof value !== 'string' || value === ''
  })
  if (missing.length > 0) {
    throw new RhinestoneTokenError({
      message: `Rhinestone token signing is not configured (${missing.join(', ')})`,
      reason: 'not-configured',
      cause: undefined,
    })
  }
  const read = (name: (typeof CREDENTIAL_NAMES)[number]): string =>
    env[name] as string

  return {
    privateKey: parsePrivateJwk(read('RHINESTONE_JWT_PRIVATE_KEY')),
    integratorId: read('RHINESTONE_INTEGRATOR_ID'),
    projectId: read('RHINESTONE_PROJECT_ID'),
    appId: read('RHINESTONE_APP_ID'),
    keyId: read('RHINESTONE_KEY_ID'),
  }
}

function parsePrivateJwk(raw: string): JsonWebKey {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (cause) {
    throw notAJwk(cause)
  }
  if (parsed && typeof parsed === 'object' && 'kty' in parsed) {
    return parsed as JsonWebKey
  }
  throw notAJwk(undefined)
}

const notAJwk = (cause: unknown) =>
  new RhinestoneTokenError({
    message:
      'Rhinestone token signing is not configured (RHINESTONE_JWT_PRIVATE_KEY is not a JWK)',
    reason: 'not-configured',
    cause,
  })
