import { ok } from 'neverthrow'
import {
  BaseError,
  decodeFunctionData,
  ExecutionRevertedError,
  encodeAbiParameters,
  encodeErrorResult,
  HttpRequestError,
  parseAbi,
} from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getRecords } from './useRecords'

const mocks = vi.hoisted(() => ({
  resolveNameData: vi.fn(),
  getResolver: vi.fn(),
  getSupportedInterfaces: vi.fn(),
  readContract: vi.fn(),
}))
vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ readContract: mocks.readContract }),
}))
vi.mock('@ensdomains/ensjs/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ensdomains/ensjs/public')>()),
  resolveNameData: mocks.resolveNameData,
  getResolver: mocks.getResolver,
  getSupportedInterfaces: mocks.getSupportedInterfaces,
}))

const abi = parseAbi([
  'error HttpError(uint16 status,string message)',
  'error ResolverError(bytes errorData)',
])
const resolverAddress = '0x2222222222222222222222222222222222222222'
const run = () => getRecords({ name: 'jesse.base.eth', coins: [60] })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getResolver.mockResolvedValue(null)
  mocks.getSupportedInterfaces.mockResolvedValue([false, false])
})

describe('record resolution failures', () => {
  it.each([429, 503])(
    'does not turn a gateway %s into an empty success',
    async (status) => {
      const gatewayError = encodeErrorResult({
        abi,
        errorName: 'HttpError',
        args: [status, 'Gateway unavailable'],
      })
      mocks.resolveNameData.mockResolvedValue({
        resolverAddress,
        resolvedData: [
          {
            success: false,
            returnData: encodeErrorResult({
              abi,
              errorName: 'ResolverError',
              args: [gatewayError],
            }),
          },
        ],
      })
      expect((await run())._unsafeUnwrapErr()).toMatchObject({
        cause: { status },
      })
    },
  )

  it('still treats a missing record as an empty success', async () => {
    mocks.resolveNameData.mockResolvedValue({
      resolverAddress,
      resolvedData: [{ success: false, returnData: '0x' }],
    })
    expect((await run())._unsafeUnwrap().coins).toEqual([])
  })

  it('preserves valid record reads through the guarded client', async () => {
    const address = '0x2211d1D0020DAEA8039E46Cf1367962070d77DA9'
    mocks.resolveNameData.mockResolvedValue({
      resolverAddress,
      resolvedData: [
        {
          success: true,
          returnData: encodeAbiParameters([{ type: 'address' }], [address]),
        },
      ],
    })
    expect((await run())._unsafeUnwrap().coins).toEqual([
      { coinType: 60, symbol: 'eth', value: address },
    ])
  })
})

it('reads an unimported DNS name through universal resolution when its resolver lookup reverts', async () => {
  mocks.getResolver.mockRejectedValue(
    new BaseError('getResolver reverted', {
      cause: new ExecutionRevertedError(),
    }),
  )
  mocks.resolveNameData.mockResolvedValue(null)
  const result = await getRecords({
    name: 'unowned.xyz',
    texts: ['description'],
    coins: [60],
  })
  expect(result.isOk()).toBe(true)
  expect(mocks.resolveNameData).toHaveBeenCalledTimes(1)
})

