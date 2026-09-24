import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  client: {},
  getRecords: vi.fn(),
  isDebugProfileName: vi.fn(() => false),
}))

vi.mock('@ensdomains/ensjs/public', () => ({ getRecords: mocks.getRecords }))
vi.mock('@/lib/wagmi/helpers', async () => {
  const { ok } = await import('neverthrow')
  return { safeGetClient: () => ok(mocks.client) }
})
vi.mock('@/utils/debug-features', () => ({
  isDebugProfileName: mocks.isDebugProfileName,
}))
vi.mock('@/features/profile/MOCK', () => ({
  DEBUG_PROFILE: {
    texts: [
      { key: 'theme', value: '#123456' },
      { key: 'description', value: 'Profile only' },
    ],
  },
}))

import { getNameRowRecords, nameRowRecordsQuery } from './nameRowRecordsQuery'

describe('dashboard row records', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isDebugProfileName.mockReturnValue(false)
  })

  it('requests only avatar and theme, excluding coins, ABI and content hash', async () => {
    const texts = [{ key: 'theme', value: '#123456' }]
    mocks.getRecords.mockResolvedValue({ texts })

    expect((await getNameRowRecords('gift.eth'))._unsafeUnwrap()).toEqual({
      texts,
    })
    expect(mocks.getRecords).toHaveBeenCalledExactlyOnceWith(mocks.client, {
      name: 'gift.eth',
      texts: ['avatar', 'theme'],
    })
  })

  it('keeps row records distinct in the profile invalidation scope', () => {
    expect(nameRowRecordsQuery('gift.eth').queryKey).toEqual([
      {
        $scope: 'profile',
        $action: 'get_records',
        name: 'gift.eth',
        selection: 'name-row',
      },
    ])
  })

  it('preserves debug previews without a resolver request', async () => {
    mocks.isDebugProfileName.mockReturnValue(true)
    expect((await getNameRowRecords('debug.eth'))._unsafeUnwrap()).toEqual({
      texts: [{ key: 'theme', value: '#123456' }],
    })
    expect(mocks.getRecords).not.toHaveBeenCalled()
  })

  it('returns a query error when the resolver request fails', async () => {
    mocks.getRecords.mockRejectedValue(new Error('Resolver unavailable'))
    expect((await getNameRowRecords('gift.eth')).isErr()).toBe(true)
  })
})
