import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  batchClient: { id: 'batch' },
  directClient: { id: 'direct' },
  getRecords: vi.fn(),
  isDebugProfileName: vi.fn(() => false),
}))

vi.mock('@ensdomains/ensjs/public', () => ({ getRecords: mocks.getRecords }))
vi.mock('@/lib/wagmi/helpers', async () => {
  const { ok } = await import('neverthrow')
  return { safeGetClient: () => ok(mocks.directClient) }
})
vi.mock('./nameRowRecordsClient', () => ({
  nameRowRecordsClient: mocks.batchClient,
}))
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
    expect(mocks.getRecords).toHaveBeenCalledExactlyOnceWith(
      mocks.batchClient,
      {
        name: 'gift.eth',
        texts: ['avatar', 'theme'],
      },
    )
  })

  it('keeps wildcard resolution on the UniversalResolver batch path', async () => {
    const texts = [{ key: 'avatar', value: 'ipfs://wildcard-avatar' }]
    mocks.getRecords.mockResolvedValue({ texts })

    expect(
      (await getNameRowRecords('sub.wildcard.eth'))._unsafeUnwrap(),
    ).toEqual({
      texts,
    })
    expect(mocks.getRecords).toHaveBeenCalledExactlyOnceWith(
      mocks.batchClient,
      { name: 'sub.wildcard.eth', texts: ['avatar', 'theme'] },
    )
  })

  it('retries a failed CCIP batch entry directly without retrying successful names', async () => {
    const ordinaryTexts = [{ key: 'theme', value: '#123456' }]
    const ccipTexts = [{ key: 'avatar', value: 'https://example.test/avatar' }]
    mocks.getRecords.mockImplementation(
      (client: object, { name }: { name: string }) => {
        if (client === mocks.batchClient && name === 'ccip.eth') {
          return Promise.reject(new Error('OffchainLookup in multicall'))
        }
        return Promise.resolve({
          texts: name === 'ccip.eth' ? ccipTexts : ordinaryTexts,
        })
      },
    )

    const [ordinary, ccip] = await Promise.all([
      getNameRowRecords('ordinary.eth'),
      getNameRowRecords('ccip.eth'),
    ])

    expect(ordinary._unsafeUnwrap()).toEqual({ texts: ordinaryTexts })
    expect(ccip._unsafeUnwrap()).toEqual({ texts: ccipTexts })
    expect(mocks.getRecords).toHaveBeenCalledTimes(3)
    expect(mocks.getRecords).toHaveBeenCalledWith(mocks.directClient, {
      name: 'ccip.eth',
      texts: ['avatar', 'theme'],
    })
    expect(mocks.getRecords).not.toHaveBeenCalledWith(mocks.directClient, {
      name: 'ordinary.eth',
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
