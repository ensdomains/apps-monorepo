import { vValidator } from '@hono/valibot-validator'
import { match, P } from 'ts-pattern'
import * as v from 'valibot'
import { injectDb } from '#app/middleware/database.js'
import { injectEthClient } from '#app/middleware/eth.js'
import { createApp, internalServerError } from '#app/middleware/hono.js'
import { createJWT } from '#services/auth/index.js'
import { ethAddress, hex } from '#utils/validation.js'

export default createApp().post(
  '/',
  vValidator(
    'json',
    v.object({
      address: ethAddress,
      message: v.string(),
      signature: hex,
      nonce: v.string(),
    }),
  ),
  injectEthClient,
  injectDb,
  async (c) => {
    const { address, message, signature, nonce } = c.req.valid('json')

    const jwt = await createJWT({
      env: c.env,
      client: c.var.ethClient,
      db: c.var.db,
      address,
      message,
      signature,
      nonce,
    })

    if (jwt.isErr()) {
      return match(jwt.error)

        .with({ _tag: 'INVALID_SIGNATURE' }, () =>
          c.json({ error: 'Invalid signature' }, 400),
        )
        .with({ _tag: 'INVALID_NONCE' }, () =>
          c.json({ error: 'Invalid nonce' }, 400),
        )
        .with(
          {
            _tag: P.union(
              'DATABASE_ERROR',
              'KV_ERROR',
              'SIGN_JWT_ERROR',
              'SIWE_VERIFY_ERROR',
            ),
          },
          (error) => internalServerError(c, error),
        )
        .exhaustive()
    }

    return c.json({ token: jwt.value })
  },
)
