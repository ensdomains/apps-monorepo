// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { ok } from 'neverthrow'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const REGISTRANT = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const CONTROLLER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address
const STRANGER = '0xcccccccccccccccccccccccccccccccccccccccc' as Address
const REGISTRY = '0x1111111111111111111111111111111111111111' as Address

type QueryStub = { data: unknown; isLoading: boolean }

const idle = (): QueryStub => ({ data: undefined, isLoading: false })

let connectedAddress: Address | undefined = REGISTRANT
let ownerQuery: QueryStub = idle()
let v1StateQuery: QueryStub = idle()

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
      // A disabled query never reports loading — mirror that, or a V2 name
      // would look permanently pending on the skipped V1 read.
      if (enabled === false) return idle()
      if (queryKey[0] === 'get-ens-owner') return ownerQuery
      if (queryKey[0] === 'transfer-v1-name-state') return v1StateQuery
      return idle()
    },
  }
})

const { useIsNameOwner } = await import('./useIsNameOwner')

const render = (name = 'legacy.eth') =>
  renderHook(() => useIsNameOwner({ name })).result.current

/** What `resolveEnsOwner` reports: for an unwrapped V1 2LD, the controller. */
const resolvedAs = (owner: Address, protocolVersion: 'ENSv1' | 'ENSv2') => {
  ownerQuery = {
    data: { owner, registryAddress: REGISTRY, protocolVersion },
    isLoading: false,
  }
}

/** An unwrapped `.eth` 2LD whose token and manager sit in different wallets. */
const unwrappedEth2ld = (registrant: Address, controller: Address) => {
  v1StateQuery = {
    data: {
      subject: { kind: 'v1-registrar', registrant, controller },
      registration: 'active',
      resolverAddress: null,
      parent: null,
      ancestorRegistration: null,
    },
    isLoading: false,
  }
}

describe('useIsNameOwner', () => {
  beforeEach(() => {
    connectedAddress = REGISTRANT
    ownerQuery = idle()
    v1StateQuery = idle()
  })

  it('counts the registrant of an unwrapped V1 2LD, which the flattened owner hides', () => {
    resolvedAs(CONTROLLER, 'ENSv1')
    unwrappedEth2ld(REGISTRANT, CONTROLLER)

    expect(render().isOwner).toBe(true)
  })

  it('counts the controller of an unwrapped V1 2LD', () => {
    connectedAddress = CONTROLLER
    resolvedAs(CONTROLLER, 'ENSv1')
    unwrappedEth2ld(REGISTRANT, CONTROLLER)

    expect(render().isOwner).toBe(true)
  })

  it('counts neither for a stranger the name merely points at', () => {
    connectedAddress = STRANGER
    resolvedAs(CONTROLLER, 'ENSv1')
    unwrappedEth2ld(REGISTRANT, CONTROLLER)

    expect(render().isOwner).toBe(false)
  })

  it('uses the single owner for a V2 name, skipping the V1 read', () => {
    connectedAddress = REGISTRANT
    resolvedAs(REGISTRANT, 'ENSv2')
    // Left idle: a V2 name must not depend on the V1 state query at all.

    const result = render()
    expect(result.isOwner).toBe(true)
    expect(result.isLoading).toBe(false)
  })

  it('reports loading while the V1 holder read is in flight', () => {
    resolvedAs(CONTROLLER, 'ENSv1')
    v1StateQuery = { data: undefined, isLoading: true }

    const result = render()
    expect(result.isLoading).toBe(true)
    expect(result.isOwner).toBe(false)
  })

  it('is false with no connected wallet', () => {
    connectedAddress = undefined
    resolvedAs(CONTROLLER, 'ENSv1')
    unwrappedEth2ld(REGISTRANT, CONTROLLER)

    expect(render().isOwner).toBe(false)
  })
})
