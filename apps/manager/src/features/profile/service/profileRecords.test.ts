import { BignameError } from '@ens-apps/indexer/bigname'
import { encodeContentHash } from '@ensdomains/ensjs/utils'
import {
  publicResolverAbiSnippet,
  publicResolverContenthashSnippet,
  publicResolverMultiAddrSnippet,
  publicResolverSingleAddrSnippet,
  publicResolverTextSnippet,
} from '@ensdomains/ensjs-abi/v1/publicResolver'
import { errAsync, okAsync } from 'neverthrow'
import {
  BaseError,
  decodeFunctionData,
  ExecutionRevertedError,
  encodeAbiParameters,
  encodeErrorResult,
  type Hex,
  HttpRequestError,
  parseAbi,
  toHex,
  zeroAddress,
} from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  client: {},
  resolveNameData: vi.fn(),
  nameRecords: vi.fn(),
  call: vi.fn(),
  resolveNameRegistry: vi.fn(),
  readNameResolver: vi.fn(),
  hasV2NameEntry: vi.fn(),
  readContract: vi.fn(),
  isOffchainName: vi.fn(),
  isExtendedResolver: false,
}))

vi.mock('@/lib/bigname', () => ({
  bigname: { nameRecords: mocks.nameRecords },
}))
vi.mock('@ensdomains/ensjs/public', () => ({
  resolveNameData: mocks.resolveNameData,
  getSupportedInterfaces: async (
    _client: unknown,
    { interfaces }: { interfaces: readonly string[] },
  ) => [interfaces[0] === '0x9061b923' && mocks.isExtendedResolver],
}))
vi.mock('@/lib/wagmi', async () => ({
  publicClient: { call: mocks.call, readContract: mocks.readContract },
  sepoliaWithEns: (await import('@/config')).envConfig.chain,
}))
vi.mock('@/lib/wagmi/helpers', async () => {
  const { ok } = await import('neverthrow')
  return { safeGetClient: () => ok(mocks.client) }
})
vi.mock('@/utils/debug-features', () => ({ isDebugProfileName: () => false }))
vi.mock('./changeResolver', () => {
  class NameRegistryNotFoundError extends Error {}
  return {
    NameRegistryNotFoundError,
    resolveNameRegistry: mocks.resolveNameRegistry,
    readNameResolver: mocks.readNameResolver,
    hasV2NameEntry: mocks.hasV2NameEntry,
  }
})
vi.mock('./resolverRecordCalls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./resolverRecordCalls')>()),
  isOffchainName: mocks.isOffchainName,
}))
vi.mock('../data/records', () => ({
  addressRecords: [{ coinType: 60 }, { coinType: 121 }, { coinType: 501 }],
  alwaysProbeAddressRecords: [],
  forceFetchRecords: { always: [], whenNotIndexed: [] },
  offchainProfileRecords: { texts: ['description'], coins: [60] },
  staticTextRecords: ['avatar', 'theme'],
  textRecords: [],
}))

import { NameRegistryNotFoundError } from './changeResolver'
import { getProfileRecords } from './profileRecords'

const resolverAddress = '0x2222222222222222222222222222222222222222'
const ethAddress = '0x1111111111111111111111111111111111111111'
const knownKeys = (keys: readonly string[]) =>
  okAsync({ data: { inventory: { known_keys: keys } } })
const bytesResult = (value: Hex) =>
  encodeAbiParameters([{ type: 'bytes' }], [value])
const recordAbi = [
  ...publicResolverTextSnippet,
  ...publicResolverSingleAddrSnippet,
  ...publicResolverMultiAddrSnippet,
  ...publicResolverContenthashSnippet,
  ...publicResolverAbiSnippet,
] as const
const directRead = async ({ data }: { data: Hex }) => {
  const call = decodeFunctionData({ abi: recordAbi, data })
  switch (call.functionName) {
    case 'text':
      return {
        data: encodeAbiParameters(
          [{ type: 'string' }],
          [call.args[1] === 'theme' ? '#123456' : ''],
        ),
      }
    case 'addr':
      return {
        data:
          call.args.length === 1
            ? encodeAbiParameters([{ type: 'address' }], [zeroAddress])
            : bytesResult('0x'),
      }
    case 'contenthash':
      return { data: bytesResult('0x') }
    case 'ABI':
      return {
        data: encodeAbiParameters(
          [{ type: 'uint256' }, { type: 'bytes' }],
          [0n, '0x'],
        ),
      }
  }
}
const contentHash =
  'ipfs://bafybeibj6lixxzqtsb45ysdjnupvqkufgdvzqbnvmhw2kf7cfkesy7r7d4'
