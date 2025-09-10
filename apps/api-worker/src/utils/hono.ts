import { Hono, type Schema } from 'hono'
import type { HonoOptions } from 'hono/hono-base'
import type { BlankEnv, BlankSchema, Env as HonoEnv } from 'hono/types'

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
