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
    path: '/$name/subnames',
  })
  const create = createRoute({
    getParentRoute: () => root,
    path: '/$name/create-subname',
  })
  const register = createRoute({
    getParentRoute: () => root,
    path: '/$name',
    loader: ({ params }) => {
      if (params.name === 'ALICE.eth')
        throw redirect({ to: '/$name', params: { name: 'alice.eth' } })
    },
  })
  return createRouter({
    isServer: false,
    routeTree: root.addChildren([subnames, create, register]),
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
  })
}

describe('referrer navigation', () => {
  it('retains referrer from the subname list to the form and new child profile', async () => {
    const router = buildRouter('/parent.eth/subnames?referrer=0x1234')
    await router.load()
    await router.navigate({
      to: '/$name/create-subname',
      params: { name: 'parent.eth' },
    })
    expect(router.state.location.href).toBe(
      '/parent.eth/create-subname?referrer=0x1234',
    )
    await router.navigate({
      to: '/$name',
      params: { name: 'child.parent.eth' },
    })
    expect(router.state.location.href).toBe('/child.parent.eth?referrer=0x1234')
  })
  it('retains referrer when canonicalizing a name URL', async () => {
    const router = buildRouter('/ALICE.eth?referrer=0x1234')
    await router.load()
    expect(router.state.location.href).toBe('/alice.eth?referrer=0x1234')
  })
  it('does not introduce a referrer when none was supplied', async () => {
    const router = buildRouter('/parent.eth/subnames')
    await router.load()
    await router.navigate({
      to: '/$name/create-subname',
      params: { name: 'parent.eth' },
    })
    expect(router.state.location.href).toBe('/parent.eth/create-subname')
  })
})
