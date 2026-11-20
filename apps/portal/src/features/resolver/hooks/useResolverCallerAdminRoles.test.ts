// @vitest-environment happy-dom
import { encodeResolverRoleBitmap } from '@ensdomains/ensjs/utils/v2'
import { ok } from 'neverthrow'
import { type Address, encodeAbiParameters, type Hex } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestQueryClient, renderHook, waitFor } from '@/test-utils'
import {
  createEthCallClient,
  type EthCallRequest,
  offchainLookupRevert,
  unreachableGateway,
} from '@/test-utils/ethCallClient'
import { createTestWrapper } from '@/test-utils/providers'

const RESOLVER: Address = '0x2222222222222222222222222222222222222222'
const ACCOUNT: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

const ethCall = vi.fn<(request: EthCallRequest) => Promise<Hex>>()
const gateway = unreachableGateway()

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok(createEthCallClient(ethCall, gateway)),
}))

const { useResolverCallerAdminRoles } = await import(
  './useResolverCallerAdminRoles'
)

const render = () => {
  const queryClient = createTestQueryClient()
  const { result } = renderHook(
    () =>
      useResolverCallerAdminRoles({
        resolverAddress: RESOLVER,
        resource: null,
        account: ACCOUNT,
      }),
    { wrapper: createTestWrapper(queryClient) },
  )
  return { result, queryClient }
}

beforeEach(() => {
  ethCall.mockReset()
  gateway.mockClear()
})

describe('useResolverCallerAdminRoles', () => {
  it("reads the account's admin roles from the resolver", async () => {
    ethCall.mockResolvedValue(
      encodeAbiParameters(
        [{ type: 'uint256' }],
        [encodeResolverRoleBitmap(['ROLE_LINK_ADMIN'])],
      ),
    )

    const { result } = render()

    await waitFor(() =>
      expect(result.current.has('ROLE_LINK_ADMIN')).toBe(true),
    )
    expect(ethCall).toHaveBeenCalledWith(
      expect.objectContaining({ to: RESOLVER }),
    )
  })

  it('holds no roles and sends no gateway request when the resolver answers with OffchainLookup', async () => {
    ethCall.mockRejectedValue(offchainLookupRevert(RESOLVER))

    const { result, queryClient } = render()

    await waitFor(() => expect(ethCall).toHaveBeenCalled())
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
    expect(result.current.size).toBe(0)
    expect(gateway).not.toHaveBeenCalled()
  })
})
