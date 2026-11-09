import {
  BaseError,
  encodeAbiParameters,
  encodeEventTopics,
  HttpRequestError,
  InvalidParamsRpcError,
  labelhash,
  namehash,
  RpcRequestError,
  stringToHex,
  TimeoutError,
  UnknownRpcError,
  zeroAddress,
  zeroHash,
} from 'viem'
import { describe, expect, it } from 'vitest'
import {
  getProvenSubnameName,
  getSubnameInventoryLimit,
  isMissingRegistryFallbackGetter,
  NEW_OWNER_ABI,
  parseSubnameLogs,
  planSubnameLogReads,
  shouldRetrySubnameInventoryRead,
} from './rpcSubnameInventory'

const REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
const OLD_REGISTRY = '0x314159265dD8dbb310642f98f50C066173C1259b'
const ROOT = namehash('parent.eth')
const CHILD = namehash('child.parent.eth')
const request = {
  registries: [REGISTRY],
  parentNodes: [ROOT],
  fromBlock: 0n,
  toBlock: 100n,
} as const
const log = {
  address: REGISTRY,
  blockNumber: '0x32',
  blockHash: zeroHash,
  transactionHash: zeroHash,
  logIndex: '0x0',
  removed: false,
  topics: encodeEventTopics({
    abi: NEW_OWNER_ABI,
    eventName: 'NewOwner',
    args: { node: ROOT, label: labelhash('child') },
  }),
  data: encodeAbiParameters([{ type: 'address' }], [zeroAddress]),
}

