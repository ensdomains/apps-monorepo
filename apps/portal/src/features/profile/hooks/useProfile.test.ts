import { BignameError } from '@ens-apps/indexer/bigname'
import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bigname } from '@/lib/bigname'
import { getProfile, parseRecordKeys } from './useProfile'
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
    vi.mocked(getRecords).mockReturnValue(okAsync({}) as never)
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

  it('reads the defaults for a name bigname has not indexed, and fails on other errors', async () => {
    vi.mocked(bigname.nameRecords).mockReturnValue(
      errAsync(new BignameError({ code: 'not_found', message: 'gone' })),
    )
    expect((await getProfile({ name: 'nope.eth' })).isOk()).toBe(true)
    expect(requested()?.texts).toContain('description')

    vi.mocked(bigname.nameRecords).mockReturnValue(
      errAsync(new BignameError({ code: 'overloaded', message: 'busy' })),
    )
    expect(
      (await getProfile({ name: 'busy.eth' }))._unsafeUnwrapErr()._tag,
    ).toBe('GetProfileError')
  })
})