describe('inherited resolver batching', () => {
  const multicallAbi = parseAbi([
    'function multicall(bytes[] data) returns (bytes[] results)',
  ])
  const recordAbi = parseAbi([
    'function text(bytes32 node,string key) view returns(string)',
    'function addr(bytes32 node) view returns(address)',
  ])
  beforeEach(() => {
    mocks.getResolver.mockResolvedValue(resolverAddress)
    mocks.getSupportedInterfaces.mockResolvedValue([true, false])
    mocks.readContract.mockImplementation(async ({ args }) => {
      const {
        args: [calls],
      } = decodeFunctionData({ abi: multicallAbi, data: args[1] })
      const values = calls.map((data) => {
        const call = decodeFunctionData({ abi: recordAbi, data })
        return call.functionName === 'text'
          ? encodeAbiParameters([{ type: 'string' }], [call.args[1]])
          : encodeAbiParameters(
              [{ type: 'address' }],
              ['0x2211d1D0020DAEA8039E46Cf1367962070d77DA9'],
            )
      })
      return encodeAbiParameters([{ type: 'bytes[]' }], [values])
    })
  })
  it('keeps all record values in bounded direct multicalls instead of a CCIP call per record', async () => {
    const texts = Array.from({ length: 20 }, (_, i) => `profile.key.${i}`)
    const records = (
      await getRecords({ name: 'jesse.base.eth', texts, coins: [60] })
    )._unsafeUnwrap()
    expect(records.texts.map(({ key }) => key)).toEqual(texts)
    expect(records.coins[0]?.coinType).toBe(60)
    expect(mocks.readContract.mock.calls.length).toBeLessThan(5)
    expect(mocks.resolveNameData).not.toHaveBeenCalled()
  })
  it.each([429, 503])('does not fan out after a gateway %s', async (status) => {
    mocks.readContract.mockRejectedValue(
      new HttpRequestError({ url: 'https://gateway.invalid', status }),
    )
    expect((await run())._unsafeUnwrapErr()).toMatchObject({
      cause: { status },
    })
    expect(mocks.readContract).toHaveBeenCalledTimes(1)
    expect(mocks.resolveNameData).not.toHaveBeenCalled()
  })
  it('surfaces a transient gateway error returned inside a direct multicall', async () => {
    const error = encodeErrorResult({
      abi,
      errorName: 'HttpError',
      args: [429, 'Rate limited'],
    })
    mocks.readContract.mockResolvedValue(
      encodeAbiParameters([{ type: 'bytes[]' }], [[error]]),
    )
    expect((await run())._unsafeUnwrapErr()).toMatchObject({
      cause: { status: 429 },
    })
    expect(mocks.resolveNameData).not.toHaveBeenCalled()
  })

  it('uses universal resolution when the gateway rejects a batch', async () => {
    // Namespace answers an oversized batch URL with a 500.
    mocks.readContract.mockRejectedValue(
      new HttpRequestError({ url: 'https://gateway.invalid', status: 500 }),
    )
    mocks.resolveNameData.mockResolvedValue(null)
    expect((await run()).isOk()).toBe(true)
    expect(mocks.resolveNameData).toHaveBeenCalledTimes(1)
  })

  it('keeps the records a gateway returned when it fails others', async () => {
    const error = encodeErrorResult({
      abi,
      errorName: 'HttpError',
      args: [500, 'Internal error'],
    })
    const description = encodeAbiParameters([{ type: 'string' }], ['hi'])
    mocks.readContract.mockResolvedValue(
      encodeAbiParameters([{ type: 'bytes[]' }], [[description, error]]),
    )
    const records = (
      await getRecords({
        name: 'jesse.base.eth',
        texts: ['description'],
        coins: [60],
      })
    )._unsafeUnwrap()
    expect(records.texts).toEqual([{ key: 'description', value: 'hi' }])
  })

  it('still fails when the only records that came back are empty', async () => {
    const error = encodeErrorResult({
      abi,
      errorName: 'HttpError',
      args: [500, 'Internal error'],
    })
    const unset = encodeAbiParameters([{ type: 'string' }], [''])
    mocks.readContract.mockResolvedValue(
      encodeAbiParameters([{ type: 'bytes[]' }], [[unset, error]]),
    )
    // The batch's gateway error sends the read to the UniversalResolver, which
    // meets the same failure.
    mocks.resolveNameData.mockResolvedValue({
      resolverAddress,
      resolvedData: [
        { success: true, returnData: unset },
        { success: false, returnData: error },
      ],
    })
    const result = await getRecords({
      name: 'jesse.base.eth',
      texts: ['description'],
      coins: [60],
    })
    expect(result._unsafeUnwrapErr()).toMatchObject({ cause: { status: 500 } })
  })

  it('uses universal resolution when the resolver cannot handle multicall', async () => {
    mocks.readContract.mockRejectedValue(
      new BaseError('Unsupported multicall', {
        cause: new ExecutionRevertedError(),
      }),
    )
    mocks.resolveNameData.mockResolvedValue(null)
    expect((await run())._unsafeUnwrap().coins).toEqual([])
    expect(mocks.resolveNameData).toHaveBeenCalledTimes(1)
  })
})
