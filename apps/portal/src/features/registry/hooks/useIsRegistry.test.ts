import { erc165SupportsInterfaceSnippet } from '@ensdomains/ensjs-abi/erc165'
import {
  type Address,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  HttpRequestError,
} from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const readContract = vi.fn()
vi.mock('viem/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem/utils')>()
  return { ...actual, getAction: () => readContract }
})
vi.mock('@/lib/wagmi/helpers', async () => {
  const { ok } = await import('neverthrow')
  return { safeGetClient: () => ok({}) }
})

const { getIsRegistry } = await import('./useIsRegistry')

const ADDRESS: Address = '0x0000000100000000000000000000000000000000'

// What viem throws from `readContract`: the cause wrapped in the call's context.
const failedCall = (
  cause: ConstructorParameters<typeof ContractFunctionExecutionError>[0],
) =>
  new ContractFunctionExecutionError(cause, {
    abi: erc165SupportsInterfaceSnippet,
    functionName: 'supportsInterface',
    args: ['0x51f67f40'],
    contractAddress: ADDRESS,
  })

describe('getIsRegistry', () => {
  beforeEach(() => {
    readContract.mockReset()
  })

  it('asks the address for IRegistry over ERC-165', async () => {
    readContract.mockResolvedValueOnce(true)

    expect((await getIsRegistry({ address: ADDRESS }))._unsafeUnwrap()).toBe(
      true,
    )
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: ADDRESS,
        functionName: 'supportsInterface',
        args: ['0x51f67f40'],
      }),
    )
  })

  it.each([
    ['reports another interface', () => Promise.resolve(false)],
    [
      'has no code',
      () =>
        Promise.reject(
          failedCall(
            new ContractFunctionZeroDataError({
              functionName: 'supportsInterface',
            }),
          ),
        ),
    ],
    [
      'has no ERC-165',
      () =>
        Promise.reject(
          failedCall(
            new ContractFunctionRevertedError({
              abi: erc165SupportsInterfaceSnippet,
              functionName: 'supportsInterface',
            }),
          ),
        ),
    ],
  ])('is not a registry when the address %s', async (_, answer) => {
    readContract.mockImplementationOnce(answer)

    expect((await getIsRegistry({ address: ADDRESS }))._unsafeUnwrap()).toBe(
      false,
    )
  })

  // A second copy of viem in the bundle would break `instanceof`; the error's
  // name still says what happened.
  it('recognises a no-code answer by name, not by class', async () => {
    const zeroData = Object.assign(new Error('returned no data'), {
      name: 'ContractFunctionZeroDataError',
    })
    readContract.mockRejectedValueOnce(
      Object.assign(new Error('call failed'), { cause: zeroData }),
    )

    expect((await getIsRegistry({ address: ADDRESS }))._unsafeUnwrap()).toBe(
      false,
    )
  })

  // ensjs `getSupportedInterfaces` reads an unreachable RPC as `false`, which
  // showed a real registry as invalid.
  it('fails when the RPC cannot be reached', async () => {
    readContract.mockRejectedValueOnce(
      failedCall(new HttpRequestError({ url: 'https://rpc.invalid' })),
    )

    expect((await getIsRegistry({ address: ADDRESS })).isErr()).toBe(true)
  })
})
