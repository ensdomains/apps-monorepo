import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { QueryClient } from '@tanstack/react-query'
import { ok } from 'neverthrow'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeDomain, OTHER, OWNER } from './_fixtures'
import { reconcileRenewedV1Names } from './reconcileRenewedV1Names'
import { refreshV1NameAfterRenewal } from './refreshV1NameAfterRenewal'
import type { V1Domain } from './v1SubgraphClient'

const mocks = vi.hoisted(() => ({ getExpiry: vi.fn(), client: {} }))

vi.mock('@ensdomains/ensjs/public/v1', () => ({
  getExpiry: mocks.getExpiry,
}))
vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok(mocks.client),
}))

const NOW = 2_000_000_000n
const GRACE = 90n * 24n * 60n * 60n
const RENEWED_EXPIRY = NOW + 7n * 24n * 60n * 60n
const queryKey = qk('migration', 'v1_names', { address: OWNER })

const expiryResult = (expiry: bigint) => ({
  expiry,
  gracePeriod: Number(GRACE),
  status: 'active',
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(Number(NOW) * 1000)
  vi.clearAllMocks()
  mocks.getExpiry.mockImplementation(
    (_client: unknown, { contract }: { contract: string }) =>
      Promise.resolve(
        contract === 'registrar' ? expiryResult(RENEWED_EXPIRY) : null,
      ),
  )
})

afterEach(() => vi.useRealTimers())

const createClient = (domains: V1Domain[]) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queryClient.setQueryData(queryKey, domains)
  return queryClient
}

describe('confirmed V1 renewal reconciliation', () => {
  it('updates only the renewed name and invalidates migration eligibility', async () => {
    const domain = makeDomain({ registrationExpiry: (NOW - 100n).toString() })
    const unrelated = makeDomain({ name: 'bob.eth' })
    const queryClient = createClient([domain, unrelated])
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    const result = await refreshV1NameAfterRenewal({
      queryClient,
      domain,
      minimumExpiry: RENEWED_EXPIRY,
    })

    expect(result._unsafeUnwrap()).toBe(RENEWED_EXPIRY)
    expect(queryClient.getQueryData<V1Domain[]>(queryKey)).toEqual([
      {
        ...domain,
        registration: { expiryDate: RENEWED_EXPIRY.toString() },
      },
      unrelated,
    ])
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: qk('migration', 'eligibility'),
    })
  })

  it('reads and preserves the authoritative wrapped expiry', async () => {
    const domain = makeDomain({
      registrationExpiry: (NOW - 100n).toString(),
      isWrapped: true,
      wrappedExpiry: (NOW + GRACE - 100n).toString(),
    })
    const wrapperExpiry = RENEWED_EXPIRY + GRACE + 10n
    mocks.getExpiry.mockImplementation(
      (_client: unknown, { contract }: { contract: string }) =>
        Promise.resolve(
          expiryResult(
            contract === 'registrar' ? RENEWED_EXPIRY : wrapperExpiry,
          ),
        ),
    )
    const queryClient = createClient([domain])

    await refreshV1NameAfterRenewal({ queryClient, domain })

    expect(mocks.getExpiry).toHaveBeenCalledWith(mocks.client, {
      name: domain.name,
      contract: 'nameWrapper',
    })
    expect(queryClient.getQueryData<V1Domain[]>(queryKey)?.[0]).toMatchObject({
      wrappedDomain: { expiryDate: wrapperExpiry.toString() },
    })
  })

  it('preserves confirmed expiry through stale indexing until the indexer catches up', async () => {
    const domain = makeDomain({ registrationExpiry: (NOW - 100n).toString() })
    const queryClient = createClient([domain])
    await refreshV1NameAfterRenewal({ queryClient, domain })

    const reconciled = reconcileRenewedV1Names(queryClient, [domain])
    expect(reconciled[0]?.registration?.expiryDate).toBe(
      RENEWED_EXPIRY.toString(),
    )
    expect(reconcileRenewedV1Names(queryClient, reconciled)).toEqual(reconciled)
    expect(reconcileRenewedV1Names(queryClient, [domain])).toEqual([domain])
  })

  it('does not apply a prior confirmation to changed ownership or wrapper metadata', async () => {
    const domain = makeDomain({ registrationExpiry: (NOW - 100n).toString() })
    const queryClient = createClient([domain])
    await refreshV1NameAfterRenewal({ queryClient, domain })
    const transferred = { ...domain, registrant: { id: OTHER } }
    const newlyWrapped = {
      ...domain,
      wrappedOwner: { id: OWNER },
      wrappedDomain: { expiryDate: NOW.toString(), fuses: 0 },
    }

    expect(reconcileRenewedV1Names(queryClient, [transferred])).toEqual([
      transferred,
    ])
    expect(reconcileRenewedV1Names(queryClient, [newlyWrapped])).toEqual([
      newlyWrapped,
    ])
  })

  it('drops confirmations at their registration expiry', async () => {
    const domain = makeDomain({ registrationExpiry: (NOW - 100n).toString() })
    const queryClient = createClient([domain])
    await refreshV1NameAfterRenewal({ queryClient, domain })
    vi.setSystemTime(Number(RENEWED_EXPIRY) * 1000)

    expect(reconcileRenewedV1Names(queryClient, [domain])).toEqual([domain])
  })

  it('rejects stale RPC results without changing cached domains', async () => {
    const domain = makeDomain({ registrationExpiry: (NOW - 100n).toString() })
    const queryClient = createClient([domain])
    const result = await refreshV1NameAfterRenewal({
      queryClient,
      domain,
      minimumExpiry: RENEWED_EXPIRY + 1n,
    })

    expect(result.isErr()).toBe(true)
    expect(queryClient.getQueryData(queryKey)).toEqual([domain])
    expect(reconcileRenewedV1Names(queryClient, [domain])).toEqual([domain])
  })

  it('does not change cached domains if either chain read fails', async () => {
    const domain = makeDomain({ registrationExpiry: (NOW - 100n).toString() })
    const queryClient = createClient([domain])
    mocks.getExpiry.mockRejectedValue(new Error('RPC unavailable'))

    const result = await refreshV1NameAfterRenewal({ queryClient, domain })

    expect(result.isErr()).toBe(true)
    expect(queryClient.getQueryData(queryKey)).toEqual([domain])
  })

  it('scopes reconciliation to the query client that observed the renewal', async () => {
    const domain = makeDomain({ registrationExpiry: (NOW - 100n).toString() })
    const queryClient = createClient([domain])
    await refreshV1NameAfterRenewal({ queryClient, domain })

    expect(reconcileRenewedV1Names(createClient([domain]), [domain])).toEqual([
      domain,
    ])
  })
})
