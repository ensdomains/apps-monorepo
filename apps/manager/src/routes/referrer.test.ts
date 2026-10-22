// @vitest-environment happy-dom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { Route } from './__root'

// Exercise the real root search policy: form links omit search, so attribution
// must be carried by the inherited middleware, including across redirects.
const buildRouter = (initialUrl: string) => {
  const root = createRootRoute({
    validateSearch: Route.options.validateSearch,
    search: Route.options.search,
  })
  const subnames = createRoute({
    getParentRoute: () => root,
    path: '/names',
  })
  const create = createRoute({
    getParentRoute: () => root,
    path: '/renew/$name',
  })
  const profile = createRoute({ getParentRoute: () => root, path: '/$name' })
  const register = createRoute({
    getParentRoute: () => root,
    path: '/register/$name',
    loader: ({ params }) => {
      if (params.name === 'ALICE.eth')
        throw redirect({ to: '/register/$name', params: { name: 'alice.eth' } })
    },
  })
  return createRouter({
    isServer: false,
    routeTree: root.addChildren([subnames, create, profile, register]),
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
  })
}

describe('referrer navigation', () => {
  it('retains referrer from a profile through renewal and back', async () => {
    const router = buildRouter('/parent.eth?referrer=0x1234')
    await router.load()
    await router.navigate({
      to: '/renew/$name',
      params: { name: 'parent.eth' },
    })
    expect(router.state.location.href).toBe('/renew/parent.eth?referrer=0x1234')
    await router.navigate({
      to: '/$name',
      params: { name: 'child.parent.eth' },
    })
    expect(router.state.location.href).toBe('/child.parent.eth?referrer=0x1234')
  })
  it('retains referrer when canonicalizing a registration URL', async () => {
    const router = buildRouter('/register/ALICE.eth?referrer=0x1234')
    await router.load()
    expect(router.state.location.href).toBe(
      '/register/alice.eth?referrer=0x1234',
    )
  })
  it('does not introduce a referrer when none was supplied', async () => {
    const router = buildRouter('/parent.eth')
    await router.load()
    await router.navigate({
      to: '/renew/$name',
      params: { name: 'parent.eth' },
    })
    expect(router.state.location.href).toBe('/renew/parent.eth')
  })
})
