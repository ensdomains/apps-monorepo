import { fromSync, TaggedError } from '@ens-apps/utils/neverthrow'
import type {
  JwtCredentials,
  JwtSignerConfig,
} from '@rhinestone/sdk/jwt-server'
import { err, ok, type Result } from 'neverthrow'
import * as v from 'valibot'
import { createSponsorshipPredicate } from './predicate'

export class RhinestoneJwtConfigError extends TaggedError(
  'RHINESTONE_JWT_CONFIG_ERROR',
) {}

// ES256 signing requires an EC P-256 *private* JWK: the private scalar `d`
// plus the public `x`/`y`. Pin those here so a wrong-curve, public-only, or
// otherwise malformed key is rejected on the typed config-error path rather
// than throwing deep inside the SDK signer at request time (which would
// surface to the caller as an opaque 500). `looseObject` still lets the
// optional JWK fields (kid, use, key_ops, ext, …) pass through untouched.
const JsonWebKeySchema = v.looseObject({
  kty: v.literal('EC'),
  crv: v.literal('P-256'),
  x: v.pipe(v.string(), v.nonEmpty()),
  y: v.pipe(v.string(), v.nonEmpty()),
  d: v.pipe(v.string(), v.nonEmpty()),
})

const SigningKeySchema = v.object({
  keyId: v.pipe(v.string(), v.nonEmpty()),
  privateKey: JsonWebKeySchema,
})

const SigningKeysSchema = v.pipe(v.array(SigningKeySchema), v.minLength(1))

/**
 * Sepolia-launch defaults for the non-secret Rhinestone identity. The project
 * id is signed into every token's `sub` claim and the rest are plain labels —
 * none are secrets — so they default in code and an env var is only needed to
 * *override* them for a different Rhinestone project/environment. The signing
 * key (`RHINESTONE_JWT_SIGNING_KEYS`) is the one value that must be provisioned.
 */
const IDENTITY_DEFAULTS = {
  integratorId: 'app',
  projectId: 'cmgk24o77001v3j0tkscm3a65',
  appId: 'ens-manager-sepolia',
} as const

const ConfigEnvSchema = v.object({
  // Non-secret identity — optional; unset/blank falls back to IDENTITY_DEFAULTS.
  RHINESTONE_INTEGRATOR_ID: v.optional(v.string()),
  RHINESTONE_PROJECT_ID: v.optional(v.string()),
  RHINESTONE_APP_ID: v.optional(v.string()),
  // Optional — only needed to pick a key when several are registered; a
  // single-key set selects itself.
  RHINESTONE_JWT_ACTIVE_KEY_ID: v.optional(v.string()),
  RHINESTONE_JWT_AUDIENCE: v.optional(v.string(), ''),
  // The one required secret. Validated here too so a missing/blank value fails
  // as a clear config error up front, rather than surfacing later as a
  // misleading "not valid JSON" from the `JSON.parse` below.
  RHINESTONE_JWT_SIGNING_KEYS: v.pipe(v.string(), v.nonEmpty()),
})

const summarise = (issues: readonly v.BaseIssue<unknown>[]): string =>
  issues.map((issue) => issue.message).join('; ')

/**
 * Assemble the Rhinestone JWT signer config from the environment.
 *
 * `RHINESTONE_JWT_SIGNING_KEYS` (the one required secret) is a JSON array of
 * `{ keyId, privateKey }`. A single-key set selects itself; with several,
 * `RHINESTONE_JWT_ACTIVE_KEY_ID` picks the active one — keeping every registered
 * key in the array and rotating purely by the active id gives zero-downtime
 * `kid` rotation (tokens already issued under a previous `kid` keep verifying
 * against their still-registered key until they expire). The non-secret
 * integrator / project / app identity defaults in code (`IDENTITY_DEFAULTS`);
 * set the matching env var only to override.
 */
export function buildRhinestoneJwtConfig(
  env: CloudflareBindings,
): Result<JwtSignerConfig, RhinestoneJwtConfigError> {
  const envParse = v.safeParse(ConfigEnvSchema, env)
  if (!envParse.success) {
    return err(
      new RhinestoneJwtConfigError({
        message: `Invalid Rhinestone JWT config: ${summarise(envParse.issues)}`,
      }),
    )
  }

  // Lift the throwing `JSON.parse` into a Result rather than a hand-written
  // try/catch (styleguide: neverthrow boundary conversion via `fromSync`).
  const rawKeysResult = fromSync(
    () => JSON.parse(env.RHINESTONE_JWT_SIGNING_KEYS) as unknown,
    (cause) =>
      new RhinestoneJwtConfigError({
        message: 'RHINESTONE_JWT_SIGNING_KEYS is not valid JSON',
        cause,
      }),
  )
  if (rawKeysResult.isErr()) {
    return err(rawKeysResult.error)
  }
  const rawKeys = rawKeysResult.value

  const keysParse = v.safeParse(SigningKeysSchema, rawKeys)
  if (!keysParse.success) {
    return err(
      new RhinestoneJwtConfigError({
        message: `Invalid RHINESTONE_JWT_SIGNING_KEYS: ${summarise(keysParse.issues)}`,
      }),
    )
  }

  // Select the active key: an explicit id picks it (error if absent); otherwise
  // a single-key set is unambiguous, and a multi-key set needs the id to choose.
  const keys = keysParse.output
  const activeKeyId = envParse.output.RHINESTONE_JWT_ACTIVE_KEY_ID
  const activeKey = activeKeyId
    ? keys.find((key) => key.keyId === activeKeyId)
    : keys.length === 1
      ? keys[0]
      : undefined
  if (!activeKey) {
    return err(
      new RhinestoneJwtConfigError({
        message: activeKeyId
          ? `Active signing key "${activeKeyId}" not found in RHINESTONE_JWT_SIGNING_KEYS`
          : 'RHINESTONE_JWT_SIGNING_KEYS holds multiple keys; set RHINESTONE_JWT_ACTIVE_KEY_ID to select one',
      }),
    )
  }

  const credentials: JwtCredentials = {
    privateKey: activeKey.privateKey as JsonWebKey,
    integratorId:
      envParse.output.RHINESTONE_INTEGRATOR_ID ||
      IDENTITY_DEFAULTS.integratorId,
    projectId:
      envParse.output.RHINESTONE_PROJECT_ID || IDENTITY_DEFAULTS.projectId,
    appId: envParse.output.RHINESTONE_APP_ID || IDENTITY_DEFAULTS.appId,
    keyId: activeKey.keyId,
    ...(envParse.output.RHINESTONE_JWT_AUDIENCE
      ? { audience: envParse.output.RHINESTONE_JWT_AUDIENCE }
      : {}),
  }

  return ok({
    jwt: credentials,
    shouldSponsor: createSponsorshipPredicate(env),
  })
}
