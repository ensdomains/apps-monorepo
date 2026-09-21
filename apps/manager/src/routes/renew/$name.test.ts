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

type ExpiryResult = {
  readonly expiry: bigint | null
  readonly isNonExpiring: boolean
  readonly protocol: 'v1' | 'v2'
}

const EXPIRY_2030 = BigInt(
  Math.floor(new Date('2030-01-01T00:00:00Z').getTime() / 1000),
)

const runLoader = async (name: string, expiryData: ExpiryResult) => {
  const fetchQuery = vi.fn().mockResolvedValue(expiryData)
  const ensureQueryData = vi.fn()
  const loader = Route.options.loader as (args: {
    params: { name: string }
    context: { queryClient: unknown }
  }) => Promise<unknown>

  const outcome = await loader({
    params: { name },
    context: { queryClient: { fetchQuery, ensureQueryData } },
  }).catch((error: unknown) => error)

  return { outcome, fetchQuery, ensureQueryData }
}

const runBeforeLoad = (name: string) => {
  const beforeLoad = Route.options.beforeLoad as (args: {
    params: { name: string }
  }) => void

  try {
    return beforeLoad({ params: { name } })
  } catch (error) {
    return error
  }
}

describe('/renew/$name loader', () => {
  it('reads the expiry fresh rather than through the query cache', async () => {
    // A name registered moments ago has a cached entry from before it existed,
    // and serving that reported it as unrenewable for the rest of the session.
    const { outcome, fetchQuery, ensureQueryData } = await runLoader(
      'android17.eth',
      { expiry: EXPIRY_2030, isNonExpiring: false, protocol: 'v2' },
    )

    expect(fetchQuery).toHaveBeenCalledOnce()
    expect(ensureQueryData).not.toHaveBeenCalled()
    expect(outcome).toEqual({
      label: 'android17',
      currentExpiry: EXPIRY_2030,
    })
  })

  it('redirects a look-alike label to the name it would actually renew', () => {
    // `ALICE.eth` renews `alice.eth`, a registration someone else may own, so
    // the user lands on — and pays on — a page titled with the real name.
    expect(runBeforeLoad('ALICE.eth')).toEqual({
      redirect: {
        params: { name: 'alice.eth' },
        to: '/renew/$name',
        replace: true,
      },
    })
  })

  it('redirects before the loader runs, never from it', async () => {
    // A loader redirect during SSR abandons the route chunk load the router
    // already started, hanging every later render of this route on the worker.
    expect(runBeforeLoad('alice.eth')).toBeUndefined()

    const { outcome, fetchQuery } = await runLoader('ALICE.eth', {
      expiry: EXPIRY_2030,
      isNonExpiring: false,
      protocol: 'v2',
    })

    expect(outcome).toBeInstanceOf(Error)
    expect(outcome).not.toHaveProperty('redirect')
    expect(fetchQuery).not.toHaveBeenCalled()
  })

  it('refuses a label with no normalized form to redirect to', async () => {
    const { outcome, fetchQuery } = await runLoader('te_st.eth', {
      expiry: EXPIRY_2030,
      isNonExpiring: false,
      protocol: 'v2',
    })

    expect(outcome).toBeInstanceOf(Error)
    expect((outcome as Error).message).toBe(
      'This name is not in its normalized form, so it cannot be renewed here',
    )
    expect(fetchQuery).not.toHaveBeenCalled()
  })

  it('sends a label with no expiry record to registration', async () => {
    const { outcome } = await runLoader('never-registered.eth', {
      expiry: null,
      isNonExpiring: false,
      protocol: 'v2',
    })

    expect(outcome).toEqual({
      redirect: {
        params: { name: 'never-registered.eth' },
        to: '/register/$name',
        replace: true,
      },
    })
  })

  it('says a non-expiring name has nothing to renew', async () => {
    const { outcome } = await runLoader('permanent.eth', {
      expiry: null,
      isNonExpiring: true,
      protocol: 'v2',
    })

    expect(outcome).toBeInstanceOf(Error)
    expect((outcome as Error).message).toBe(
      'This name has no expiry, so there is nothing to renew.',
    )
  })

  it('distinguishes a name outside its renewal window', async () => {
    const { outcome } = await runLoader('lapsed.eth', {
      expiry: 1n,
      isNonExpiring: false,
      protocol: 'v2',
    })

    // Past grace redirects to registration before the window check is reached.
    expect(outcome).toEqual({
      redirect: {
        params: { name: 'lapsed.eth' },
        to: '/register/$name',
        replace: true,
      },
    })
  })

  it('routes a v1 name to the v1 renewal flow', async () => {
    const { outcome } = await runLoader('legacy.eth', {
      expiry: EXPIRY_2030,
      isNonExpiring: false,
      protocol: 'v1',
    })

    expect(outcome).toEqual({
      redirect: {
        params: { name: 'legacy.eth' },
        to: '/renew-v1/$name',
        replace: true,
      },
    })
  })
})
