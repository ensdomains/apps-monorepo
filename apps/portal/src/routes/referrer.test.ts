// @vitest-environment happy-dom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type Router,
  redirect,
} from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { Route } from './__root'
import { Route as RegisterRoute } from './register/index'

// Exercise the real root search policy: form links omit search, so attribution
// must be carried by the inherited middleware, including across redirects.
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
const profile = createRoute({
  getParentRoute: () => root,
  path: '/$name',
  loader: ({ params }) => {
    if (params.name === 'ALICE.eth')
      throw redirect({ to: '/$name', params: { name: 'alice.eth' } })
  },
})
const register = createRoute({
  getParentRoute: () => root,
  path: '/register/',
  validateSearch: RegisterRoute.options.validateSearch,
})
const routeTree = root.addChildren([subnames, create, profile, register])

const buildRouter = (initialUrl: string): Router<typeof routeTree> => {
  return createRouter({
    isServer: false,
    routeTree,
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

it('merges the root referrer with the real registration search validator', async () => {
  const router = buildRouter('/register/?name=alice.eth&referrer=0x1234')
  await router.load()
  expect(router.state.matches.at(-1)?.search).toMatchObject({
    name: 'alice.eth',
    referrer: '0x1234',
  })
  await router.navigate({ to: '/$name', params: { name: 'alice.eth' } })
  expect(router.state.location.href).toBe('/alice.eth?referrer=0x1234')
})
