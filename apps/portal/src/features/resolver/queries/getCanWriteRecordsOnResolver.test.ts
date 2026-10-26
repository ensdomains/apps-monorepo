import { ok } from 'neverthrow'
import { type Address, BaseError, ExecutionRevertedError } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const RESOLVER = '0x8fade66b79cc9f707ab26799354482eb93a5b7dd' as Address
const ACCOUNT = '0x1111111111111111111111111111111111111111' as Address

const call = vi.fn()

vi.mock('@/lib/wagmi/helpers', () => ({ safeGetClient: () => ok({}) }))
vi.mock('viem/actions', () => ({ call: vi.fn() }))
vi.mock('viem/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/utils')>()),
  getAction: () => call,
}))

const { getCanWriteRecordsOnResolver } = await import(
  './getCanWriteRecordsOnResolver'
)

const revert = () => {
  const error = new BaseError('reverted')
  error.cause = new ExecutionRevertedError({ message: 'reverted' })
  return Promise.reject(error)
}

const probe = () =>
  getCanWriteRecordsOnResolver({
    resolverAddress: RESOLVER,
    name: 'alice.eth',
    account: ACCOUNT,
  })

describe('getCanWriteRecordsOnResolver', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends every setter from the connected wallet', async () => {
    call.mockResolvedValue({ data: '0x' })

    expect((await probe())._unsafeUnwrap()).toBe(true)
    // One per record type the editor offers: address, text, ABI, contenthash.
    expect(call).toHaveBeenCalledTimes(4)
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ account: ACCOUNT, to: RESOLVER }),
    )
  })

  // A resolver may authorise contenthash but not addresses or text, which is
  // not a lockout: that edit would still succeed.
  it('still allows editing when only the last setter is accepted', async () => {
    call
      .mockImplementationOnce(revert)
      .mockImplementationOnce(revert)
      .mockImplementationOnce(revert)
      .mockResolvedValueOnce({ data: '0x' })

    expect((await probe())._unsafeUnwrap()).toBe(true)
  })

  it('reads every setter reverting as the resolver refusing the wallet', async () => {
    call.mockImplementation(revert)

    expect((await probe())._unsafeUnwrap()).toBe(false)
  })

  // An unreachable node is not a refusal: the caller must treat it as unknown.
  it('fails rather than answering when the call never reached the resolver', async () => {
    call.mockRejectedValue(new Error('network down'))

    expect((await probe())._unsafeUnwrapErr()._tag).toBe(
      'CanWriteRecordsOnResolverError',
    )
  })
})
