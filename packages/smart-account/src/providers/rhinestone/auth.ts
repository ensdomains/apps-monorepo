import type { RhinestoneSDK } from '@rhinestone/sdk'

/**
 * How the SDK, and our own direct orchestrator calls, authenticate.
 *
 * `jwt` is the production mode: a short-lived access token minted by the
 * manager's own server, so no long-lived credential ships in the bundle. The
 * orchestrator sponsors nothing on an access token alone (that takes a second,
 * per-intent token this app never mints), which is the property this exists
 * for: a stolen token can only submit intents its holder pays for.
 *
 * `apiKey` is for the local mockestrator, where the key is a placeholder that
 * never leaves the developer's machine.
 */
export type RhinestoneAuth =
  | { readonly mode: 'apiKey'; readonly apiKey: string }
  | { readonly mode: 'jwt'; readonly getAccessToken: () => Promise<string> }

/** The SDK's own auth union, which it does not export on its own. */
type SdkAuth = Extract<
  ConstructorParameters<typeof RhinestoneSDK>[0],
  { auth: unknown }
>['auth']

export function toSdkAuth(auth: RhinestoneAuth): SdkAuth {
  return auth.mode === 'apiKey'
    ? { mode: 'apiKey', apiKey: auth.apiKey }
    : { mode: 'experimental_jwt', accessToken: auth.getAccessToken }
}

/**
 * The headers a direct orchestrator call sends. Mirrors the SDK's own auth
 * provider, including the literal `x-api-key: jwt` it sends alongside a bearer
 * token, so a hand-built request is indistinguishable from one the SDK makes.
 */
export async function rhinestoneAuthHeaders(
  auth: RhinestoneAuth,
): Promise<Record<string, string>> {
  if (auth.mode === 'apiKey') return { 'x-api-key': auth.apiKey }

  const token = await auth.getAccessToken()
  return { Authorization: `Bearer ${token}`, 'x-api-key': 'jwt' }
}
