import { ok } from 'neverthrow'
import {
  type Address,
  createClient,
  custom,
  encodeErrorResult,
  type Hex,
  parseAbi,
  RpcRequestError,
} from 'viem'
import { sepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const RESOLVER = '0x8fade66b79cc9f707ab26799354482eb93a5b7dd' as Address
const ACCOUNT = '0x1111111111111111111111111111111111111111' as Address

const ethCall =
  vi.fn<
    (request: { readonly from?: Address; readonly to: Address }) => Promise<Hex>
  >()
const gateway = vi.fn(async (): Promise<Hex> => {
  throw new Error('gateway.test is unreachable')
})

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () =>
    ok(
      createClient({
        chain: sepolia,
        ccipRead: { request: gateway },
        transport: custom(
          {
            request: async ({ method, params }) => {
              if (method === 'eth_call') return ethCall(params[0])
              throw new Error(`unexpected ${method}`)
            },
          },
          { retryCount: 0 },
        ),
      }),
    ),
}))

const { getCanWriteRecordsOnResolver } = await import(
  './getCanWriteRecordsOnResolver'
)

const revertWith = (data: Hex = '0x') =>
  Promise.reject(
    new RpcRequestError({
      body: {},
      error: { code: 3, message: 'execution reverted', data },
      url: 'http://rpc.test',
    }),
  )

const offchainLookup = () =>
  revertWith(
    encodeErrorResult({
      abi: parseAbi([
        'error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData)',
      ]),
      errorName: 'OffchainLookup',
      args: [
        RESOLVER,
        ['https://gateway.test/{sender}/{data}.json'],
        '0x',
        '0x00000000',
        '0x',
      ],
    }),
  )

const probe = () =>
  getCanWriteRecordsOnResolver({
    resolverAddress: RESOLVER,
    name: 'alice.eth',
    account: ACCOUNT,
  })

describe('getCanWriteRecordsOnResolver', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends every setter from the connected wallet', async () => {
    ethCall.mockResolvedValue('0x')

    expect((await probe())._unsafeUnwrap()).toBe(true)
    // One per record type the editor offers: address, text, ABI, contenthash.
    expect(ethCall).toHaveBeenCalledTimes(4)
    expect(ethCall).toHaveBeenCalledWith(
      expect.objectContaining({ from: ACCOUNT, to: RESOLVER }),
    )
  })

  // A resolver may authorise contenthash but not addresses or text, which is
  // not a lockout: that edit would still succeed.
  it('still allows editing when only the last setter is accepted', async () => {
    ethCall
      .mockImplementationOnce(() => revertWith())
      .mockImplementationOnce(() => revertWith())
      .mockImplementationOnce(() => revertWith())
      .mockResolvedValueOnce('0x')

    expect((await probe())._unsafeUnwrap()).toBe(true)
  })

  it('reads every setter reverting as the resolver refusing the wallet', async () => {
    ethCall.mockImplementation(() => revertWith())

    expect((await probe())._unsafeUnwrap()).toBe(false)
  })

  it('reads an OffchainLookup answer as a refusal without a gateway request', async () => {
    ethCall.mockImplementation(offchainLookup)

    expect((await probe())._unsafeUnwrap()).toBe(false)
    expect(gateway).not.toHaveBeenCalled()
  })

  // An unreachable node is not a refusal: the caller must treat it as unknown.
  it('fails rather than answering when the call never reached the resolver', async () => {
    ethCall.mockRejectedValue(new Error('network down'))

    expect((await probe())._unsafeUnwrapErr()._tag).toBe(
      'CanWriteRecordsOnResolverError',
    )
  })
})
