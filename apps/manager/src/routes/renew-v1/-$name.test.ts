import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  redirect: (options: Record<string, unknown>) => ({ redirect: options }),
}))

vi.mock('@/features/renew/workflow/RenewalPage', () => ({
  RenewalPage: () => null,
}))

vi.mock('@/features/renew/workflow/components/RenewalRouteError', () => ({
  RenewalRouteError: () => null,
}))

const { Route } = await import('./$name')

type QueryOptions = {
  readonly queryKey: readonly [{ readonly $action: string }]
}

const NAME = 'legacy.eth'
const STALE_EXPIRY = 1_800_000_000n
const FRESH_EXPIRY = 1_900_000_000n

const getAction = (query: QueryOptions) => query.queryKey[0].$action

const queryFor = (action: 'expiry' | 'is-renewable') =>
  expect.objectContaining({
    queryKey: [
      expect.objectContaining({
        $action: action,
        name: NAME,
        protocol: 'v1',
      }),
    ],
  })

const runLoader = async ({
  cachedExpiry,
  cachedRenewability,
}: {
  readonly cachedExpiry: bigint
  readonly cachedRenewability: boolean
}) => {
  const ensureQueryData = vi.fn(async (query: QueryOptions) => {
    switch (getAction(query)) {
      case 'owner':
        return { protocol: 'v1' as const }
      case 'expiry':
        return {
          expiry: cachedExpiry,
          isNonExpiring: false,
          protocol: 'v1' as const,
        }
      case 'is-renewable':
        return cachedRenewability
      default:
        throw new Error(`Unexpected cached query: ${getAction(query)}`)
    }
  })
  const fetchQuery = vi.fn(async (query: QueryOptions) => {
    switch (getAction(query)) {
      case 'expiry':
        return {
          expiry: FRESH_EXPIRY,
          isNonExpiring: false,
          protocol: 'v1' as const,
        }
      case 'is-renewable':
        return true
      default:
        throw new Error(`Unexpected fresh query: ${getAction(query)}`)
    }
  })
  const loader = Route.options.loader as (args: {
    params: { name: string }
    context: { queryClient: unknown }
  }) => Promise<unknown>

  const outcome = await loader({
    params: { name: NAME },
    context: { queryClient: { ensureQueryData, fetchQuery } },
  }).catch((error: unknown) => error)

  return { ensureQueryData, fetchQuery, outcome }
}

describe('/renew-v1/$name loader', () => {
  it('reads renewability fresh rather than through the query cache', async () => {
    const { ensureQueryData, fetchQuery, outcome } = await runLoader({
      cachedExpiry: FRESH_EXPIRY,
      cachedRenewability: false,
    })

    expect(outcome).toEqual({
      status: 'renewable',
      label: 'legacy',
      currentExpiry: FRESH_EXPIRY,
    })
    expect(fetchQuery).toHaveBeenCalledWith(queryFor('is-renewable'))
    expect(ensureQueryData).not.toHaveBeenCalledWith(queryFor('is-renewable'))
  })

  it('reads the expiry fresh rather than through the query cache', async () => {
    const { ensureQueryData, fetchQuery, outcome } = await runLoader({
      cachedExpiry: STALE_EXPIRY,
      cachedRenewability: true,
    })

    expect(outcome).toEqual({
      status: 'renewable',
      label: 'legacy',
      currentExpiry: FRESH_EXPIRY,
    })
    expect(fetchQuery).toHaveBeenCalledWith(queryFor('expiry'))
    expect(ensureQueryData).not.toHaveBeenCalledWith(queryFor('expiry'))
  })
})
