import { describe, expect, it, vi } from 'vitest'
import {
  type ManagerActionKind,
  managerActionCatalog,
  type PreparedManagerAction,
} from './managerActions'
import {
  type ManagerActionContext,
  openManagerAction,
} from './openManagerAction'

const address = '0x0000000000000000000000000000000000000001'
const createContext = (): ManagerActionContext => ({
  isCurrent: () => true,
  navigate: vi.fn().mockResolvedValue(undefined),
  connectedAddress: address,
  openManagerReview: vi.fn(),
})
const action = (kind: ManagerActionKind): PreparedManagerAction => ({
  intent: 'manager_action',
  kind,
  name: 'example.eth',
  email: 'test@example.test',
  approval: 'eth-registry:hca',
  locale: 'sv',
})

describe('management action handoffs', () => {
  it.each(
    Object.keys(managerActionCatalog) as ManagerActionKind[],
  )('does nothing for stale %s requests', async (kind) => {
    const context = { ...createContext(), isCurrent: () => false }
    await openManagerAction(action(kind), context)
    expect(context.navigate).not.toHaveBeenCalled()
    expect(context.openManagerReview).not.toHaveBeenCalled()
  })

  it.each(
    (Object.keys(managerActionCatalog) as ManagerActionKind[]).filter(
      (kind) =>
        ![
          'view_address',
          'show_dashboard',
          'show_favorites',
          'show_notifications',
          'open_notification_settings',
          'migration_permissions',
        ].includes(kind),
    ),
  )('opens a review without mutating for %s', async (kind) => {
    const context = createContext()
    const proposed = action(kind)
    expect(await openManagerAction(proposed, context)).toBeNull()
    expect(context.openManagerReview).toHaveBeenCalledExactlyOnceWith(proposed)
    expect(context.navigate).not.toHaveBeenCalled()
  })

  it.each([
    ['show_dashboard', 'owned'],
    ['show_favorites', 'favorites'],
  ] as const)('opens %s in the correct dashboard tab', async (kind, tab) => {
    const context = createContext()
    await openManagerAction(action(kind), context)
    expect(context.navigate).toHaveBeenCalledExactlyOnceWith({
      to: '/dashboard',
      search: { tab },
    })
  })

  it('retains both notification view facets', async () => {
    const context = createContext()
    await openManagerAction(
      {
        ...action('show_notifications'),
        unreadOnly: true,
        notificationTag: 'expiry',
      },
      context,
    )
    expect(context.navigate).toHaveBeenCalledExactlyOnceWith({
      to: '/notifications',
      search: { unread: true, tag: 'expiry' },
    })
  })

  it('opens ordinary notification settings without creating a preference edit', async () => {
    const context = createContext()
    await openManagerAction(action('open_notification_settings'), context)
    expect(context.navigate).toHaveBeenCalledExactlyOnceWith({
      to: '/notifications/settings',
      search: {},
    })
    expect(context.openManagerReview).not.toHaveBeenCalled()
  })

  it('opens only an explicitly identified address or the explicit own-wallet target', async () => {
    const context = createContext()
    expect(await openManagerAction(action('view_address'), context)).toContain(
      'valid Ethereum address',
    )
    expect(context.navigate).not.toHaveBeenCalled()
    await openManagerAction(
      { ...action('view_address'), ownWallet: true },
      context,
    )
    expect(context.navigate).toHaveBeenCalledExactlyOnceWith({
      to: '/$address',
      params: { address },
    })
  })

  it('does not replace an invalid explicit address with connected wallet', async () => {
    const context = createContext()
    expect(
      await openManagerAction(
        { ...action('view_address'), address: '0xinvalid', ownWallet: true },
        context,
      ),
    ).toContain('valid Ethereum address')
    expect(context.navigate).not.toHaveBeenCalled()
  })

  it('opens existing migration permissions without choosing a revocation', async () => {
    const context = createContext()
    await openManagerAction(action('migration_permissions'), context)
    expect(context.navigate).toHaveBeenCalledExactlyOnceWith({
      to: '/migration-permissions',
    })
    expect(context.openManagerReview).not.toHaveBeenCalled()
  })

  it('propagates navigation failure without executing another action', async () => {
    const context = createContext()
    vi.mocked(context.navigate).mockRejectedValue(
      new Error('navigation failed'),
    )
    await expect(
      openManagerAction(action('show_dashboard'), context),
    ).rejects.toThrow('navigation failed')
    expect(context.openManagerReview).not.toHaveBeenCalled()
  })
})
