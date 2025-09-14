import { ok, safeTry } from 'neverthrow'
import type { Address, Hash } from 'viem'
import { generateSiweNonce } from 'viem/siwe'
import { signJWT } from '@/core/auth/jwt'
import type { Database } from '@/core/database'
import type { ViemClient } from '@/core/eth/client'
import { intoKVResult, KV_KEY } from '@/core/kv'
import { error } from '@/utils/result'
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
    })

    if (!valid) {
      return error({
        code: 'INVALID_SIGNATURE',
        message: 'Unable to verify signature',
      })
    }

    yield* addUserIfNotExists(db, address)

    const jwt = yield* signJWT(
      {
        address,
      },
      env,
    )

    return ok(jwt)
  })
