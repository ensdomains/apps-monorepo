import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useParams,
} from '@tanstack/react-router'
import { act, render, screen } from '@testing-library/react'
import { createContext, useContext } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cancelPaletteHandoff,
  type PaletteHandoffReadiness,
  paletteHandoff,
  preparePaletteHandoff,
} from './handoff'
import { navigatePalette } from './navigatePalette'
import { usePaletteHandoff } from './usePaletteHandoff'
import { usePaletteRouteLifecycle } from './usePaletteRouteLifecycle'

const ReadinessContext = createContext<PaletteHandoffReadiness>('checking')
const NOOP = () => {}
const Layout = () => {
  usePaletteRouteLifecycle(NOOP)
  return <Outlet />
}

afterEach(() => cancelPaletteHandoff())

describe('palette handoff route lifecycle', () => {
  it.each(['bob.eth', '👻.eth'])(
    'retains owned navigation but cancels departure and revisit for %s',
    async (targetName) => {
      const onOpen = vi.fn()
      const NameConsumer = () => {
        const { name = '' } = useParams({ strict: false })
        const readiness = useContext(ReadinessContext)
        usePaletteHandoff({
          kind: 'renew',
          name,
          chainId: 11155111,
          readiness,
          onOpen,
        })
        return <h1>{name}</h1>
      }
      const root = createRootRoute({ component: Layout })
      const dashboard = createRoute({
        getParentRoute: () => root,
        path: '/',
        component: () => <h1>Dashboard</h1>,
      })
      const name = createRoute({
        getParentRoute: () => root,
        path: '/$name',
        component: NameConsumer,
      })
      const records = createRoute({
        getParentRoute: () => root,
        path: '/$name/records',
        component: () => <h1>Other destination</h1>,
      })
      const router = createRouter({
        routeTree: root.addChildren([dashboard, name, records]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })
      const view = render(
        <ReadinessContext value="checking">
          <RouterProvider router={router} />
        </ReadinessContext>,
      )
      await screen.findByRole('heading', { name: 'Dashboard' })
      const requestId = preparePaletteHandoff({
        kind: 'renew',
        name: targetName,
        chainId: 11155111,
      })

      await act(async () => {
        await navigatePalette(router, {
          to: '/$name',
          params: { name: targetName },
        })
      })
      expect(paletteHandoff.getSnapshot().pending?.requestId).toBe(requestId)
      expect(onOpen).not.toHaveBeenCalled()

      await act(async () => {
        await navigatePalette(router, {
          to: '/$name/records',
          params: { name: 'alice.eth' },
        })
      })
      expect(paletteHandoff.getSnapshot().pending).toBeNull()
      expect(paletteHandoff.getSnapshot().outcome).toEqual({
        requestId,
        status: 'cancelled',
      })
      view.rerender(
        <ReadinessContext value="ready">
          <RouterProvider router={router} />
        </ReadinessContext>,
      )
      await act(async () => {
        await navigatePalette(router, {
          to: '/$name',
          params: { name: targetName },
        })
      })
      expect(screen.getByRole('heading')).toHaveTextContent(targetName)
      expect(onOpen).not.toHaveBeenCalled()
    },
  )
})
