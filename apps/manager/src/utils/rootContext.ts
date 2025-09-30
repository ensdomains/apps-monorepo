import { AsyncLocalStorage } from 'node:async_hooks'
import { type RegisteredRouter, rootRouteId } from '@tanstack/react-router'
import { createIsomorphicFn, createServerOnlyFn } from '@tanstack/react-start'

const serverRouterStorage = new AsyncLocalStorage<RegisteredRouter>()

/**
 * Runs a function with a global context
 * Throws if ran on the client
 */
export const runWithServerRouterContext = createServerOnlyFn(
  <T>(router: RegisteredRouter, fn: () => T | Promise<T>) =>
    serverRouterStorage.run(router, fn),
)

const getRouterInstance = createIsomorphicFn()
  .client(() => window.__TSR_ROUTER__ as RegisteredRouter | undefined)
  .server(() => {
    const ctx = serverRouterStorage.getStore()
    if (!ctx) {
      throw new Error('No router found')
    }
    return ctx
  })

export type RootContext =
  RegisteredRouter['routesById'][typeof rootRouteId]['types']['allContext']

export const getRootContext = () => {
  const router = getRouterInstance()

  if (!router) {
    throw new Error('Router not found')
  }

  const match = router.getMatch('__root_') ?? router.state.matches[0]

  if (!match) {
    throw new Error('No root route match found')
  }

  const context = match.context as RootContext | undefined

  if (!context) {
    console.log('Context not found bruh', {
      state: router.state,
      match,
      rootRouteId,
    })
    throw new Error('Context not found')
  }

  return context
}
