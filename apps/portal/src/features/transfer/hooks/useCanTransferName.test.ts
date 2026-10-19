// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const OWNER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const REGISTRY = '0x1111111111111111111111111111111111111111' as Address

const query: { data: unknown; isLoading: boolean; isError: boolean } = {
  data: undefined,
  isLoading: false,
  isError: false,
}
const queryKeys: unknown[] = []

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
      queryKeys.push(queryKey[0])
      return query
    },
  }
})

const { useCanTransferName } = await import('./useCanTransferName')

const render = () =>
  renderHook(() =>
    useCanTransferName({
      name: 'sub.alice.eth',
      registryAddress: REGISTRY,
      account: OWNER,
    }),
  ).result.current

describe('useCanTransferName', () => {
  beforeEach(() => {
    queryKeys.length = 0
    Object.assign(query, { data: undefined, isLoading: false, isError: false })
  })

  // `_update` checks the token resource alone; `hasRoles` ORs in root roles,
  // so a registry-root `ROLE_CAN_TRANSFER_ADMIN` would show a Transfer that
  // reverts.
  it('reads the token resource roles, not hasRoles', () => {
    render()

    expect(queryKeys).toEqual(['getNameRolesForAccount'])
  })

  it('allows the transfer when the token grants ROLE_CAN_TRANSFER_ADMIN', () => {
    query.data = { decoded: ['ROLE_CAN_TRANSFER_ADMIN'], raw: 0n }

    expect(render().canTransfer).toBe(true)
  })

  it('refuses the transfer when the token lacks ROLE_CAN_TRANSFER_ADMIN', () => {
    query.data = { decoded: ['ROLE_SET_RESOLVER'], raw: 0n }

    expect(render().canTransfer).toBe(false)
  })
})