const emptyResult = { success: false, returnData: '0x' as Hex }
const profileResolution = (
  coins: readonly { success: boolean; returnData: Hex }[] = [],
  texts: Readonly<Record<string, string>> = { theme: '#123456' },
) => ({
  resolverAddress,
  resolvedData: [
    ...['avatar', 'theme', 'links'].map((key) =>
      texts[key]
        ? {
            success: true,
            returnData: encodeAbiParameters([{ type: 'string' }], [texts[key]]),
          }
        : emptyResult,
    ),
    ...[0, 1, 2].map((index) => coins[index] ?? emptyResult),
    { success: true, returnData: bytesResult(encodeContentHash(contentHash)) },
    {
      success: true,
      returnData: encodeAbiParameters(
        [{ type: 'uint256' }, { type: 'bytes' }],
        [1n, toHex('[]')],
      ),
    },
  ],
})

const requestedCalls = () => {
  const [, parameters] = mocks.resolveNameData.mock.calls[0] ?? []
  return (parameters.data as Hex[]).map((data) =>
    decodeFunctionData({
      abi: [
        ...publicResolverTextSnippet,
        ...publicResolverSingleAddrSnippet,
        ...publicResolverMultiAddrSnippet,
        ...publicResolverContenthashSnippet,
        ...publicResolverAbiSnippet,
      ],
      data,
    }),
  )
}

const requestedTextKeys = () =>
  requestedCalls().flatMap((call) =>
    call.functionName === 'text' ? [call.args[1]] : [],
  )

