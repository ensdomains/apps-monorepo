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

const ConfigEnvSchema = v.object({
  RHINESTONE_INTEGRATOR_ID: v.pipe(v.string(), v.nonEmpty()),
  RHINESTONE_PROJECT_ID: v.pipe(v.string(), v.nonEmpty()),
  RHINESTONE_APP_ID: v.pipe(v.string(), v.nonEmpty()),
  RHINESTONE_JWT_ACTIVE_KEY_ID: v.pipe(v.string(), v.nonEmpty()),
  RHINESTONE_JWT_AUDIENCE: v.optional(v.string(), ''),
  // Validated here too so a missing/blank value fails as a clear config error
  // up front, rather than surfacing later as a misleading "not valid JSON"
  // from the `JSON.parse` below.
  RHINESTONE_JWT_SIGNING_KEYS: v.pipe(v.string(), v.nonEmpty()),
})

const summarise = (issues: readonly v.BaseIssue<unknown>[]): string =>
  issues.map((issue) => issue.message).join('; ')

/**
 * Assemble the Rhinestone JWT signer config from the environment.
 *
 * Signing keys are held as a JSON array of `{ keyId, privateKey }`; the active
 * key is selected by `RHINESTONE_JWT_ACTIVE_KEY_ID`. Keeping every registered
 * key in the array and rotating purely by changing the active id gives
 * zero-downtime `kid` rotation — tokens already issued under a previous `kid`
 * keep verifying against their still-registered key until they expire.
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

  const activeKeyId = envParse.output.RHINESTONE_JWT_ACTIVE_KEY_ID
  const activeKey = keysParse.output.find((key) => key.keyId === activeKeyId)
  if (!activeKey) {
    return err(
      new RhinestoneJwtConfigError({
        message: `Active signing key "${activeKeyId}" not found in RHINESTONE_JWT_SIGNING_KEYS`,
      }),
    )
  }

  const credentials: JwtCredentials = {
    privateKey: activeKey.privateKey as JsonWebKey,
    integratorId: envParse.output.RHINESTONE_INTEGRATOR_ID,
    projectId: envParse.output.RHINESTONE_PROJECT_ID,
    appId: envParse.output.RHINESTONE_APP_ID,
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
