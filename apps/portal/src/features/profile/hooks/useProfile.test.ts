import { BignameError } from '@ens-apps/indexer/bigname'
import { QueryClient } from '@tanstack/react-query'
import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bigname } from '@/lib/bigname'
import {
  getProfile,
  getProfileQueryOptions,
  parseRecordKeys,
} from './useProfile'
import { getRecords } from './useRecords'

vi.mock('@/lib/bigname', () => ({ bigname: { nameRecords: vi.fn() } }))
vi.mock('./useRecords', () => ({ getRecords: vi.fn() }))

const inventory = (
  knownKeys: readonly string[],
  unsupportedKeys: readonly string[] = [],
) =>
  vi.mocked(bigname.nameRecords).mockReturnValue(
    okAsync({
      data: {
        namespace: 'ens',
        resolver: null,
        records: {},
        inventory: {
          known_keys: knownKeys,
          unset_keys: [],
          unsupported_keys: unsupportedKeys,
          abi_content_types: [],
        },
      },
      meta: { as_of: {} },
    }),
  )

const requested = () => vi.mocked(getRecords).mock.calls[0]?.[0]

describe('parseRecordKeys', () => {
  it('reads text keys and coin types from bigname record keys', () => {
    expect(
      parseRecordKeys([
        'text:com.github',
        'addr:60',
        'addr:2147483658',
        'avatar',
        'contenthash',
        'addr:not-a-number',
        'addr:',
        'addr:01',
        'addr:0x3c',
      ]),
    ).toEqual({ texts: ['com.github', 'avatar'], coins: [60, 2147483658] })
  })
})

describe('getProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getRecords).mockReturnValue(
      okAsync({
        resolverAddress: '0x2222222222222222222222222222222222222222',
      }) as never,
    )
  })

  it('revalidates a cached empty profile instead of keeping an offchain name missing for an hour', async () => {
    inventory([])
    vi.mocked(getRecords).mockReturnValue(
      okAsync({
        resolverAddress: '0x2222222222222222222222222222222222222222',
        coins: [
          {
            coinType: 60,
            value: '0x2211d1D0020DAEA8039E46Cf1367962070d77DA9',
            symbol: 'eth',
          },
        ],
      }) as never,
    )
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: 3_600_000 } },
    })
    const options = getProfileQueryOptions({ name: 'jesse.base.eth' })
    client.setQueryData(
      options.queryKey,
      {
        records: {
          resolverAddress: '0x2222222222222222222222222222222222222222',
          texts: [],
          coins: [],
          contentHash: null,
          abi: null,
        },
      },
      { updatedAt: Date.now() - 10_000 },
    )
    try {
      await client.fetchQuery(options)
      expect(getRecords).toHaveBeenCalledTimes(1)
      await client.fetchQuery(options)
      expect(getRecords).toHaveBeenCalledTimes(1)
    } finally {
      client.clear()
    }
  })

  it('reads on-chain every key bigname lists, with the defaults', async () => {
    inventory(['text:com.github', 'addr:2147483658'])

    await getProfile({ name: 'alice.eth' })

    expect(bigname.nameRecords).toHaveBeenCalledWith('alice.eth', {
      namespace: 'ens',
      include: ['inventory'],
    })
    expect(requested()?.texts).toEqual(
      expect.arrayContaining(['com.github', 'description', 'avatar']),
    )
    expect(requested()?.coins).toEqual(
      expect.arrayContaining([2147483658, 60, 0]),
    )
  })

  it('still reads a key bigname cannot serve', async () => {
    inventory([], ['text:org.custom'])

    await getProfile({ name: 'alice.eth' })

    expect(requested()?.texts).toContain('org.custom')
  })

  it.each(['not_found', 'conflict', 'overloaded'] as const)(
    'resolves default records when the indexer returns %s',
    async (code) => {
      vi.mocked(bigname.nameRecords).mockReturnValue(
        errAsync(new BignameError({ code, message: 'unavailable' })),
      )
      await getProfile({ name: 'jesse.base.eth' })
      expect(requested()?.texts).toContain('description')
      expect(requested()?.coins).toContain(60)
    },
  )
})
