// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { ok } from 'neverthrow'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const REGISTRANT = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const CONTROLLER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address
const STRANGER = '0xcccccccccccccccccccccccccccccccccccccccc' as Address

type QueryStub = { readonly data: unknown; readonly isLoading: boolean }

const idle = (): QueryStub => ({ data: undefined, isLoading: false })

let connectedAddress: Address = REGISTRANT
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
      const stub = match(queryKey[0])
        .with('get-ens-owner', () => ownerQuery)
        .with('transfer-v1-name-state', () => v1StateQuery)
        .otherwise(idle)

      // Disabling a query stops it fetching; it keeps serving whatever it has
      // already cached. Returning empty data here would hide the stale-cache
      // case below.
      return enabled === false ? { ...stub, isLoading: false } : stub
    },
  }
})

const { useIsNameOwner } = await import('./useIsNameOwner')

const render = () =>
  renderHook(() => useIsNameOwner({ name: 'legacy.eth' })).result.current

/** What `resolveEnsOwner` reports: for an unwrapped V1 2LD, the controller. */
const resolvedAs = (owner: Address, protocolVersion: 'ENSv1' | 'ENSv2') => {
  ownerQuery = { data: { owner, protocolVersion }, isLoading: false }
}

/** An unwrapped `.eth` 2LD whose token and manager sit in different wallets. */
const splitEth2ld = () => {
  v1StateQuery = {
    data: {
      subject: {
        kind: 'v1-registrar',
        registrant: REGISTRANT,
        controller: CONTROLLER,
      },
    },
    isLoading: false,
  }
}

describe('useIsNameOwner', () => {
  beforeEach(() => {
    connectedAddress = REGISTRANT
    ownerQuery = idle()
    v1StateQuery = idle()
    resolvedAs(CONTROLLER, 'ENSv1')
    splitEth2ld()
  })

  it('counts the registrant of an unwrapped V1 2LD, which the flattened owner hides', () => {
    expect(render().isOwner).toBe(true)
  })

  it('counts the controller of an unwrapped V1 2LD', () => {
    connectedAddress = CONTROLLER

    expect(render().isOwner).toBe(true)
  })

  it('counts neither for a stranger the name merely points at', () => {
    connectedAddress = STRANGER

    expect(render().isOwner).toBe(false)
  })

  it('ignores a stale cached V1 holder once the name resolves as V2', () => {
    resolvedAs(STRANGER, 'ENSv2')

    const result = render()
    expect(result.isOwner).toBe(false)
    expect(result.isLoading).toBe(false)
  })
})
