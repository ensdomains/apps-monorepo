import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  redirect: (options: Record<string, unknown>) => ({ redirect: options }),
}))

vi.mock('@/features/register-v2', async () => {
  const { parseCanonicalName } = await import(
    '@/features/register-v2/utils/name-parser'
  )

  return {
    parseCanonicalName,
    getRegistrationV2AvailabilityQueryOptions: (name: string) => ({
      queryKey: [{ name }],
    }),
    FailureStep: () => null,
    PricingStep: () => null,
    RegisteringStep: () => null,
    RegistrationV2UiProvider: () => null,
    SuccessStep: () => null,
  }
})

vi.mock('@/features/weave-registration', () => ({
  useRegistrationFlowController: () => ({}),
}))

vi.mock('@/components/NameFallbackCard', () => ({
  NameFallbackCard: () => null,
}))

const { Route } = await import('./$name')

const runLoader = async (name: string, isAvailable = true) => {
  const ensureQueryData = vi.fn().mockResolvedValue({ isAvailable })
  const loader = Route.options.loader as (args: {
    params: { name: string }
    context: { queryClient: unknown }
  }) => Promise<unknown>

  const outcome = await loader({
    params: { name },
    context: { queryClient: { ensureQueryData } },
  }).catch((error: unknown) => error)

  return { outcome, ensureQueryData }
}

describe('/register/$name loader', () => {
  it('registers the label it checked as available', async () => {
    const { outcome, ensureQueryData } = await runLoader('vitalik.eth')

    expect(ensureQueryData).toHaveBeenCalledWith({
      queryKey: [{ name: 'vitalik.eth' }],
    })
    expect(outcome).toEqual({ fallback: undefined, label: 'vitalik' })
  })

  it('prices and registers the normalised label for an upper-case name', async () => {
    const { outcome, ensureQueryData } = await runLoader('VITALIK.ETH')

    expect(ensureQueryData).toHaveBeenCalledWith({
      queryKey: [{ name: 'vitalik.eth' }],
    })
    expect(outcome).toEqual({ fallback: undefined, label: 'vitalik' })
  })

  it.each([
    ['a fullwidth look-alike', 'ｖｉｔａｌｉｋ.eth', 'vitalik.eth'],
    ['a soft hyphen', 'vi­talik.eth', 'vitalik.eth'],
    ['a zero-width space', 'vitalik​.eth', 'vitalik.eth'],
    ['a stray variation selector', 'thumbs\u{1f44d}️.eth', 'thumbs👍.eth'],
    ['an NFD accent', 'cafés.eth', 'cafés.eth'],
  ])('redirects %s to its canonical spelling before anything is priced', async (_case, name, canonical) => {
    // The registrar hashes the label bytes it is handed. Checking
    // availability for the raw spelling answers truthfully about a label no
    // ENSIP-15 client will ever look up, so the buyer would pay for a name
    // that reads as `canonical` but is not it.
    const { outcome, ensureQueryData } = await runLoader(name)

    expect(ensureQueryData).not.toHaveBeenCalled()
    expect(outcome).toEqual({
      redirect: {
        params: { name: canonical },
        to: '/register/$name',
        replace: true,
      },
    })
  })

  it('refuses an xn-- label, which has no canonical form to redirect to', async () => {
    const { outcome, ensureQueryData } = await runLoader('xn--ls8h.eth')

    expect(ensureQueryData).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({ reason: 'NOT_NORMALIZED' })
  })

  it('refuses a bracket-encoded labelhash', async () => {
    const { outcome, ensureQueryData } = await runLoader(
      '[af2caa1c2ca1d027f1ac823b529d0a67cd144264b2789fa2ea4d63a67c7103cc].eth',
    )

    expect(ensureQueryData).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({ reason: 'INVALID_CHARACTER' })
  })

  it('sends an unavailable name to its profile under the canonical name', async () => {
    const { outcome } = await runLoader('vitalik.eth', false)

    expect(outcome).toEqual({
      redirect: { to: '/$name', params: { name: 'vitalik.eth' } },
    })
  })
})
