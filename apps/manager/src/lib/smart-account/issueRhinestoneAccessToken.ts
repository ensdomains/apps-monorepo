import { createServerFn } from '@tanstack/react-start'

/**
 * Mint a Rhinestone orchestrator access token for the browser.
 *
 * The private JWK stays in the worker as a secret; the client only ever holds
 * a token that expires. An access token on its own cannot sponsor an intent,
 * that takes a second per-intent token this app does not mint, so the worst a
 * stolen token buys is submitting intents the thief pays for, under our
 * project's quota, until it expires.
 *
 * A single token mint costs one signature, so the mint is rate-limited per
 * client address through the `RHINESTONE_TOKEN_RATE_LIMIT` binding. The
 * binding is absent in local dev, where the limit is skipped.
 */
export const issueRhinestoneAccessToken = createServerFn({
  method: 'POST',
}).handler(async (): Promise<string> => {
  const { env } = await import('cloudflare:workers')

  if (env.RHINESTONE_TOKEN_RATE_LIMIT) {
    const { getRequestIP } = await import('@tanstack/react-start/server')
    const key = getRequestIP({ xForwardedFor: true }) ?? 'unknown'
    const { success } = await env.RHINESTONE_TOKEN_RATE_LIMIT.limit({ key })
    if (!success) throw new Error('Too many token requests, try again shortly')
  }

  const { createJwtSigner } = await import('@rhinestone/sdk/jwt-server')
  return createJwtSigner({ jwt: readJwtCredentials(env) }).accessToken()
})

type JwtCredentials = Parameters<
  typeof import('@rhinestone/sdk/jwt-server').createJwtSigner
>[0]['jwt']

/**
 * Read the signing credentials, refusing to mint from a partial set. The
 * message names the variable rather than echoing a value, since it reaches
 * the browser.
 */
function readJwtCredentials(env: Cloudflare.Env): JwtCredentials {
  const read = (name: keyof Cloudflare.Env): string => {
    const value = env[name]
    if (typeof value !== 'string' || value === '') {
      throw new Error(`Rhinestone token signing is not configured (${name})`)
    }
    return value
  }

  return {
    privateKey: parsePrivateJwk(read('RHINESTONE_JWT_PRIVATE_KEY')),
    integratorId: read('RHINESTONE_INTEGRATOR_ID'),
    projectId: read('RHINESTONE_PROJECT_ID'),
    appId: read('RHINESTONE_APP_ID'),
    keyId: read('RHINESTONE_KEY_ID'),
  }
}

function parsePrivateJwk(raw: string): JsonWebKey {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && 'kty' in parsed) {
      return parsed as JsonWebKey
    }
  } catch {
    // Fall through to the one error below.
  }
  throw new Error(
    'Rhinestone token signing is not configured (RHINESTONE_JWT_PRIVATE_KEY is not a JWK)',
  )
}
