import { type Context, Hono, type Schema } from 'hono'
import type { HonoOptions } from 'hono/hono-base'
import type { BlankEnv, BlankSchema, Env as HonoEnv } from 'hono/types'
import { logger } from '#utils/logger.js'
import type { GenericError } from '#utils/result.js'

export type Variables<T> = {
  Variables: T
}

export type BaseEnv = {
  Bindings: CloudflareBindings
}

export const createApp = <
  BasePath extends string = '/',
  E extends HonoEnv = BlankEnv,
  S extends Schema = BlankSchema,
>(
  options?: HonoOptions<E & BaseEnv>,
) => {
  const baseApp = new Hono<E & BaseEnv, S, BasePath>(options)

  return baseApp
}

export function internalServerError<TError extends GenericError>(
  c: Context,
  { message, ...errMeta }: TError,
) {
  logger.error(message, {
    ...errMeta,
    path: c.req.path,
    method: c.req.method,
  })

  return c.json({ error: 'Internal server error' }, 500)
}
