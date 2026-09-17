import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type QueryResult = { data: unknown; isLoading: boolean }
let queryResult: QueryResult
const useQueryMock = vi.fn((_options: { enabled?: boolean }) => queryResult)

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { enabled?: boolean }) => useQueryMock(options),
}))
vi.mock('../queries/getDnsOffchainStatus', () => ({
  getDnsOffchainStatusQueryOptions: ({ name }: { name: string }) => ({
    queryKey: ['dns-offchain-status', { name }],
  }),
}))

const { useDnsOffchainName } = await import('./useDnsOffchainName')

const RESOLVED = '0x55e55C649895940826a852820d9e1A076Ec47b09'

type Owner = Parameters<typeof useDnsOffchainName>[0]['owner']

const enabledFor = (name: string, owner: Owner) => {
  renderHook(() => useDnsOffchainName({ name, owner }))
  return useQueryMock.mock.lastCall?.[0].enabled
}

describe('useDnsOffchainName', () => {
  beforeEach(() => {
    useQueryMock.mockClear()
    queryResult = { data: undefined, isLoading: false }
  })

  it('checks a DNS 2LD once the owner lookup comes back empty', () => {
    expect(enabledFor('jobintime.xyz', null)).toBe(true)
  })

  it('waits while the owner lookup is in flight', () => {
    expect(enabledFor('jobintime.xyz', undefined)).toBe(false)
  })

  it('skips a name with a registry entry', () => {
    expect(
      enabledFor('v1rtl.site', {
        owner: RESOLVED,
        registryAddress: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
        protocolVersion: 'ENSv1',
      }),
    ).toBe(false)
  })

  // `.eth` names are never gasless, and only 2LDs go through DNS import.
  it.each([
    'alice.eth',
    'sub.jobintime.xyz',
    'xyz',
  ])('never checks %s', (name) => {
    expect(enabledFor(name, null)).toBe(false)
  })

  it('reports the address a live name resolves to', () => {
    queryResult = {
      data: {
        resolverAddress: '0x0EF1aF80c24B681991d675176D9c07d8C9236B9a',
        resolverIsOfficial: true,
        resolvedAddress: RESOLVED,
      },
      isLoading: false,
    }

    const { result } = renderHook(() =>
      useDnsOffchainName({ name: 'jobintime.xyz', owner: null }),
    )

    expect(result.current).toEqual({
      isLoading: false,
      resolvedAddress: RESOLVED,
    })
  })

  // A record that exists but resolves nothing, and a failed (strict) lookup,
  // both leave no data — neither is a live name.
  it.each([
    [
      'a record that does not resolve',
      {
        resolverAddress: '0x0EF1aF80c24B681991d675176D9c07d8C9236B9a',
        resolverIsOfficial: true,
        resolvedAddress: null,
      },
    ],
    ['no record at all', undefined],
  ])('reports no address for %s', (_, data) => {
    queryResult = { data, isLoading: false }

    const { result } = renderHook(() =>
      useDnsOffchainName({ name: 'jobintime.xyz', owner: null }),
    )

    expect(result.current.resolvedAddress).toBeNull()
  })
})
