// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { ok } from 'neverthrow'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const OWNER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const STRANGER = '0xcccccccccccccccccccccccccccccccccccccccc' as Address
/** A resolver the name itself points at. */
const OWN_RESOLVER = '0x8fade66b79cc9f707ab26799354482eb93a5b7dd' as Address
/**
 * The read-only ExtendedDNSResolver a detached DNS name resolves through: the
 * TLD's OffchainDNSResolver reads the `ENS1` TXT record and delegates to it.
 */
const INHERITED_RESOLVER =
  '0x0ef1af80c24b681991d675176d9c07d8c9236b9a' as Address

type QueryStub = { readonly data: unknown; readonly isLoading: boolean }

const idle = (): QueryStub => ({ data: undefined, isLoading: false })
const settled = (data: unknown): QueryStub => ({ data, isLoading: false })
const loading = (): QueryStub => ({ data: undefined, isLoading: true })

let connectedAddress: Address | undefined = OWNER
let ownerQuery: QueryStub = idle()
let resolverQuery: QueryStub = idle()
let ownResolverQuery: QueryStub = idle()
let isPermissionedQuery: QueryStub = idle()
let roleQueries: QueryStub[] = []

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConnection: () => ({ address: connectedAddress }),
}))
// The query-options factories pull the app's wagmi client in transitively; the
// queries themselves are stubbed below, so it never runs.
vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: { id: 11155111 } }),
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQuery: ({
      queryKey,
      enabled,
    }: {
      queryKey: readonly unknown[]
      enabled?: boolean
    }) => {
      const stub = match(queryKey[0])
        .with('get-ens-owner', () => ownerQuery)
        .with('get-name-resolver-address', () => resolverQuery)
        .with('name-has-own-resolver', () => ownResolverQuery)
        .with('is-permissioned-resolver', () => isPermissionedQuery)
        .otherwise(idle)

      return enabled === false ? { ...stub, isLoading: false } : stub
    },
    useQueries: ({ queries }: { queries: readonly unknown[] }) =>
      queries.map((_, index) => roleQueries[index] ?? idle()),
  }
})

const { useCanEditRecords } = await import('./useCanEditRecords')

const render = () =>
  renderHook(() => useCanEditRecords({ name: 'jobintime.xyz' })).result.current

describe('useCanEditRecords', () => {
  beforeEach(() => {
    connectedAddress = OWNER
    ownerQuery = settled({ owner: OWNER, protocolVersion: 'ENSv1' })
    resolverQuery = settled(OWN_RESOLVER)
    ownResolverQuery = settled(true)
    isPermissionedQuery = settled(false)
    roleQueries = []
  })

  it('lets the token owner edit on a non-permissioned resolver the name owns', () => {
    expect(render().canEdit).toBe(true)
  })

  it('refuses a resolver inherited from an ancestor, even for the owner', () => {
    // jobintime.xyz after its resolver was detached: reads still work through
    // the TLD, so `getResolver` answers, but nothing accepts a write.
    resolverQuery = settled(INHERITED_RESOLVER)
    ownResolverQuery = settled(false)

    const result = render()

    expect(result.canEdit).toBe(false)
    expect(result.isOwner).toBe(true)
    expect(result.hasOwnResolver).toBe(false)
  })

  it('refuses when the own-resolver check could not reach a verdict', () => {
    // The query errs rather than guessing, so `data` stays undefined. Treating
    // that as permission would submit the write this check exists to stop.
    ownResolverQuery = idle()

    expect(render().canEdit).toBe(false)
  })

  it('stays loading while the own-resolver check is in flight', () => {
    ownResolverQuery = loading()

    const result = render()

    expect(result.isLoading).toBe(true)
    expect(result.canEdit).toBe(false)
  })

  it('refuses an inherited resolver even when resolver roles are granted', () => {
    // Roles are held on the ancestor's resolver, not on anything this name can
    // write, so a granted role must not unlock the save either.
    resolverQuery = settled(INHERITED_RESOLVER)
    ownResolverQuery = settled(false)
    isPermissionedQuery = settled(true)
    roleQueries = [settled(true)]

    expect(render().canEdit).toBe(false)
  })

  it('still refuses a stranger on a name that owns its resolver', () => {
    connectedAddress = STRANGER

    expect(render().canEdit).toBe(false)
  })
})
