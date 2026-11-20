import { ok } from 'neverthrow'
import { type Address, encodeAbiParameters, type Hex } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireResourceIdForName } from '@/lib/resource/resourceId'
import {
  createEthCallClient,
  type EthCallRequest,
  offchainLookupRevert,
  unreachableGateway,
} from '@/test-utils/ethCallClient'

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const RESOLVER: Address = '0x2222222222222222222222222222222222222222'
const ACCOUNT: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

const ethCall = vi.fn<(request: EthCallRequest) => Promise<Hex>>()
const gateway = unreachableGateway()

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok(createEthCallClient(ethCall, gateway)),
}))

const { getHasRolesQueryOptions } = await import('./useHasRoles')

const ask = (params: Parameters<typeof getHasRolesQueryOptions>[0]) =>
  getHasRolesQueryOptions(params).queryFn?.({} as never)

const queries = [
  {
    case: 'a registry resource',
    target: REGISTRY,
    params: {
      registryAddress: REGISTRY,
      resource: requireResourceIdForName('vault.eth'),
      roles: ['ROLE_SET_RESOLVER'],
      account: ACCOUNT,
    },
  },
  {
    case: 'a registry label',
    target: REGISTRY,
    params: {
      registryAddress: REGISTRY,
      label: 'vault',
      roles: ['ROLE_SET_RESOLVER'],
      account: ACCOUNT,
    },
  },
  {
    case: 'a resolver root',
    target: RESOLVER,
    params: {
      resolverAddress: RESOLVER,
      roles: ['ROLE_LINK'],
      account: ACCOUNT,
    },
  },
] as const satisfies readonly {
  readonly case: string
  readonly target: Address
  readonly params: Parameters<typeof getHasRolesQueryOptions>[0]
}[]

beforeEach(() => {
  ethCall.mockReset()
  gateway.mockClear()
})

describe('getHasRoles', () => {
  it.each(queries)(
    'reads the roles of $case from the contract',
    async ({ target, params }) => {
      ethCall.mockResolvedValue(encodeAbiParameters([{ type: 'bool' }], [true]))

      await expect(ask(params)).resolves.toBe(true)
      expect(ethCall).toHaveBeenCalledWith(
        expect.objectContaining({ to: target }),
      )
    },
  )

  it.each(queries)(
    'fails without a gateway request when $case answers with OffchainLookup',
    async ({ target, params }) => {
      ethCall.mockRejectedValue(offchainLookupRevert(target))

      await expect(ask(params)).rejects.toThrow()
      expect(gateway).not.toHaveBeenCalled()
    },
  )
})
