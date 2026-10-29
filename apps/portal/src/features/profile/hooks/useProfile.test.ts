import { BignameError } from '@ens-apps/indexer/bigname'
import { errAsync, okAsync } from 'neverthrow'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bigname } from '@/lib/bigname'
import { getLinkedRecordKeys } from '@/utils/ens/getLinkedRecordKeys'
import { getProfile, isUnindexedResolver, parseRecordKeys } from './useProfile'
import { getRecords } from './useRecords'

vi.mock('@/lib/bigname', () => ({ bigname: { nameRecords: vi.fn() } }))
vi.mock('./useRecords', () => ({ getRecords: vi.fn() }))
vi.mock('@/utils/ens/getLinkedRecordKeys', () => ({
  getLinkedRecordKeys: vi.fn(),
}))

const OWN_RESOLVER: Address = '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63'
const PARENT_RESOLVER: Address = '0x6C9Fb0A64dcE231A971ba3407D058F23E97Acad0'

const inventory = (
  knownKeys: readonly string[],
  unsupportedKeys: readonly string[] = [],
  resolver: Address | null = null,
) =>
  vi.mocked(bigname.nameRecords).mockReturnValue(
    okAsync({
      data: {
        namespace: 'ens',
        resolver: resolver ? { chain_id: 1, address: resolver } : null,
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

describe('isUnindexedResolver', () => {
  it.each([
    {
      case: 'bigname has no resolver for the name',
      indexed: null,
      answering: PARENT_RESOLVER,
      expected: true,
    },
    {
      case: 'bigname names another resolver',
      indexed: OWN_RESOLVER,
      answering: PARENT_RESOLVER,
      expected: true,
    },
    {
      case: 'bigname names the answering resolver',
      indexed: PARENT_RESOLVER.toLowerCase() as Address,
      answering: PARENT_RESOLVER,
      expected: false,
    },
    {
      case: 'bigname has not indexed the name',
      indexed: undefined,
      answering: PARENT_RESOLVER,
      expected: false,
    },
    {
      case: 'no resolver answered',
      indexed: null,
      answering: undefined,
      expected: false,
    },
  ] as const)('$case: $expected', ({ indexed, answering, expected }) => {
    expect(
      isUnindexedResolver({
        indexedResolver: indexed,
        answeringResolver: answering,
      }),
    ).toBe(expected)
  })
})

describe('getProfile with a resolver bigname does not attribute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads the keys the answering resolver holds for the name', async () => {
    inventory([])
    const linkedRecords = { texts: [{ key: 'test', value: 'test' }] }
    vi.mocked(getRecords)
      .mockReturnValueOnce(
        okAsync({ resolverAddress: PARENT_RESOLVER }) as never,
      )
      .mockReturnValueOnce(okAsync(linkedRecords) as never)
    vi.mocked(getLinkedRecordKeys).mockResolvedValue({
      texts: ['test'],
      coins: [60],
    })

    const profile = await getProfile({ name: '1.dragonsy.eth' })

    expect(getLinkedRecordKeys).toHaveBeenCalledWith(
      expect.anything(),
      PARENT_RESOLVER,
      '1.dragonsy.eth',
    )
    const reread = vi.mocked(getRecords).mock.calls[1]?.[0]
    expect(reread?.texts).toEqual(
      expect.arrayContaining(['test', 'description']),
    )
    expect(reread).not.toHaveProperty('resolver')
    expect(profile._unsafeUnwrap()).toEqual({ records: linkedRecords })
  })

  it('reads once when bigname attributes the answering resolver', async () => {
    inventory([], [], PARENT_RESOLVER)
    vi.mocked(getRecords).mockReturnValue(
      okAsync({ resolverAddress: PARENT_RESOLVER }) as never,
    )

    await getProfile({ name: 'alice.eth' })

    expect(getLinkedRecordKeys).not.toHaveBeenCalled()
    expect(getRecords).toHaveBeenCalledOnce()
  })

  it('keeps the records it has when the resolver events cannot be read', async () => {
    inventory([])
    const records = { resolverAddress: PARENT_RESOLVER }
    vi.mocked(getRecords).mockReturnValue(okAsync(records) as never)
    vi.mocked(getLinkedRecordKeys).mockRejectedValue(new Error('archive'))

    const profile = await getProfile({ name: '1.dragonsy.eth' })

    expect(profile._unsafeUnwrap()).toEqual({ records })
    expect(getRecords).toHaveBeenCalledOnce()
  })
})
