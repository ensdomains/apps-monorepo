import {
  encodeAbiParameters,
  encodeEventTopics,
  namehash,
  parseAbi,
  zeroAddress,
  zeroHash,
} from 'viem'
import { describe, expect, it } from 'vitest'
import {
  parseResolverHistory,
  planResolverHistory,
  profileKeysForSource,
  RESOLVER_HISTORY_ABI,
  supplementalKeysForSource,
} from './v1ResolverHistory'

const source = {
  id: namehash('alice.eth'),
  name: 'alice.eth',
  resolver: '0x0000000000000000000000000000000000001234',
} as const
const request = {
  resolver: source.resolver,
  sources: [source],
  fromBlock: 0n,
  toBlock: 1_000_000n,
}
const baseLog = {
  address: source.resolver,
  blockNumber: '0x7b',
  blockHash: zeroHash,
  transactionHash: zeroHash,
  logIndex: '0x0',
  removed: false,
}
const interfaceLog = {
  ...baseLog,
  topics: encodeEventTopics({
    abi: RESOLVER_HISTORY_ABI,
    eventName: 'InterfaceChanged',
    args: { node: source.id, interfaceID: '0x12345678' },
  }),
  data: encodeAbiParameters([{ type: 'address' }], [zeroAddress]),
}

describe('resolver history', () => {
  it('reads historical text events whose duplicated key is stored entirely in data', () => {
    const unindexedText = parseAbi([
      'event TextChanged(bytes32 indexed node, string indexedKey, string key)',
    ])
    const key = 'legacy:κλειδί'
    const log = {
      ...baseLog,
      topics: encodeEventTopics({
        abi: unindexedText,
        eventName: 'TextChanged',
        args: { node: source.id },
      }),
      data: encodeAbiParameters(
        [{ type: 'string' }, { type: 'string' }],
        [key, key],
      ),
    }
    const records = parseResolverHistory([log], request)._unsafeUnwrap()
    expect(profileKeysForSource(source, records).texts).toEqual([key])
  })

  it('rejects historical text events whose nonindexed duplicate keys disagree', () => {
    const unindexedText = parseAbi([
      'event TextChanged(bytes32 indexed node, string indexedKey, string key)',
    ])
    const log = {
      ...baseLog,
      topics: encodeEventTopics({
        abi: unindexedText,
        eventName: 'TextChanged',
        args: { node: source.id },
      }),
      data: encodeAbiParameters(
        [{ type: 'string' }, { type: 'string' }],
        ['wrong.key', 'actual.key'],
      ),
    }
    expect(
      parseResolverHistory([log], request)._unsafeUnwrapErr().message,
    ).toBe('Resolver text history keys do not match')
  })

  it('rejects a truncated indexed log whose single key can alias both legacy fields', () => {
    const indexedText = parseAbi([
      'event TextChanged(bytes32 indexed node, string indexed indexedKey, string key)',
    ])
    const key = 'x'.repeat(32)
    const log = {
      ...baseLog,
      topics: encodeEventTopics({
        abi: indexedText,
        eventName: 'TextChanged',
        args: { node: source.id, indexedKey: key },
      }).slice(0, 2),
      data: encodeAbiParameters([{ type: 'string' }], [key]),
    }
    expect(parseResolverHistory([log], request).isErr()).toBe(true)
  })

  it('unions legacy and current text keys and both ETH address event variants, including cleared values', () => {
    const legacyText = parseAbi([
      'event TextChanged(bytes32 indexed node, string indexed indexedKey, string key)',
    ])
    const text = {
      ...baseLog,
      topics: encodeEventTopics({
        abi: legacyText,
        eventName: 'TextChanged',
        args: { node: source.id, indexedKey: 'legacy.key' },
      }),
      data: encodeAbiParameters([{ type: 'string' }], ['legacy.key']),
    }
    const address = {
      ...baseLog,
      topics: encodeEventTopics({
        abi: RESOLVER_HISTORY_ABI,
        eventName: 'AddrChanged',
        args: { node: source.id },
      }),
      data: encodeAbiParameters([{ type: 'address' }], [zeroAddress]),
    }
    const multicoin = {
      ...baseLog,
      topics: encodeEventTopics({
        abi: RESOLVER_HISTORY_ABI,
        eventName: 'AddressChanged',
        args: { node: source.id },
      }),
      data: encodeAbiParameters(
        [{ type: 'uint256' }, { type: 'bytes' }],
        [60n, '0x'],
      ),
    }
    const records = parseResolverHistory(
      [text, text, address, multicoin],
      request,
    )._unsafeUnwrap()
    expect(profileKeysForSource(source, records)).toEqual({
      id: source.id,
      texts: ['legacy.key'],
      coinTypes: [60n],
      hasContentHash: false,
      abiContentTypes: [],
      interfaceIds: [],
    })
  })

  it('rejects a text key whose indexed hash does not match the decoded key', () => {
    const log = {
      ...baseLog,
      topics: encodeEventTopics({
        abi: RESOLVER_HISTORY_ABI,
        eventName: 'TextChanged',
        args: { node: source.id, indexedKey: 'different.key' },
      }),
      data: encodeAbiParameters(
        [{ type: 'string' }, { type: 'string' }],
        ['actual.key', 'value'],
      ),
    }
    expect(
      parseResolverHistory([log], request)._unsafeUnwrapErr().message,
    ).toBe('Resolver text history key does not match its indexed hash')
  })

  it.each([3n, 6n])(
    'rejects invalid ABI content type %s without omitting its inventory',
    (contentType) => {
      const log = {
        ...baseLog,
        topics: encodeEventTopics({
          abi: RESOLVER_HISTORY_ABI,
          eventName: 'ABIChanged',
          args: { node: source.id, contentType },
        }),
        data: '0x',
      }
      expect(
        parseResolverHistory([log], request)._unsafeUnwrapErr().message,
      ).toBe('Resolver ABI history contains an invalid content type')
    },
  )

  it('retains legacy ABI zero-mask history for the current getter', () => {
    const log = {
      ...baseLog,
      topics: encodeEventTopics({
        abi: RESOLVER_HISTORY_ABI,
        eventName: 'ABIChanged',
        args: { node: source.id, contentType: 0n },
      }),
      data: '0x',
    }
    const records = parseResolverHistory([log], request)._unsafeUnwrap()
    expect(profileKeysForSource(source, records).abiContentTypes).toEqual([0n])
  })

  it('preserves a full uint256 coin type without number conversion', () => {
    const log = {
      ...baseLog,
      topics: encodeEventTopics({
        abi: RESOLVER_HISTORY_ABI,
        eventName: 'AddressChanged',
        args: { node: source.id },
      }),
      data: encodeAbiParameters(
        [{ type: 'uint256' }, { type: 'bytes' }],
        [1n << 255n, '0x1234'],
      ),
    }
    const records = parseResolverHistory([log], request)._unsafeUnwrap()
    expect(profileKeysForSource(source, records).coinTypes).toEqual([
      1n << 255n,
    ])
  })

  it('covers every block and node once while grouping case-insensitive resolver addresses', () => {
    const sources = Array.from({ length: 401 }, (_, index) => ({
      ...source,
      name: `name${index}.eth`,
      id: namehash(`name${index}.eth`),
    }))
    const plan = planResolverHistory({
      sources,
      chainId: 11155111,
      toBlock: 2_000_000n,
    })
    expect(
      plan.map(({ fromBlock, toBlock, sources }) => [
        fromBlock,
        toBlock,
        sources.length,
      ]),
    ).toEqual([
      [0n, 999_999n, 200],
      [1_000_000n, 1_999_999n, 200],
      [2_000_000n, 2_000_000n, 200],
      [0n, 999_999n, 200],
      [1_000_000n, 1_999_999n, 200],
      [2_000_000n, 2_000_000n, 200],
      [0n, 999_999n, 1],
      [1_000_000n, 1_999_999n, 1],
      [2_000_000n, 2_000_000n, 1],
    ])
    expect(
      plan
        .filter(({ fromBlock }) => fromBlock === 0n)
        .flatMap(({ sources }) => sources.map(({ id }) => id)),
    ).toEqual(sources.map(({ id }) => id))
  })

  it('starts canonical mainnet resolvers at their deployment block and unknown resolvers at genesis', () => {
    const known = {
      ...source,
      resolver: '0x4976FB03C32e5B8cfe2b6cCB31c09Ba78EBaBa41',
    } as const
    expect(
      planResolverHistory({
        sources: [known, source],
        chainId: 1,
        toBlock: 9_412_610n,
      })
        .filter(({ resolver }) => resolver === known.resolver)
        .map(({ fromBlock, toBlock }) => [fromBlock, toBlock]),
    ).toEqual([[9_412_610n, 9_412_610n]])
    expect(
      planResolverHistory({
        sources: [known],
        chainId: 11155111,
        toBlock: 1n,
      }).map(({ fromBlock, toBlock }) => [fromBlock, toBlock]),
    ).toEqual([[0n, 1n]])
  })

  it('retains a cleared interface once and a cleared name while keeping resolver histories separate', () => {
    const nameLog = {
      ...baseLog,
      topics: encodeEventTopics({
        abi: RESOLVER_HISTORY_ABI,
        eventName: 'NameChanged',
        args: { node: source.id },
      }),
      data: encodeAbiParameters([{ type: 'string' }], ['']),
    }
    const records = parseResolverHistory(
      [interfaceLog, interfaceLog, nameLog],
      request,
    )._unsafeUnwrap()
    expect(supplementalKeysForSource(source, records)).toEqual({
      interfaceIds: ['0x12345678'],
      hasName: true,
    })
    expect(
      supplementalKeysForSource({ ...source, resolver: zeroAddress }, records),
    ).toEqual({ interfaceIds: [], hasName: false })
  })

  it.each([
    { eventName: 'DNSZoneCleared', data: '0x' },
    {
      eventName: 'DNSRecordChanged',
      data: encodeAbiParameters(
        [{ type: 'bytes' }, { type: 'uint16' }, { type: 'bytes' }],
        ['0x03666f6f00', 1, '0x7f000001'],
      ),
    },
    {
      eventName: 'DNSRecordDeleted',
      data: encodeAbiParameters(
        [{ type: 'bytes' }, { type: 'uint16' }],
        ['0x03666f6f00', 1],
      ),
    },
    {
      eventName: 'DNSZonehashChanged',
      data: encodeAbiParameters(
        [{ type: 'bytes' }, { type: 'bytes' }],
        ['0x1234', '0x'],
      ),
    },
  ] as const)(
    'blocks $eventName including deletion and clearing',
    ({ eventName, data }) => {
      const log = {
        ...baseLog,
        topics: encodeEventTopics({
          abi: RESOLVER_HISTORY_ABI,
          eventName,
          args: { node: source.id },
        }),
        data,
      }
      expect(
        parseResolverHistory([log], request)._unsafeUnwrapErr(),
      ).toMatchObject({
        name: 'UnsupportedResolverRecordsError',
        ensName: 'alice.eth',
        recordType: 'dns',
      })
    },
  )

  it.each([
    { removed: true },
    { blockNumber: null },
    { blockNumber: '0xf4241' },
    { address: zeroAddress },
    { topics: [zeroHash, source.id] },
    { topics: interfaceLog.topics.slice(0, 2) },
    { data: '0x' },
    {
      topics: [
        interfaceLog.topics[0],
        namehash('bob.eth'),
        interfaceLog.topics[2],
      ],
    },
  ])(
    'refuses malformed, removed, undecodable or unrequested logs: %j',
    (overrides) => {
      expect(
        parseResolverHistory(
          [{ ...interfaceLog, ...overrides }],
          request,
        ).isErr(),
      ).toBe(true)
    },
  )

  it.each([null, {}, { result: [] }])(
    'does not interpret a malformed collection as empty history: %j',
    (response) => {
      expect(parseResolverHistory(response, request).isErr()).toBe(true)
    },
  )
})
