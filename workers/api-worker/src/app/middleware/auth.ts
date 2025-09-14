import { createMiddleware } from 'hono/factory'
import { jwt as honoJwt } from 'hono/jwt'
import * as v from 'valibot'
import type { BaseEnv, Variables } from '@/app/middleware/hono'
import { AuthPayload } from '@/core/auth/jwt'

export const verifySignature = createMiddleware<
  BaseEnv & {
    Variables: {
      address: string
    }
  }
>(async (c, next) => {
  const address = c.req.header('x-address')

  if (!address) {
    return c.json({ error: 'Missing signature or address' }, 401)
  }

  c.set('address', address)

  await next()
})

export const requireJWT = createMiddleware<BaseEnv>(async (c, next) => {
  const jwtMiddleware = honoJwt({
    secret: c.env.JWT_SECRET,
  })

  return jwtMiddleware(c, next)
})

export const verifyJWT = createMiddleware<
  BaseEnv &
    Variables<{
      address: string
    }>
>(async (c, next) => {
  const payload = v.safeParse(AuthPayload, c.get('jwtPayload'))

  if (!payload.success) {
    return c.json({ error: 'Invalid JWT payload' }, 401)
  }

  c.set('address', payload.output.address)

  await next()
})

export const requireAuth = [requireJWT, verifyJWT] as const
