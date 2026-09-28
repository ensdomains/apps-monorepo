import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { type AiHandoffContext, openAiAction } from './openAiAction'
import type { PreparedAiAction } from './prepareAiHandoff'

vi.mock('@/features/notifications/services/preferenceSession', () => ({
  getPreferenceSession: () => ({ id: 'opaque-current-session' }),
}))

vi.mock('@/features/profile/service/profileOwner', () => ({
  profileOwnerQuery: (name: string) => ({ queryKey: ['owner', name] }),
}))

vi.mock('@/features/register-v2/data/queries/availability.query', () => ({
  getRegistrationV2AvailabilityQueryOptions: (name: string) => ({
    queryKey: ['availability', name],
  }),
}))

const makeContext = () => {
  const queryClient = new QueryClient()
  return {
    queryClient,
    navigate: vi.fn(async () => undefined),
    favoriteLabels: new Set<string>(),
    addFavorite: vi.fn().mockResolvedValue(undefined),
    openPrimary: vi.fn(),
    openBulkRenew: vi.fn(),
    openProfileEditor: vi.fn(),
    openManagerReview: vi.fn(),
    isCurrent: vi.fn(() => true),
  } satisfies AiHandoffContext
}

const deferred = () => {
  let resolve: (value: unknown) => void = () => {}
  const promise = new Promise<unknown>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('openAiAction', () => {
  it.each([
    'v1',
    'v2',
  ] as const)('preserves a supplied target date in the native %s renewal route without submitting', async (protocol) => {
    const context = makeContext()
    vi.spyOn(context.queryClient, 'fetchQuery').mockResolvedValue({
      owner: '0x1111111111111111111111111111111111111111',
      protocol,
    })
    await expect(
      openAiAction(
        { intent: 'renew', name: 'cedar.eth', targetDate: '2030-07-04' },
        context,
      ),
    ).resolves.toBeNull()
    expect(context.navigate).toHaveBeenCalledExactlyOnceWith({
      to: protocol === 'v1' ? '/renew-v1/$name' : '/renew/$name',
      params: { name: 'cedar.eth' },
      search: { targetDate: '2030-07-04' },
    })
    expect(context.openBulkRenew).not.toHaveBeenCalled()
    expect(context.addFavorite).not.toHaveBeenCalled()
  })

  it.each([
    [{ intent: 'set_primary', name: 'alice.eth' }, 'openPrimary'],
    [
      { intent: 'bulk_renew', filters: { expiry: 'expiring', withinDays: 45 } },
      'openBulkRenew',
    ],
    [
      {
        intent: 'edit_profile',
        name: 'alice.eth',
        section: 'contact',
        proposal: { field: 'github', value: 'alice' },
      },
      'openProfileEditor',
    ],
  ] as const)('opens only the existing review dialog for %j', async (action, dialog) => {
    const context = makeContext()
    await expect(openAiAction(action, context)).resolves.toBeNull()
    expect(context[dialog]).toHaveBeenCalledOnce()
    expect(context.navigate).not.toHaveBeenCalled()
    expect(context.addFavorite).not.toHaveBeenCalled()
    for (const other of [
      'openPrimary',
      'openBulkRenew',
      'openProfileEditor',
    ] as const) {
      if (other !== dialog) expect(context[other]).not.toHaveBeenCalled()
    }
  })

  it('keeps name search results on the current page', async () => {
    const context = makeContext()
    await expect(
      openAiAction(
        { intent: 'find_names', filters: { role: 'owner' } },
        context,
      ),
    ).resolves.toBeNull()
    expect(context.navigate).not.toHaveBeenCalled()
    expect(context.addFavorite).not.toHaveBeenCalled()
    expect(context.openBulkRenew).not.toHaveBeenCalled()
  })

  it.each([
    true,
    false,
  ])('preserves migration exclusions = %s in the existing review route', async (excludeManagerRestoration) => {
    const context = makeContext()
    await openAiAction(
      { intent: 'migrate', excludeManagerRestoration },
      context,
    )
    expect(context.navigate).toHaveBeenCalledExactlyOnceWith({
      to: '/migration',
      search: excludeManagerRestoration
        ? { preset: 'eligible-no-manager-restoration' }
        : {},
    })
  })

  it('proposes all eligible migration names only with an explicit all marker', async () => {
    const context = makeContext()
    await openAiAction(
      {
        intent: 'migrate',
        excludeManagerRestoration: false,
        allEligible: true,
      },
      context,
    )
    expect(context.navigate).toHaveBeenCalledExactlyOnceWith({
      to: '/migration',
      search: { preset: 'eligible-all' },
    })
    expect(context.addFavorite).not.toHaveBeenCalled()
  })

  it('keeps exclusions and exact names narrower than an all marker', async () => {
    const context = makeContext()
    await openAiAction(
      { intent: 'migrate', excludeManagerRestoration: true, allEligible: true },
      context,
    )
    expect(context.navigate).toHaveBeenCalledExactlyOnceWith({
      to: '/migration',
      search: { preset: 'eligible-no-manager-restoration' },
    })
    context.navigate.mockClear()
    await openAiAction(
      {
        intent: 'migrate',
        excludeManagerRestoration: false,
        allEligible: true,
        names: ['exact.eth'],
      },
      context,
    )
    expect(context.navigate).toHaveBeenCalledExactlyOnceWith({
      to: '/migration',
      search: { names: ['exact.eth'] },
    })
  })

  it.each([
    ['favouritedNameExpiry', true],
    ['favouritedNameExpiry', false],
    ['ownedNameExpiry', true],
    ['ownedNameExpiry', false],
    ['ensLabsUpdates', true],
    ['ensLabsUpdates', false],
  ] as const)('preserves notification %s enabled = %s without saving it', async (preference, enabled) => {
    const context = makeContext()
    await openAiAction({ intent: 'notification', preference, enabled }, context)
    expect(context.navigate).toHaveBeenCalledExactlyOnceWith({
      to: '/notifications/settings',
      search: {
        aiPreference: preference,
        aiEnabled: enabled,
        aiPreferenceSession: 'opaque-current-session',
      },
    })
    expect(context.addFavorite).not.toHaveBeenCalled()
  })

  it('adds a favourite only once and reports an existing favourite', async () => {
    const context = makeContext()
    await expect(
      openAiAction({ intent: 'favorite', name: 'alice.eth' }, context),
    ).resolves.toBeNull()
    expect(context.addFavorite).toHaveBeenCalledExactlyOnceWith({
      name: 'alice.eth',
    })
    context.favoriteLabels.add('alice.eth')
    await expect(
      openAiAction({ intent: 'favorite', name: 'ALICE.eth' }, context),
    ).resolves.toBe('ALICE.eth is already in your favourites.')
    expect(context.addFavorite).toHaveBeenCalledOnce()
    expect(context.navigate).not.toHaveBeenCalled()
  })

  it('opens the exact requested name profile', async () => {
    const context = makeContext()
    await openAiAction({ intent: 'view_name', name: 'sub.alice.eth' }, context)
    expect(context.navigate).toHaveBeenCalledExactlyOnceWith({
      to: '/$name',
      params: { name: 'sub.alice.eth' },
    })
  })

  it('propagates failed favourite saves so the page can show failure rather than success', async () => {
    const context = makeContext()
    context.addFavorite.mockRejectedValueOnce(new Error('Unauthorised'))
    await expect(
      openAiAction({ intent: 'favorite', name: 'alice.eth' }, context),
    ).rejects.toThrow('Unauthorised')
    expect(context.navigate).not.toHaveBeenCalled()
  })

  it.each([
    { intent: 'register', name: 'alice.eth', durationDays: 69 },
    { intent: 'renew', name: 'alice.eth', durationDays: 10 },
  ] satisfies PreparedAiAction[])('does not navigate after a failed lookup for $intent', async (action) => {
    const context = makeContext()
    vi.spyOn(context.queryClient, 'fetchQuery').mockRejectedValueOnce(
      new Error('RPC unavailable'),
    )
    await expect(openAiAction(action, context)).rejects.toThrow(
      'RPC unavailable',
    )
    expect(context.navigate).not.toHaveBeenCalled()
  })

  it.each([
    { intent: 'set_primary', name: 'alice.eth' },
    { intent: 'register', name: 'alice.eth', durationDays: 69 },
    { intent: 'renew', name: 'alice.eth', durationDays: 10 },
    { intent: 'find_names', filters: { role: 'owner' } },
    { intent: 'bulk_renew', filters: { role: 'owner' } },
    { intent: 'migrate', excludeManagerRestoration: true },
    { intent: 'edit_profile', name: 'alice.eth', section: 'general' },
    { intent: 'notification', preference: 'ownedNameExpiry', enabled: false },
    { intent: 'favorite', name: 'alice.eth' },
    { intent: 'view_name', name: 'alice.eth' },
  ] satisfies PreparedAiAction[])('does nothing for a dismissed or superseded $intent action', async (action) => {
    const context = makeContext()
    context.isCurrent.mockReturnValue(false)
    const fetchQuery = vi.spyOn(context.queryClient, 'fetchQuery')
    await expect(openAiAction(action, context)).resolves.toBeNull()
    expect(fetchQuery).not.toHaveBeenCalled()
    expect(context.navigate).not.toHaveBeenCalled()
    expect(context.addFavorite).not.toHaveBeenCalled()
    expect(context.openPrimary).not.toHaveBeenCalled()
    expect(context.openBulkRenew).not.toHaveBeenCalled()
    expect(context.openProfileEditor).not.toHaveBeenCalled()
  })

  it('does not navigate if registration is dismissed during availability lookup', async () => {
    const context = makeContext()
    const lookup = deferred()
    vi.spyOn(context.queryClient, 'fetchQuery').mockReturnValue(lookup.promise)
    const result = openAiAction(
      { intent: 'register', name: 'available.eth', durationDays: 69 },
      context,
    )

    context.isCurrent.mockReturnValue(false)
    lookup.resolve({ isAvailable: true })

    await expect(result).resolves.toBeNull()
    expect(context.navigate).not.toHaveBeenCalled()
  })

  it('does not navigate if renewal is dismissed during owner lookup', async () => {
    const context = makeContext()
    const lookup = deferred()
    vi.spyOn(context.queryClient, 'fetchQuery').mockReturnValue(lookup.promise)
    const result = openAiAction(
      { intent: 'renew', name: 'registered.eth', durationYears: 2 },
      context,
    )

    context.isCurrent.mockReturnValue(false)
    lookup.resolve({ owner: '0x1234', protocol: 'v2' })

    await expect(result).resolves.toBeNull()
    expect(context.navigate).not.toHaveBeenCalled()
  })

  it('preserves the requested registration duration on an active handoff', async () => {
    const context = makeContext()
    vi.spyOn(context.queryClient, 'fetchQuery').mockResolvedValue({
      isAvailable: true,
    })

    await openAiAction(
      { intent: 'register', name: 'available.eth', durationDays: 69 },
      context,
    )

    expect(context.navigate).toHaveBeenCalledWith({
      to: '/register/$name',
      params: { name: 'available.eth' },
      search: { durationDays: 69 },
    })
  })

  it.each([
    ['v1', '/renew-v1/$name', { durationYears: 2 }],
    ['v2', '/renew/$name', { durationYears: 2 }],
    ['v1', '/renew-v1/$name', { durationDays: 69 }],
    ['v2', '/renew/$name', { durationDays: 69 }],
  ] as const)('preserves duration on the %s renewal route %s with %j', async (protocol, route, duration) => {
    const context = makeContext()
    vi.spyOn(context.queryClient, 'fetchQuery').mockResolvedValue({
      owner: '0x1234',
      protocol,
    })

    await openAiAction(
      { intent: 'renew', name: 'registered.eth', ...duration },
      context,
    )

    expect(context.navigate).toHaveBeenCalledWith({
      to: route,
      params: { name: 'registered.eth' },
      search: duration,
    })
  })

  it('retains unavailable registration and missing-owner renewal feedback', async () => {
    const context = makeContext()
    const fetchQuery = vi.spyOn(context.queryClient, 'fetchQuery')
    fetchQuery.mockResolvedValueOnce({ isAvailable: false })
    await expect(
      openAiAction(
        { intent: 'register', name: 'taken.eth', durationDays: 69 },
        context,
      ),
    ).resolves.toBe('taken.eth is unavailable for registration.')

    fetchQuery.mockResolvedValueOnce(null)
    await expect(
      openAiAction(
        { intent: 'renew', name: 'unregistered.eth', durationYears: 2 },
        context,
      ),
    ).resolves.toBe(
      'Manager could not find an active registration for this name.',
    )
    expect(context.navigate).not.toHaveBeenCalled()
  })

  it('skips immediate actions when their dialog has already been dismissed', async () => {
    const context = makeContext()
    context.isCurrent.mockReturnValue(false)

    await openAiAction({ intent: 'favorite', name: 'name.eth' }, context)
    await openAiAction({ intent: 'set_primary', name: 'name.eth' }, context)

    expect(context.addFavorite).not.toHaveBeenCalled()
    expect(context.openPrimary).not.toHaveBeenCalled()
  })
})
