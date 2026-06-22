/**
 * Rhinestone `experimental_jwt` auth callbacks (gas sponsorship).
 *
 * When the `VITE_FF_EXPERIMENTAL_JWT` flag is on, the Rhinestone SDK is built
 * in JWT mode and calls these callbacks:
 *   - `accessToken()` to authenticate the SDK to the orchestrator (the SDK
 *     requests one per orchestrator call — it does not cache a single session
 *     token), and
 *   - `getIntentExtensionToken(intentInput)` per sponsored intent.
 *
 * Both POST to the api-worker sponsorship endpoints (reached through the
 * manager's `/api` proxy → `/sponsorship/*`). The worker runs the
 * `shouldSponsor` predicate and signs the token; a denied intent comes back as
 * a non-200 and we throw, which fails that sponsored intent (user-paid
 * fallback handling lands with the real predicate, FET-3337).
 */

export interface JwtAuthCallbacks {
  readonly accessToken: () => Promise<string>
  readonly getIntentExtensionToken: (intentInput: unknown) => Promise<string>
}

async function mintToken(path: string, body?: unknown): Promise<string> {
  // Imported lazily (not at module top): this module is reachable in the SSR
  // graph via rhinestone.ts, and backend-client eagerly evaluates posthog-js,
  // which throws during server-side render. These callbacks only ever run
  // client-side, so a dynamic import is safe and keeps backend-client out of SSR.
  const { backendAuthStore, getBackendApiBaseUrl } = await import(
    '@/utils/backend-client'
  )
  // Sponsorship lives on the api-worker. Defaults to the general backend URL,
  // but can be pointed elsewhere (e.g. `/api` for local dev, so calls hit the
  // locally-running worker through the Vite proxy rather than a deployed one).
  const base = (
    import.meta.env.VITE_SPONSORSHIP_API_URL ?? getBackendApiBaseUrl()
  ).replace(/\/$/, '')
  const authKey = backendAuthStore.get().context.authKey

  const response = await fetch(`${base}/sponsorship/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authKey ? { authorization: `Bearer ${authKey}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

  if (!response.ok) {
    throw new Error(`sponsorship/${path} failed: ${response.status}`)
  }

  // Validate the worker response shape with a guard rather than a bare cast
  // (styleguide: prefer `unknown` + type guards over asserting a shape).
  const data: unknown = await response.json()
  if (
    typeof data !== 'object' ||
    data === null ||
    !('token' in data) ||
    typeof data.token !== 'string'
  ) {
    throw new Error(`sponsorship/${path} returned no token`)
  }
  return data.token
}

export function createJwtAuthCallbacks(): JwtAuthCallbacks {
  return {
    accessToken: () => mintToken('access-token'),
    getIntentExtensionToken: (intentInput) =>
      mintToken('extension-token', { intentInput }),
  }
}
