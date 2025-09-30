import { ok, safeTry } from 'neverthrow'
import type { Address, Hash } from 'viem'
import { generateSiweNonce } from 'viem/siwe'
import { signJWT } from '#core/auth/jwt.js'
import type { Database } from '#core/database/index.js'
import type { ViemClient } from '#core/eth/client.js'
import { intoKVResult, KV_KEY } from '#core/kv/index.js'
import { error } from '#utils/result.js'
import { addUserIfNotExists } from '../users'
import { safeVerifySiweMessage } from './helpers'

export const createNonce = (env: CloudflareBindings) => {
  const nonce = generateSiweNonce()

  return intoKVResult(
    env.KV.put(KV_KEY.AUTH.NONCE(nonce), nonce, {
      expirationTtl: 60 * 30, // 30 minutes
    }),
  ).map((_) => nonce)
}

export const verifyAndConsumeNonce = (env: CloudflareBindings, nonce: string) =>
  safeTry(async function* () {
    const value = yield* intoKVResult(env.KV.get(KV_KEY.AUTH.NONCE(nonce)))

    if (!value) {
      return error({
        code: 'INVALID_NONCE',
        message: 'Invalid nonce',
      })
    }

    yield* intoKVResult(env.KV.delete(KV_KEY.AUTH.NONCE(nonce)))

    return ok(value)
  })

export const createJWT = ({
  env,
  client,
  db,
  address,
  message,
  signature,
  nonce,
}: {
  env: CloudflareBindings
  client: ViemClient
  db: Database
  address: Address
  message: string
  signature: Hash
  nonce: string
}) =>
  safeTry(async function* () {
    yield* verifyAndConsumeNonce(env, nonce)

    const valid = yield* safeVerifySiweMessage(client, {
      address,
      message,
      signature,
      nonce,
      // TODO: CRITICAL Add domain verification
      // domain: 'app.ens.domains',
    })

    if (!valid) {
      return error({
        code: 'INVALID_SIGNATURE',
        message: 'Unable to verify signature',
      })
    }

    const user = yield* addUserIfNotExists(db, address)
    console.log('user', user)

    const jwt = yield* signJWT(
      {
        address,
        user_id: user.id,
      },
      env,
    )

    return ok(jwt)
  })
