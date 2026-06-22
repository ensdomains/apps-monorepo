import {
  createAccessTokenHandler,
  createExtensionTokenHandler,
} from '@rhinestone/sdk/jwt-server'
import type { Context } from 'hono'
import * as v from 'valibot'
import { buildRhinestoneJwtConfig } from '#services/sponsorship/config.js'
import { createApp, internalServerError } from '../../middleware/hono'

/**
 * Rhinestone JWT auth endpoints (FET-3334 — gas sponsorship foundation).
 *
 * The manager runs the Rhinestone SDK in `mode: 'experimental_jwt'` and calls
 * these to mint:
 *  - an **access token** (authenticates the SDK to Rhinestone; the SDK requests
 *    one per orchestrator call rather than caching a single session token), and
 *  - a single-use, payload-bound **extension token** per sponsored intent.
 *
 * The extension-token handler evaluates the `shouldSponsor` predicate before
 * signing; a denied intent returns 403. The real records + primary-name gating
 * (5×years per name + 40k budget, re-derived from the Bigname projection) is
 * wired into that predicate in FET-3337.
 *
 * These endpoints are intentionally unauthenticated. An extension token only
 * authorises *sponsorship* of one specific intent: it is bound to that intent's
 * payload (account + calls) by a digest, is single-use, and expires in minutes.
 * It is sent as a request header and is never part of the signed intent — so
 * executing the intent still requires the account's own signature, which the
 * token does not and cannot provide. A token minted for an account the caller
 * cannot sign for is therefore unusable; the economic limits come from the
 * `shouldSponsor` predicate (FET-3337), not from caller identity. Rate-limiting
 * the mint endpoints (their per-request ES256 signing is a CPU/abuse surface)
 * is tracked separately in FET-3367.
 */

// The fields the `shouldSponsor` predicate reads off the intent. `looseObject`
// validates these while letting the rest of the SDK's intent payload through —
// important, because the *original* request body is forwarded to the signer so
// the minted token's intent digest matches what the orchestrator re-derives.
const IntentInputSchema = v.looseObject({
  destinationChainId: v.number(),
  account: v.looseObject({ address: v.string() }),
  destinationExecutions: v.array(
    v.looseObject({
      to: v.string(),
      value: v.union([v.string(), v.number()]),
      data: v.string(),
    }),
  ),
})

const ExtensionTokenBodySchema = v.object({ intentInput: IntentInputSchema })

/**
 * The SDK token handlers build their own `Response`, and their 5xx body echoes
 * the raw signer error message. Pass caller-facing 4xx through verbatim (400 /
 * 403 are responses by design) but replace any 5xx with a generic body so an
 * internal signer/config error cannot leak to the caller. The original detail
 * is still logged server-side via `internalServerError`.
 */
async function passThroughOrSanitiseServerError(
  c: Context,
  response: Response,
): Promise<Response> {
  if (response.status < 500) return response
  const detail = await response
    .clone()
    .text()
    .catch(() => '')
  return internalServerError(c, {
    message: 'Sponsorship token signing failed',
    ...(detail ? { cause: detail } : {}),
  })
}

export default createApp()
  .basePath('/sponsorship')
  .post('/access-token', async (c) => {
    const config = buildRhinestoneJwtConfig(c.env)
    if (config.isErr()) {
      return internalServerError(c, config.error)
    }
    const response = await createAccessTokenHandler(config.value)(c.req.raw)
    return passThroughOrSanitiseServerError(c, response)
  })
  .post('/extension-token', async (c) => {
    const config = buildRhinestoneJwtConfig(c.env)
    if (config.isErr()) {
      return internalServerError(c, config.error)
    }

    // Validate the body shape up front so a malformed-but-present intentInput
    // is a clean 400 rather than a 500 from the SDK's internal parse. Read the
    // raw body once and forward those exact bytes to the signer — validation
    // must not mutate the payload, since the token's intent digest is computed
    // over it and must match the orchestrator's re-derivation.
    const rawBody = await c.req.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }

    const result = v.safeParse(ExtensionTokenBodySchema, parsed)
    if (!result.success) {
      return c.json(
        {
          error: `Invalid intentInput: ${result.issues
            .map((issue) => issue.message)
            .join('; ')}`,
        },
        400,
      )
    }

    const signerRequest = new Request(c.req.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: rawBody,
    })
    const response = await createExtensionTokenHandler(config.value)(
      signerRequest,
    )
    return passThroughOrSanitiseServerError(c, response)
  })
