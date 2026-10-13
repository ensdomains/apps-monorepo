import { TaggedError } from '@ens-apps/utils/neverthrow'
import { createServerFn } from '@tanstack/react-start'
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
 * the route guards read, and rate-limited per wallet through the
 * `RHINESTONE_TOKEN_RATE_LIMIT` binding (absent in local dev, where the limit
 * is skipped). The cookie is set by the client, so this is not proof of
 * holding the wallet; it keeps the mint off the anonymous path and gives the
 * limit a per-user key. Proving the wallet would cost a signing prompt.
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
    const { success } = await env.RHINESTONE_TOKEN_RATE_LIMIT.limit({
      key: wallet.toLowerCase(),
    })
    if (!success) {
      throw new RhinestoneTokenError({
        message: 'Too many token requests, try again shortly',
        reason: 'rate-limited',
        cause: undefined,
      })
    }
  }

  const { createJwtSigner } = await import('@rhinestone/sdk/jwt-server')
  return createJwtSigner({ jwt: readJwtCredentials(env) }).accessToken()
})

type JwtCredentials = Parameters<
  typeof import('@rhinestone/sdk/jwt-server').createJwtSigner
>[0]['jwt']

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