describe('profile records', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.nameRecords.mockReturnValue(knownKeys([]))
    mocks.resolveNameData.mockResolvedValue(profileResolution())
    mocks.resolveNameRegistry.mockRejectedValue(
      new NameRegistryNotFoundError('missing.eth'),
    )
    mocks.readNameResolver.mockResolvedValue(resolverAddress)
    mocks.call.mockReset().mockImplementation(directRead)
    mocks.hasV2NameEntry.mockResolvedValue(true)
    mocks.isOffchainName.mockResolvedValue(false)
    mocks.isExtendedResolver = false
  })

  it.each([resolverAddress, zeroAddress])(
    'uses universal resolution for a reserved V1 name with resolver %s',
    async (resolver) => {
      mocks.resolveNameRegistry.mockResolvedValue({
        label: 'reserved',
        registryAddress: ethAddress,
      })
      mocks.hasV2NameEntry.mockResolvedValue(false)
      mocks.readNameResolver.mockResolvedValue(resolver)
      const profile = (await getProfileRecords('reserved.eth'))._unsafeUnwrap()
      expect(profile.texts).toEqual([{ key: 'theme', value: '#123456' }])
      expect(mocks.resolveNameData).toHaveBeenCalledOnce()
      expect(mocks.call).not.toHaveBeenCalled()
    },
  )

  it('uses ENSIP-10 for an extended resolver with node-based setters', async () => {
    mocks.resolveNameRegistry.mockResolvedValue({
      label: 'child',
      registryAddress: ethAddress,
    })
    mocks.isExtendedResolver = true
    mocks.readContract.mockImplementation(async ({ functionName, args }) => {
      if (functionName !== 'resolve')
        throw new Error('Unexpected resolver read')
      return (await directRead({ data: args[1] })).data
    })
    mocks.call.mockRejectedValue(new Error('Plain getter is unsupported'))
    const profile = (
      await getProfileRecords('child.parent.eth')
    )._unsafeUnwrap()
    expect(profile.texts).toEqual([{ key: 'theme', value: '#123456' }])
    expect(mocks.call).not.toHaveBeenCalled()
  })

  it.each(['text', 'addr', 'contenthash', 'ABI'] as const)(
    'keeps the profile readable when a direct %s record is malformed',
    async (recordType) => {
      mocks.resolveNameRegistry.mockResolvedValue({
        label: 'child',
        registryAddress: ethAddress,
      })
      mocks.call.mockImplementation(async ({ data }) => {
        const call = decodeFunctionData({ abi: recordAbi, data })
        if (
          call.functionName === recordType &&
          (recordType !== 'text' || call.args[1] === 'avatar')
        ) {
          if (
            recordType === 'addr' &&
            call.args.length === 2 &&
            call.args[1] === 501n
          )
            return { data: bytesResult(`0x${'11'.repeat(31)}`) }
          if (recordType !== 'addr') return { data: '0x1234' }
        }
        return directRead({ data })
      })
      const profile = (
        await getProfileRecords('child.parent.eth')
      )._unsafeUnwrap()
      expect(profile.texts).toEqual([{ key: 'theme', value: '#123456' }])
      expect(profile.coins).toEqual([])
    },
  )

  it.each([
    { description: 'not indexed yet', indexedKeys: ['text:theme'] },
    {
      description: 'already indexed',
      indexedKeys: ['text:theme', 'text:links'],
    },
  ])(
    'loads all saved links when the links key is $description',
    async ({ indexedKeys }) => {
      const linksRecord = {
        key: 'links',
        value: JSON.stringify([
          { name: 'Website', url: 'https://example.com' },
          { name: 'Blog', url: 'https://blog.example.com' },
        ]),
      }
      mocks.nameRecords.mockReturnValue(knownKeys(indexedKeys))
      mocks.resolveNameData.mockResolvedValue(
        profileResolution([], { links: linksRecord.value }),
      )

      const result = (await getProfileRecords('links.eth'))._unsafeUnwrap()

      expect(result.texts).toEqual([linksRecord])
      expect(mocks.resolveNameData).toHaveBeenCalledExactlyOnceWith(
        mocks.client,
        { name: 'links.eth', data: expect.any(Array) },
      )
      expect(requestedTextKeys()).toEqual(['avatar', 'theme', 'links'])
    },
  )

  it('omits an oversized ZEN record without losing other profile records', async () => {
    const resolution = profileResolution([
      {
        success: true,
        returnData: encodeAbiParameters([{ type: 'address' }], [ethAddress]),
      },
      {
        success: true,
        returnData: bytesResult(`0x2089${'11'.repeat(131_072 - 2)}`),
      },
      { success: false, returnData: '0x' },
    ])
    mocks.resolveNameData
      .mockRejectedValueOnce(
        new Error('Combined resolver call exceeded RPC limit'),
      )
      .mockResolvedValueOnce({
        ...resolution,
        resolvedData: resolution.resolvedData.slice(0, 4),
      })
      .mockResolvedValueOnce({
        ...resolution,
        resolvedData: resolution.resolvedData.slice(4),
      })

    const result = (await getProfileRecords('gift.eth'))._unsafeUnwrap()

    expect(result).toMatchObject({
      texts: [{ key: 'theme', value: '#123456' }],
      coins: [{ coinType: 60, symbol: 'eth', value: ethAddress }],
      contentHash,
      abi: '[]',
      resolverAddress,
    })
    expect(mocks.resolveNameData).toHaveBeenCalledTimes(3)
    expect(
      mocks.resolveNameData.mock.calls.map(([, { data }]) => data.length),
    ).toEqual([8, 4, 4])
    expect(requestedTextKeys()).toEqual(['avatar', 'theme', 'links'])
    const requestedCoins = requestedCalls().flatMap((call) =>
      call.functionName === 'addr'
        ? [call.args.length === 1 ? 60n : call.args[1]]
        : [],
    )
    expect(requestedCoins).toEqual([60n, 121n, 501n])
  })

  it('preserves a valid ZEN address and skips a malformed sibling', async () => {
    mocks.resolveNameData.mockResolvedValue(
      profileResolution([
        { success: true, returnData: '0x1234' },
        {
          success: true,
          returnData: bytesResult(
            '0x20897843a3fcc6ab7d02d40946360c070b13cf7b9795',
          ),
        },
      ]),
    )

    expect(
      (await getProfileRecords('valid.eth'))._unsafeUnwrap().coins,
    ).toEqual([
      {
        coinType: 121,
        symbol: 'zen',
        value: 'znc3p7CFNTsz1s6CceskrTxKevQLPoDK4cK',
      },
    ])
  })

  it('reads every indexed text key and supported coin type', async () => {
    mocks.nameRecords.mockReturnValue(
      knownKeys([
        'text:com.github',
        'addr:2147483658',
        'addr:999999',
        'contenthash',
      ]),
    )
    mocks.resolveNameData.mockResolvedValue(null)

    await getProfileRecords('keys.eth')

    expect(mocks.nameRecords).toHaveBeenCalledWith('keys.eth', {
      namespace: 'ens',
      include: ['inventory'],
    })
    expect(requestedTextKeys()).toEqual([
      'avatar',
      'theme',
      'links',
      'com.github',
    ])
    expect(
      requestedCalls().filter((call) => call.functionName === 'addr'),
    ).toHaveLength(4)
  })

  it.each([
    { isOffchain: false, texts: ['avatar', 'theme', 'links'], coins: 3 },
    // Every key would not fit one gateway request, so only the profile keys.
    { isOffchain: true, texts: ['description'], coins: 1 },
  ])(
    'reads the default keys for a name bigname has not indexed (offchain: $isOffchain)',
    async ({ isOffchain, texts, coins }) => {
      mocks.nameRecords.mockReturnValue(
        errAsync(
          new BignameError({
            code: 'not_found',
            status: 404,
            message: 'missing',
          }),
        ),
      )
      mocks.isOffchainName.mockResolvedValue(isOffchain)
      mocks.resolveNameData.mockResolvedValue(null)

      const result = await getProfileRecords('unindexed.eth')

      expect(result.isOk()).toBe(true)
      expect(requestedTextKeys()).toEqual(texts)
      expect(
        requestedCalls().filter((call) => call.functionName === 'addr'),
      ).toHaveLength(coins)
    },
  )

  const gatewayError = (status: number) => ({
    success: false,
    returnData: encodeErrorResult({
      abi: parseAbi(['error HttpError(uint16 status, string message)']),
      errorName: 'HttpError',
      args: [status, 'HTTP request failed.'],
    }),
  })

  it.each([
    {
      gateway: 'cannot be reached',
      item: {
        success: false,
        returnData: encodeErrorResult({
          abi: parseAbi(['error Error(string)']),
          errorName: 'Error',
          args: ['fetch failed'],
        }),
      },
      isOk: false,
    },
    { gateway: 'is down', item: gatewayError(503), isOk: false },
    { gateway: 'rate-limits', item: gatewayError(429), isOk: false },
    { gateway: 'does not know the name', item: gatewayError(400), isOk: true },
    { gateway: 'reverts with no reason', item: emptyResult, isOk: true },
  ])(
    'when a gateway $gateway on every read, reads ok: $isOk',
    async ({ item, isOk }) => {
      mocks.resolveNameData.mockResolvedValue({
        resolverAddress,
        resolvedData: profileResolution().resolvedData.map(() => item),
      })
      const result = await getProfileRecords('unknown.world.id')
      expect(result.isOk()).toBe(isOk)
    },
  )

  it('retains the profile error path when resolution fails', async () => {
    mocks.resolveNameData.mockRejectedValue(new Error('RPC unavailable'))
    expect((await getProfileRecords('failed.eth')).isErr()).toBe(true)
    expect(mocks.resolveNameData).toHaveBeenCalledTimes(2)
  })

  it.each([
    {
      kind: 'HTTP',
      cause: new HttpRequestError({ url: 'https://rpc.invalid', status: 503 }),
    },
    { kind: 'gateway', cause: new Error('CCIP gateway unavailable') },
  ])(
    'surfaces a failed direct $kind read and allows retry',
    async ({ cause }) => {
      mocks.resolveNameRegistry.mockResolvedValue({
        label: 'child',
        registryAddress: ethAddress,
      })
      mocks.call.mockRejectedValueOnce(cause)

      const failed = await getProfileRecords('child.parent.eth')
      expect(failed._unsafeUnwrapErr()).toMatchObject({ cause })

      const retried = (
        await getProfileRecords('child.parent.eth')
      )._unsafeUnwrap()
      expect(retried.texts).toEqual([{ key: 'theme', value: '#123456' }])
      expect(mocks.resolveNameData).not.toHaveBeenCalled()
    },
  )

  it.each(['revert', 'empty'] as const)(
    'keeps successful direct records when an unsupported probe returns %s',
    async (response) => {
      mocks.resolveNameRegistry.mockResolvedValue({
        label: 'child',
        registryAddress: ethAddress,
      })
      if (response === 'revert')
        mocks.call.mockRejectedValueOnce(
          new BaseError('Unsupported record', {
            cause: new ExecutionRevertedError(),
          }),
        )
      else mocks.call.mockResolvedValueOnce({ data: '0x' })

      const result = (
        await getProfileRecords('child.parent.eth')
      )._unsafeUnwrap()
      expect(result.texts).toEqual([{ key: 'theme', value: '#123456' }])
    },
  )
})