describe('RPC subname inventory', () => {
  it.each([
    {
      label: 'uncorrelated provider batch error',
      cause: new UnknownRpcError(
        new TypeError("Cannot read properties of undefined (reading 'error')"),
      ),
      expected: true,
    },
    {
      label: 'timeout',
      cause: new TimeoutError({ url: 'https://rpc.example', body: {} }),
      expected: true,
    },
    {
      label: 'nested connection failure',
      cause: new BaseError('Contract read failed', {
        cause: new HttpRequestError({
          url: 'https://rpc.example',
          cause: new TypeError('Failed to fetch'),
        }),
      }),
      expected: true,
    },
    {
      label: 'archive fallback denied after a primary failure',
      cause: new HttpRequestError({ url: 'https://rpc.example', status: 403 }),
      expected: true,
    },
    {
      label: 'archive fallback RPC denial',
      cause: new InvalidParamsRpcError(
        new Error('Archive requests require a personal token'),
      ),
      expected: true,
    },
    {
      label: 'rate limit',
      cause: new RpcRequestError({
        url: 'https://rpc.example',
        body: {},
        error: { code: -32005, message: 'Rate limit exceeded' },
      }),
      expected: true,
    },
    {
      label: 'range limit that needs partitioning',
      cause: new RpcRequestError({
        url: 'https://rpc.example',
        body: {},
        error: {
          code: -32005,
          message: 'query returned more than 10000 results',
        },
      }),
      expected: false,
    },
    {
      label: 'contract rejection',
      cause: new RpcRequestError({
        url: 'https://rpc.example',
        body: {},
        error: { code: -32603, message: 'execution reverted' },
      }),
      expected: false,
    },
    {
      label: 'invalid request parameters',
      cause: new InvalidParamsRpcError(new Error('Invalid topic')),
      expected: false,
    },
    {
      label: 'invalid evidence',
      cause: new Error('Malformed registry log'),
      expected: false,
    },
    {
      label: 'cancelled request',
      cause: new DOMException('Aborted', 'AbortError'),
      expected: false,
    },
  ])('retries $label only when recovery is possible', ({ cause, expected }) => {
    expect(shouldRetrySubnameInventoryRead(cause)).toBe(expected)
  })

  it('combines registry emitters with the same history bounds without dropping a parent or block', () => {
    expect(
      planSubnameLogReads({
        registries: [
          { address: REGISTRY, fromBlock: 0n },
          { address: OLD_REGISTRY, fromBlock: 0n },
        ],
        parentNodes: [ROOT, CHILD],
        toBlock: 5n,
        blockRange: 3n,
        nodeBatchSize: 2,
      }),
    ).toEqual([
      {
        registries: [REGISTRY, OLD_REGISTRY],
        parentNodes: [ROOT, CHILD],
        fromBlock: 0n,
        toBlock: 2n,
      },
      {
        registries: [REGISTRY, OLD_REGISTRY],
        parentNodes: [ROOT, CHILD],
        fromBlock: 3n,
        toBlock: 5n,
      },
    ])
  })

  it('accepts either requested emitter but rejects a foreign emitter and cross-emitter duplicate identity', () => {
    const grouped = {
      ...request,
      registries: [REGISTRY, OLD_REGISTRY] as const,
    }
    const oldLog = { ...log, address: OLD_REGISTRY, logIndex: '0x1' }
    expect(parseSubnameLogs([log, oldLog], grouped)).toEqual({
      status: 'ok',
      edges: [{ node: CHILD, parentNode: ROOT, labelhash: labelhash('child') }],
    })
    expect(
      parseSubnameLogs([{ ...log, address: zeroAddress }], grouped).status,
    ).toBe('invalid')
    expect(
      parseSubnameLogs([log, { ...oldLog, logIndex: log.logIndex }], grouped)
        .status,
    ).toBe('invalid')
  })

  it.each([
    { phase: 'nodes', count: 100_000, expected: null },
    { phase: 'nodes', count: 100_001, expected: 'node-limit' },
    { phase: 'history', count: 1_000_000, expected: null },
    { phase: 'history', count: 1_000_001, expected: 'history-limit' },
  ] as const)(
    'identifies the $phase budget boundary at $count',
    ({ phase, count, expected }) => {
      expect(getSubnameInventoryLimit({ phase, count })).toBe(expected)
    },
  )

  it.each([
    {
      chainId: 1,
      address: '0x314159265dD8dbb310642f98f50C066173C1259b',
      expected: true,
    },
    {
      chainId: 11155111,
      address: '0x314159265dD8dbb310642f98f50C066173C1259b',
      expected: false,
    },
    { chainId: 1, address: REGISTRY, expected: false },
  ] as const)(
    'recognizes nested InvalidJump only for the original mainnet registry ($chainId, $address)',
    ({ chainId, address, expected }) => {
      expect(
        isMissingRegistryFallbackGetter({
          chainId,
          address,
          cause: new Error('RPC -32603', {
            cause: { code: -32603, message: 'EVM error InvalidJump' },
          }),
        }),
      ).toBe(expected)
      expect(
        isMissingRegistryFallbackGetter({
          chainId,
          address,
          cause: new Error('RPC -32603 internal error'),
        }),
      ).toBe(false)
    },
  )
  it.each([
    {
      chainId: 1,
      address: '0x314159265dD8dbb310642f98f50C066173C1259b',
      expected: true,
    },
    {
      chainId: 11155111,
      address: '0x314159265dD8dbb310642f98f50C066173C1259b',
      expected: false,
    },
    { chainId: 1, address: REGISTRY, expected: false },
  ] as const)(
    'recognizes a geth-style invalid jump only for the original mainnet registry ($chainId, $address)',
    ({ chainId, address, expected }) => {
      expect(
        isMissingRegistryFallbackGetter({
          chainId,
          address,
          cause: new Error('Missing or invalid parameters.', {
            cause: { code: -32000, message: 'invalid jump destination' },
          }),
        }),
      ).toBe(expected)
    },
  )
  it('covers every registry layer, block and parent without overlapping windows', () => {
    const plan = planSubnameLogReads({
      registries: [
        { address: REGISTRY, fromBlock: 0n },
        { address: zeroAddress, fromBlock: 3n },
      ],
      parentNodes: [ROOT, CHILD],
      toBlock: 5n,
      blockRange: 3n,
      nodeBatchSize: 1,
    })
    expect(
      plan.flatMap(({ registries, parentNodes, fromBlock, toBlock }) =>
        registries.map((registry) => [
          registry,
          parentNodes,
          fromBlock,
          toBlock,
        ]),
      ),
    ).toEqual([
      [REGISTRY, [ROOT], 0n, 2n],
      [REGISTRY, [ROOT], 3n, 5n],
      [REGISTRY, [CHILD], 0n, 2n],
      [REGISTRY, [CHILD], 3n, 5n],
      [zeroAddress, [ROOT], 3n, 5n],
      [zeroAddress, [CHILD], 3n, 5n],
    ])
  })

  it('discovers a historical child even when NewOwner sets its owner to zero', () => {
    expect(parseSubnameLogs([log], request)).toEqual({
      status: 'ok',
      edges: [
        {
          node: CHILD,
          parentNode: ROOT,
          labelhash: labelhash('child'),
        },
      ],
    })
  })

  it.each([
    { label: 'removed', logs: [{ ...log, removed: true }] },
    { label: 'foreign registry', logs: [{ ...log, address: zeroAddress }] },
    { label: 'outside range', logs: [{ ...log, blockNumber: '0x65' }] },
    { label: 'duplicate event', logs: [log, log] },
    { label: 'missing identity', logs: [{ ...log, blockHash: null }] },
    { label: 'malformed owner', logs: [{ ...log, data: '0x' }] },
    {
      label: 'unrequested parent',
      logs: [{ ...log, topics: [log.topics[0], CHILD, labelhash('child')] }],
    },
  ])(
    'rejects $label evidence rather than returning an empty tree',
    ({ logs }) => {
      expect(parseSubnameLogs(logs, request).status).toBe('invalid')
    },
  )

  it('uses names only as hash-verified preimages, including wrapper DNS bytes', () => {
    const identity = {
      node: CHILD,
      parentNode: ROOT,
      labelhash: labelhash('child'),
    }
    expect(
      getProvenSubnameName({
        ...identity,
        knownNames: ['imposter.parent.eth', 'child.parent.eth'],
        wrapperName: '0x',
      }),
    ).toBe('child.parent.eth')
    expect(
      getProvenSubnameName({
        ...identity,
        knownNames: [],
        wrapperName: stringToHex('\x05child\x06parent\x03eth\x00'),
      }),
    ).toBe('child.parent.eth')
    expect(
      getProvenSubnameName({
        ...identity,
        knownNames: ['imposter.parent.eth'],
        wrapperName: stringToHex('\x05child\x06parent\x03eth'),
      }),
    ).toBeNull()
  })

  it.each(['CHILD.parent.eth', '[1234].parent.eth', 'child.other.eth'])(
    'does not reinterpret an invalid preimage %s',
    (candidate) => {
      expect(
        getProvenSubnameName({
          node: CHILD,
          parentNode: ROOT,
          labelhash: labelhash('child'),
          knownNames: [candidate],
          wrapperName: '0x',
        }),
      ).toBeNull()
    },
  )
})
