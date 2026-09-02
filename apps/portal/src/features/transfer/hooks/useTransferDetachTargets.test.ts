import { renderHook } from '@testing-library/react'
import { ok } from 'neverthrow'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const OWNER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const PARENT_REGISTRY = '0x1111111111111111111111111111111111111111' as Address
const OWN_SUBREGISTRY = '0x2222222222222222222222222222222222222222' as Address
const OWN_RESOLVER = '0x3333333333333333333333333333333333333333' as Address

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: { id: 11155111 } }),
}))

type QueryStub = {
  data: unknown
  isSuccess: boolean
  isError: boolean
}

const ownResolverQuery: QueryStub = {
  data: undefined,
  isSuccess: true,
  isError: false,
}
const registriesQuery: QueryStub = {
  data: undefined,
  isSuccess: true,
  isError: false,
}
const ethAddressQuery: QueryStub = {
  data: undefined,
  isSuccess: true,
  isError: false,
}
const rolesQuery: QueryStub = {
  data: undefined,
  isSuccess: true,
  isError: false,
}

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQuery: (options: { queryKey: readonly unknown[] }) => {
      switch (options.queryKey[0]) {
        case 'transfer-own-resolver':
          return ownResolverQuery
        case 'nameRegistries':
          return registriesQuery
        case 'transfer-eth-address':
          return ethAddressQuery
        case 'getNameRolesForAccount':
          return rolesQuery
        default:
          return { data: undefined, isSuccess: false, isError: false }
      }
    },
  }
})

const { useTransferDetachTargets } = await import('./useTransferDetachTargets')

const render = (name: string) =>
  renderHook(() =>
    useTransferDetachTargets({
      name,
      registryAddress: PARENT_REGISTRY,
      owner: OWNER,
    }),
  ).result.current

describe('useTransferDetachTargets', () => {
  beforeEach(() => {
    // Default: a fully-equipped name whose owner holds every detach role.
    Object.assign(ownResolverQuery, {
      data: OWN_RESOLVER,
      isSuccess: true,
      isError: false,
    })
    Object.assign(registriesQuery, {
      data: [OWN_SUBREGISTRY, PARENT_REGISTRY, null],
      isSuccess: true,
      isError: false,
    })
    Object.assign(ethAddressQuery, {
      data: '0x4444444444444444444444444444444444444444',
      isSuccess: true,
      isError: false,
    })
    Object.assign(rolesQuery, {
      data: { decoded: ['ROLE_SET_RESOLVER', 'ROLE_SET_SUBREGISTRY'] },
      isSuccess: true,
      isError: false,
    })
  })

  it('offers every option for a subname that has its own resolver and registry', () => {
    const { optionIsVisible, settled, failed } = render('sub.alice.eth')

    expect(optionIsVisible).toEqual({
      setEthAddress: true,
      detachResolver: true,
      detachRegistry: true,
    })
    expect(settled).toBe(true)
    expect(failed).toBe(false)
  })

  // The regression: `getResolver` via the UniversalResolver reports the
  // resolver a subname *inherits* from its parent. Keying off that offered a
  // "Detach the resolver" step that writes to an already-empty slot (a no-op
  // that leaves the name resolving through its parent), and an ETH-address
  // step that would write onto the parent's resolver. Reading the name's own
  // registry slot instead means neither is offered.
  it('hides the resolver and ETH-address options when the subname only inherits a resolver', () => {
    ownResolverQuery.data = null

    const { optionIsVisible } = render('sub.alice.eth')

    expect(optionIsVisible.detachResolver).toBe(false)
    expect(optionIsVisible.setEthAddress).toBe(false)
    // The subregistry is read from the name's own slot already, so it stands.
    expect(optionIsVisible.detachRegistry).toBe(true)
  })

  it('hides the ETH-address option when an address resolves but no own resolver backs it', () => {
    ownResolverQuery.data = null
    ethAddressQuery.data = '0x4444444444444444444444444444444444444444'

    expect(render('sub.alice.eth').optionIsVisible.setEthAddress).toBe(false)
  })

  it('reports failed — not "nothing to detach" — when the own-resolver read errors', () => {
    Object.assign(ownResolverQuery, {
      data: undefined,
      isSuccess: false,
      isError: true,
    })

    const { optionIsVisible, settled, failed } = render('sub.alice.eth')

    expect(failed).toBe(true)
    expect(settled).toBe(false)
    expect(optionIsVisible.detachResolver).toBe(false)
  })

  it('still withholds the detach options when the owner lacks the registry roles', () => {
    rolesQuery.data = { decoded: [] }

    const { optionIsVisible } = render('sub.alice.eth')

    expect(optionIsVisible.detachResolver).toBe(false)
    expect(optionIsVisible.detachRegistry).toBe(false)
    // Repointing the ETH address is a resolver write, not a registry one, so
    // it isn't gated on those roles.
    expect(optionIsVisible.setEthAddress).toBe(true)
  })

  it('treats a 2LD the same way — the own-resolver read is not subname-specific', () => {
    ownResolverQuery.data = null

    const { optionIsVisible } = render('alice.eth')

    expect(optionIsVisible.detachResolver).toBe(false)
    expect(optionIsVisible.setEthAddress).toBe(false)
  })
})
