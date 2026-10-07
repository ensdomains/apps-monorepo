import { keepPreviousData } from '@tanstack/react-query'
import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  estimateHcaBudgetActor: vi.fn(),
  readHcaUsdcBalanceActor: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@/lib/wagmi', () => ({ publicClient: {} }))
vi.mock('@ens-apps/utils/logger', () => ({ logger: { warn: mocks.warn } }))
vi.mock(
  '@ens-apps/transaction-manager/machines/registration/registration.hca.actors',
  () => ({
    estimateHcaBudgetActor: mocks.estimateHcaBudgetActor,
    readHcaUsdcBalanceActor: mocks.readHcaUsdcBalanceActor,
  }),
)

import { getHcaBudgetQueryOptions } from './hcaBudget.query'

const BUDGET = {
  total: 20_196_054n,
  commitCost: 4_000_000n,
  registerCost: 8_196_033n,
  registrationPrice: 8_000_021n,
  source: 'quote' as const,
}

/** Calls the adapted `queryFn` the way TanStack would, minus the cache around it. */
const callQueryFn = (queryFn: unknown): Promise<unknown> => {
  if (typeof queryFn !== 'function') throw new Error('queryFn was not adapted')

  const run = queryFn as (context: unknown) => Promise<unknown>
  return run({})
}

const baseParams = {
  label: 'jeff',
  durationInSeconds: 31_536_000,
  hca: '0x1111111111111111111111111111111111111111' as const,
  signer: { type: 'rhinestone' } as never,
  primaryName: undefined,
  getSessionEnablePayload: () => Promise.resolve(undefined),
}

/** Runs the queryFn and returns the input the estimator was actually called with. */
const runQueryFn = async (
  params: Parameters<typeof getHcaBudgetQueryOptions>[0],
) => {
  mocks.estimateHcaBudgetActor.mockReturnValue(okAsync(BUDGET))
  mocks.readHcaUsdcBalanceActor.mockReturnValue(okAsync(0n))
  const options = getHcaBudgetQueryOptions(params)
  const quote = await callQueryFn(options.queryFn)
  const estimatorInput = mocks.estimateHcaBudgetActor.mock.calls.at(0)?.at(0)
  return { quote, estimatorInput }
}

describe('getHcaBudgetQueryOptions', () => {
  // Each case asserts on the FIRST estimator call, so calls must not carry over.
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('quotes the primary-name opt-in the machine will actually submit', async () => {
    // The opt-in widens the register leg's gas limit, and the rail prices the
    // intent purely on gas units. Dropping it here quotes a budget SMALLER than
    // the permit the machine signs, so checkout clears and the permit preflight
    // then rejects the wallet this screen just cleared.
    const { estimatorInput } = await runQueryFn({
      ...baseParams,
      primaryName: 'jeff.eth',
    })

    expect(estimatorInput).toMatchObject({ primaryName: 'jeff.eth' })
  })

  it('omits primaryName entirely when the user opted out', async () => {
    // Absent rather than undefined: the estimator treats the key's presence as
    // the opt-in, so passing it through would over-quote a wallet that never
    // asked to set a primary name.
    const { estimatorInput } = await runQueryFn({
      ...baseParams,
      primaryName: undefined,
    })

    // Key absence, not an undefined value — `expect.anything()` would pass on
    // a present-but-undefined key and miss the distinction that matters.
    expect(Object.keys(estimatorInput ?? {})).not.toContain('primaryName')
  })

  it('keys the cache on the opt-in so toggling refetches', () => {
    const withPrimary = getHcaBudgetQueryOptions({
      ...baseParams,
      primaryName: 'jeff.eth',
    })
    const withoutPrimary = getHcaBudgetQueryOptions(baseParams)

    // Same label and duration — only the toggle differs. Sharing a key would
    // serve the other variant's budget and silently mis-size the gate.
    expect(withPrimary.queryKey).not.toEqual(withoutPrimary.queryKey)
  })

  it('returns the quoted budget alongside the HCA balance', async () => {
    mocks.estimateHcaBudgetActor.mockReturnValue(okAsync(BUDGET))
    mocks.readHcaUsdcBalanceActor.mockReturnValue(okAsync(20_000_000n))

    const options = getHcaBudgetQueryOptions(baseParams)
    const quote = await callQueryFn(options.queryFn)

    expect(quote).toEqual({ ...BUDGET, hcaBalance: 20_000_000n })
  })
  // The app default is 0, under which every mount and every window focus
  // re-runs two orchestrator round trips while the sheet is open.
  // On screen a refused quote only reads as an unknown fee, so without this
  // the reason it was refused leaves no trace anywhere.
  it('records why the orchestrator refused', async () => {
    const cause = new Error('orchestrator said no')
    mocks.estimateHcaBudgetActor.mockReturnValue(errAsync(cause))

    const options = getHcaBudgetQueryOptions(baseParams)
    await expect(callQueryFn(options.queryFn)).rejects.toBeInstanceOf(Error)

    expect(mocks.warn).toHaveBeenCalledWith(
      'HCA budget quote failed',
      expect.objectContaining({ cause }),
    )
  })

  // The other way a quote dies: both legs are signed with this payload, so
  // failing to resolve it is just as much "no quote" as a refused estimate.
  it('records a session payload it could not resolve', async () => {
    const cause = new Error('session enable failed')
    mocks.estimateHcaBudgetActor.mockReturnValue(okAsync(BUDGET))

    const options = getHcaBudgetQueryOptions({
      ...baseParams,
      getSessionEnablePayload: () => Promise.reject(cause),
    })
    await expect(callQueryFn(options.queryFn)).rejects.toBeInstanceOf(Error)

    expect(mocks.warn).toHaveBeenCalledWith(
      'HCA budget quote failed',
      expect.objectContaining({ cause }),
    )
  })

  it('keeps a quote fresh for a minute', () => {
    expect(getHcaBudgetQueryOptions(baseParams).staleTime).toBe(60_000)
  })

  // Toggling the opt-in starts a fresh query. Without a placeholder the
  // breakdown empties out and refills while the new quote runs.
  it('carries the last quote into the next one', () => {
    expect(getHcaBudgetQueryOptions(baseParams).placeholderData).toBe(
      keepPreviousData,
    )
  })
})
