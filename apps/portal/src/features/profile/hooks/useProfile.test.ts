import { IndexerReadError, type RecordKeys } from '@ens-apps/indexer/reads'
import { getRecordKeys } from '@ensdomains/ensjs/public/v2'
import { errAsync, okAsync, type ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { indexer } from '@/lib/indexer'
import { getProfile, isUnindexedResolver, parseRecordKeys } from './useProfile'
import { getRecords } from './useRecords'

vi.mock('@/lib/indexer', () => ({ indexer: { getRecordKeys: vi.fn() } }))
vi.mock('./useRecords', () => ({ getRecords: vi.fn() }))
vi.mock('@ensdomains/ensjs/public/v2', () => ({ getRecordKeys: vi.fn() }))

const OWN_RESOLVER: Address = '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63'
const PARENT_RESOLVER: Address = '0x6C9Fb0A64dcE231A971ba3407D058F23E97Acad0'

type KeysAnswer = ResultAsync<RecordKeys | null, IndexerReadError>

// The name's own keys and a resolver's keys are one read, told apart by `resolver`.
const byName = vi.fn((): KeysAnswer => okAsync(null))
const byResolver = vi.fn((): KeysAnswer => okAsync(null))
vi.mocked(indexer.getRecordKeys).mockImplementation(({ resolver }) =>
  resolver ? byResolver() : byName(),
)

const keysOf = (
  knownKeys: readonly string[],
  unsupportedKeys: readonly string[] = [],
  resolver: Address | null = null,
): RecordKeys => ({
  resolver,
  inventory: {
    knownKeys,
    unsetKeys: [],
    unsupportedKeys,
    abiContentTypes: [],
  },
})

const inventory = (
  knownKeys: readonly string[],
  unsupportedKeys: readonly string[] = [],
  resolver: Address | null = null,
) => {
  byName.mockReturnValue(okAsync(keysOf(knownKeys, unsupportedKeys, resolver)))
}

const resolverInventory = (knownKeys: readonly string[]) => {
  byResolver.mockReturnValue(
    okAsync(keysOf(knownKeys, [], PARENT_RESOLVER.toLowerCase() as Address)),
  )
}

const resolverReads = () =>
  vi
    .mocked(indexer.getRecordKeys)
    .mock.calls.filter(([query]) => query.resolver !== undefined)

const requested = () => vi.mocked(getRecords).mock.calls[0]?.[0]

describe('parseRecordKeys', () => {
  it('reads text keys and coin types from the indexer record keys', () => {
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

  it('reads on-chain every key the indexer lists, with the defaults', async () => {
    inventory(['text:com.github', 'addr:2147483658'])

    await getProfile({ name: 'alice.eth' })

    expect(indexer.getRecordKeys).toHaveBeenCalledWith({ name: 'alice.eth' })
    expect(requested()?.texts).toEqual(
      expect.arrayContaining(['com.github', 'description', 'avatar']),
    )
    expect(requested()?.coins).toEqual(
      expect.arrayContaining([2147483658, 60, 0]),
    )
  })

  it('still reads a key the indexer cannot serve', async () => {
    inventory([], ['text:org.custom'])

    await getProfile({ name: 'alice.eth' })

    expect(requested()?.texts).toContain('org.custom')
  })

  it('reads the defaults for a name the indexer has not indexed, and fails on other errors', async () => {
    byName.mockReturnValue(okAsync(null))
    expect((await getProfile({ name: 'nope.eth' })).isOk()).toBe(true)
    expect(requested()?.texts).toContain('description')

    byName.mockReturnValue(
      errAsync(
        new IndexerReadError({
          kind: 'unavailable',
          message: 'busy',
          cause: null,
        }),
      ),
    )
    expect(
      (await getProfile({ name: 'busy.eth' }))._unsafeUnwrapErr()._tag,
    ).toBe('GetProfileError')
  })
})

describe('isUnindexedResolver', () => {
  it.each([
    {
      case: 'the indexer has no resolver for the name',
      indexed: null,
      answering: PARENT_RESOLVER,
      expected: true,
    },
    {
      case: 'the indexer names another resolver',
      indexed: OWN_RESOLVER,
      answering: PARENT_RESOLVER,
      expected: true,
    },
    {
      case: 'the indexer names the answering resolver',
      indexed: PARENT_RESOLVER.toLowerCase() as Address,
      answering: PARENT_RESOLVER,
      expected: false,
    },
    {
      case: 'the indexer has not indexed the name',
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

describe('getProfile with a resolver the indexer does not attribute', () => {
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
    resolverInventory(['text:test', 'addr:60'])

    const profile = await getProfile({ name: '1.dragonsy.eth' })

    expect(indexer.getRecordKeys).toHaveBeenCalledWith({
      name: '1.dragonsy.eth',
      resolver: PARENT_RESOLVER,
    })
    const reread = vi.mocked(getRecords).mock.calls[1]?.[0]
    expect(reread?.texts).toEqual(
      expect.arrayContaining(['test', 'description']),
    )
    expect(reread).not.toHaveProperty('resolver')
    expect(profile._unsafeUnwrap()).toEqual({ records: linkedRecords })
  })

  it('reads once when the indexer attributes the answering resolver', async () => {
    inventory([], [], PARENT_RESOLVER)
    vi.mocked(getRecords).mockReturnValue(
      okAsync({ resolverAddress: PARENT_RESOLVER }) as never,
    )

    await getProfile({ name: 'alice.eth' })

    expect(resolverReads()).toEqual([])
    expect(getRecords).toHaveBeenCalledOnce()
  })

  it('keeps the records it has when the re-read fails', async () => {
    inventory([])
    const records = { resolverAddress: PARENT_RESOLVER }
    vi.mocked(getRecords)
      .mockReturnValueOnce(okAsync(records) as never)
      .mockReturnValueOnce(errAsync(new Error('timed out')) as never)
    resolverInventory(['text:test'])

    const profile = await getProfile({ name: '1.dragonsy.eth' })

    expect(profile._unsafeUnwrap()).toEqual({ records })
  })

  it('reads the keys on-chain when the indexer has none for the resolver', async () => {
    inventory([])
    vi.mocked(getRecords)
      .mockReturnValueOnce(
        okAsync({ resolverAddress: PARENT_RESOLVER }) as never,
      )
      .mockReturnValueOnce(okAsync({}) as never)
    byResolver.mockReturnValue(okAsync(null))
    vi.mocked(getRecordKeys).mockResolvedValue({
      texts: ['test'],
      coinTypes: [60n],
    })

    await getProfile({ name: '1.dragonsy.eth' })

    expect(getRecordKeys).toHaveBeenCalledWith(expect.anything(), {
      resolverAddress: PARENT_RESOLVER,
      name: '1.dragonsy.eth',
    })
    expect(vi.mocked(getRecords).mock.calls[1]?.[0]?.texts).toContain('test')
  })

  it('keeps the records it has when neither the indexer nor the logs have keys', async () => {
    inventory([])
    const records = { resolverAddress: PARENT_RESOLVER }
    vi.mocked(getRecords).mockReturnValue(okAsync(records) as never)
    byResolver.mockReturnValue(okAsync(null))
    vi.mocked(getRecordKeys).mockRejectedValue(new Error('range too large'))

    const profile = await getProfile({ name: '1.dragonsy.eth' })

    expect(profile._unsafeUnwrap()).toEqual({ records })
    expect(getRecords).toHaveBeenCalledOnce()
  })
})
