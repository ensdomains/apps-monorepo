import { vValidator } from '@hono/valibot-validator'
import { match, P } from 'ts-pattern'
import * as v from 'valibot'
import { createJWT, createNonce } from '@/services/auth'
import { ethAddress } from '@/utils/validation'
import { injectDb } from '../middleware/database'
import { injectEthClient } from '../middleware/eth'
import { createApp, internalServerError } from '../utils/hono'

const app = createApp()

app.post('/nonce', async (c) => {
  const nonce = await createNonce(c.env)

  if (nonce.isErr()) {
    return c.json({ error: 'Failed to create nonce' }, 500)
  }

  return c.json({ nonce: nonce.value })
})

app.post(
  '/login',
  vValidator(
    'json',
    v.object({
      address: ethAddress,
      message: v.string(),
      signature: ethAddress,
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
        .with({ code: 'INVALID_SIGNATURE' }, () =>
          c.json({ error: 'Invalid signature' }, 400),
        )
        .with({ code: 'INVALID_NONCE' }, () =>
          c.json({ error: 'Invalid nonce' }, 400),
        )
        .with(
          {
            code: P.union(
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

export default app
