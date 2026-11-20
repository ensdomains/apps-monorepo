import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, render, screen } from '@testing-library/react'
import { afterEach, assert, describe, expect, it, vi } from 'vitest'
import { useEditRecordsLeaveProtection } from '@/features/records/hooks/useEditRecordsLeaveProtection'
import { type ExecutionDependencies, executePlan } from './executePlan'
import { cancelPaletteHandoff, paletteHandoff } from './handoff'
import { navigatePalette } from './navigatePalette'

const NAME = 'alice.eth'
const Editor = () => {
  useEditRecordsLeaveProtection(1)
  return <h1>Unsaved editor</h1>
}

const setup = async (shouldLeave: boolean) => {
  const confirmation = vi.fn(() => shouldLeave)
  vi.stubGlobal('confirm', confirmation)
  const root = createRootRoute()
  const editor = createRoute({
    getParentRoute: () => root,
    path: '/$name/edit-records',
    component: Editor,
  })
  const records = createRoute({
    getParentRoute: () => root,
    path: '/$name/records',
    component: () => <h1>Records destination</h1>,
  })
  const profile = createRoute({
    getParentRoute: () => root,
    path: '/$name',
    component: () => <h1>Name destination</h1>,
  })
  const registration = createRoute({
    getParentRoute: () => root,
    path: '/register',
    component: () => <h1>Registration destination</h1>,
  })
  const router = createRouter({
    routeTree: root.addChildren([editor, records, profile, registration]),
    history: createMemoryHistory({ initialEntries: [`/${NAME}/edit-records`] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('heading', { name: 'Unsaved editor' })
  return { router, confirmation }
}

afterEach(() => {
  cancelPaletteHandoff()
  vi.unstubAllGlobals()
})

describe('palette navigation through existing router blockers', () => {
  it.each([false, true])(
    'resolves a native-confirm decision and confirms once: allow=%s',
    async (shouldLeave) => {
      const { router, confirmation } = await setup(shouldLeave)
      await act(async () => {
        await navigatePalette(router, {
          to: '/$name/records',
          params: { name: NAME },
        })
      })

      expect(confirmation).toHaveBeenCalledTimes(1)
      expect(router.state.location.pathname).toBe(
        shouldLeave ? `/${NAME}/records` : `/${NAME}/edit-records`,
      )
      expect(screen.getByRole('heading')).toHaveTextContent(
        shouldLeave ? 'Records destination' : 'Unsaved editor',
      )
    },
  )

  it('awaits guards in order and preserves the prospective query and history direction', async () => {
    const { router } = await setup(true)
    const calls: string[] = []
    const first = router.history.block({
      blockerFn: async () => {
        calls.push('first:start')
        await Promise.resolve()
        calls.push('first:end')
        return false
      },
    })
    const second = router.history.block({
      blockerFn: ({ currentLocation, nextLocation, action }) => {
        calls.push('second')
        expect(action).toBe('PUSH')
        expect(nextLocation.search).toBe('?name=bob.eth')
        expect(nextLocation.state.__TSR_index).toBe(
          currentLocation.state.__TSR_index + 1,
        )
        return true
      },
    })
    try {
      await act(async () => {
        await navigatePalette(router, {
          to: '/register',
          search: { name: 'bob.eth' },
        })
      })
      expect(calls).toEqual(['first:start', 'first:end', 'second'])
      expect(router.state.location.pathname).toBe(`/${NAME}/edit-records`)
    } finally {
      first()
      second()
    }
  })

  it('does not redirect a stale request after an asynchronous guard changes the source location', async () => {
    const { router } = await setup(true)
    const unregister = router.history.block({
      blockerFn: async () => {
        await router.navigate({
          to: '/$name/records',
          params: { name: 'carol.eth' },
          ignoreBlocker: true,
        })
        return false
      },
    })
    try {
      await act(async () => {
        await expect(
          navigatePalette(router, {
            to: '/$name',
            params: { name: 'bob.eth' },
          }),
        ).rejects.toBeInstanceOf(Error)
      })
      expect(router.state.location.pathname).toBe('/carol.eth/records')
    } finally {
      unregister()
    }
  })

  it('preserves encoded Unicode identity for raw history guards', async () => {
    const { router } = await setup(true)
    const unregister = router.history.block({
      blockerFn: ({ nextLocation }) =>
        nextLocation.pathname === '/%F0%9F%91%BB.eth/records',
    })
    try {
      await act(async () => {
        await navigatePalette(router, {
          to: '/$name/records',
          params: { name: '👻.eth' },
        })
      })
      expect(router.state.location.pathname).toBe(`/${NAME}/edit-records`)
    } finally {
      unregister()
    }
  })

  it('cancels an actual executor handoff after blocked navigation without replay on a later accepted visit', async () => {
    const { router, confirmation } = await setup(false)
    const dependencies: ExecutionDependencies = {
      chainId: 11155111,
      account: '0x1111111111111111111111111111111111111111',
      navigate: (navigation) => navigatePalette(router, navigation),
      isAtDestination: (navigation) =>
        router.buildLocation(navigation).href === router.state.location.href,
      writeClipboard: async () => {},
      connect: () => {},
      disconnect: async () => {},
      openRpc: () => {},
      openDeveloper: () => {},
    }
    const execution = executePlan(
      { type: 'handoff', kind: 'renew', name: 'bob.eth' },
      dependencies,
    )
    await act(async () => {
      await execution
    })
    const result = await execution
    assert(result.isErr())
    expect(confirmation).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe(`/${NAME}/edit-records`)
    expect(paletteHandoff.getSnapshot().pending).toBeNull()
    expect(paletteHandoff.getSnapshot().outcome?.status).toBe('cancelled')

    confirmation.mockReturnValue(true)
    await act(async () => {
      await navigatePalette(router, {
        to: '/$name',
        params: { name: 'bob.eth' },
      })
    })
    expect(paletteHandoff.getSnapshot().pending).toBeNull()
  })
})
