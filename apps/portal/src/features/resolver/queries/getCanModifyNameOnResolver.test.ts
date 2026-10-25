import {
  type Address,
  CallExecutionError,
  decodeFunctionData,
  ExecutionRevertedError,
  type Hex,
  HttpRequestError,
  namehash,
  parseAbi,
} from 'viem'
import { sepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const PUBLIC_RESOLVER_V2: Address = '0xdC4a563d00F5c3012b699794eB9e13A561Be386F'
const V1_PUBLIC_RESOLVER: Address = '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD'
const OWNER: Address = '0x179A862703a4adfb29896552DF9e307980D19285'
const NAME = 'child.parent.eth'

const client = vi.hoisted(() => ({
  chain: undefined as unknown,
  readContract: vi.fn(),
  call: vi.fn(),
}))

vi.mock('@/lib/wagmi/helpers', async () => {
  const { ok } = await import('neverthrow')
  const { extendChainWithEns } = await import('@ensdomains/ensjs/chain')
  const { sepolia: chain } = await import('viem/chains')
  client.chain = extendChainWithEns(chain)
  return { safeGetClient: () => ok(client) }
})

const { getCanModifyNameOnResolver } = await import(
  './getCanModifyNameOnResolver'
)

const revert = () =>
  new CallExecutionError(new ExecutionRevertedError(), {
    chain: sepolia,
  } as never)

const check = (resolverAddress: Address) =>
  getCanModifyNameOnResolver({ resolverAddress, name: NAME, account: OWNER })

beforeEach(() => {
  client.readContract.mockReset()
  client.call.mockReset()
  client.readContract.mockImplementation(
    async ({ functionName }: { readonly functionName: string }) =>
      functionName === 'PUBLIC_RESOLVER' ? PUBLIC_RESOLVER_V2 : true,
  )
})

describe('getCanModifyNameOnResolver', () => {
  it('asks PublicResolverV2 through canModifyName', async () => {
    const result = await check(PUBLIC_RESOLVER_V2)

    expect(result._unsafeUnwrap()).toBe(true)
    expect(client.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({
        functionName: 'canModifyName',
        args: [namehash(NAME), OWNER],
      }),
    )
    expect(client.call).not.toHaveBeenCalled()
  })

  it('lets the wallet edit a retained V1 resolver that accepts its write', async () => {
    client.call.mockResolvedValue({ data: undefined })

    const result = await check(V1_PUBLIC_RESOLVER)

    expect(result._unsafeUnwrap()).toBe(true)
    const [{ account, to, data }] = client.call.mock.calls[0] ?? []
    expect({ account, to }).toEqual({ account: OWNER, to: V1_PUBLIC_RESOLVER })
    expect(
      decodeFunctionData({
        abi: parseAbi(['function setText(bytes32, string, string)']),
        data: data as Hex,
      }).args[0],
    ).toBe(namehash(NAME))
  })

  it('refuses the wallet when the resolver reverts its write', async () => {
    client.call.mockRejectedValue(revert())

    expect((await check(V1_PUBLIC_RESOLVER))._unsafeUnwrap()).toBe(false)
  })

  it('reports an unreachable resolver as an error, not as no permission', async () => {
    client.call.mockRejectedValue(new HttpRequestError({ url: 'rpc' }))

    expect((await check(V1_PUBLIC_RESOLVER)).isErr()).toBe(true)
  })
})
