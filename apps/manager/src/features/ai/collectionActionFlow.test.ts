import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { parseJevAiResponse } from './intent'
import { type AiHandoffContext, openAiAction } from './openAiAction'
import { type AiHandoffInputs, prepareAiHandoff } from './prepareAiHandoff'

vi.mock('@/features/profile/service/profileOwner', () => ({
  profileOwnerQuery: (name: string) => ({ queryKey: ['owner', name] }),
}))
vi.mock('@/features/register-v2/data/queries/availability.query', () => ({
  getRegistrationV2AvailabilityQueryOptions: (name: string) => ({
    queryKey: ['availability', name],
  }),
}))

const choice = (value: string, confidence = 0.99) => ({
  type: 'choice',
  choice: value,
  confidence,
})
const response = (overrides: Record<string, unknown> = {}) => ({
  answers: {
    fully_supported: { type: 'noul', noul: 0.99 },
    unsupported_requirement: { type: 'noul', noul: 0.01 },
    multi_action: { type: 'noul', noul: 0.01 },
    intent: choice('renew'),
    next_intent: choice('none'),
    request_mode: choice('requested'),
    action_count: choice('one'),
    renewal_target: choice('exact_list'),
    selection_constraints: choice('represented'),
    expiry: choice('any'),
    expiry_window: choice('none'),
    search_shape: choice('conjunction'),
    role: choice('any'),
    version: choice('any'),
    upgrade: choice('any'),
    favorite: choice('any'),
    primary: choice('any'),
    sort: choice('any'),
    ...overrides,
  },
})
const prepare = (
  query: string,
  overrides: Record<string, unknown> = {},
  inputs: AiHandoffInputs = {},
) => {
  const interpreted = parseJevAiResponse(response(overrides), query)
  return interpreted && prepareAiHandoff(interpreted.action, inputs)
}

describe('collection requests from interpretation through review preparation', () => {
  it.each([
    ['Renew orbit.eth and fern.eth for 69 days', { durationDays: 69 }],
    ['Extend orbit.eth and fern.eth for two years', { durationYears: 2 }],
  ] as const)('keeps every exact name and the added duration: %s', (query, duration) => {
    expect(prepare(query)).toEqual({
      status: 'ready',
      action: {
        intent: 'bulk_renew',
        names: ['orbit.eth', 'fern.eth'],
        filters: {},
        ...duration,
      },
    })
  })

  it('preserves AND filters as well as the exact requested names', () => {
    expect(
      prepare(
        'Renew orbit.eth and fern.eth that I own and have favorited for 35 days',
        { role: choice('owner'), favorite: choice('yes') },
      ),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'bulk_renew',
        names: ['orbit.eth', 'fern.eth'],
        filters: { role: 'owner', favorite: 'yes' },
        durationDays: 35,
      },
    })
  })

  it('keeps an expiry selection window separate from extra renewal time', () => {
    expect(
      prepare('Renew my names expiring within 45 days for two years', {
        renewal_target: choice('wallet_set'),
        expiry: choice('expiring'),
        expiry_window: choice('positive_days'),
      }),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'bulk_renew',
        filters: { expiry: 'expiring', withinDays: 45 },
        durationYears: 2,
      },
    })
  })

  it('retains prior exact names and filters when renewing those names', () => {
    expect(
      prepare(
        'Renew those names for 56 days',
        { renewal_target: choice('wallet_set') },
        {
          lastNames: ['orbit.eth', 'fern.eth'],
          lastFilters: { role: 'owner', version: 'v2' },
        },
      ),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'bulk_renew',
        names: ['orbit.eth', 'fern.eth'],
        filters: { role: 'owner', version: 'v2' },
        durationDays: 56,
      },
    })
  })

  it('keeps a narrowing follow-up tied to prior exact names', () => {
    expect(
      prepare(
        'Renew those names except favorites for 28 days',
        { renewal_target: choice('wallet_set'), favorite: choice('no') },
        {
          lastNames: ['orbit.eth', 'fern.eth'],
          lastFilters: { role: 'owner' },
        },
      ),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'bulk_renew',
        names: ['orbit.eth', 'fern.eth'],
        filters: { role: 'owner', favorite: 'no' },
        durationDays: 28,
      },
    })
  })

  it('uses 28 days as the bulk minimum while keeping single renewals independent', () => {
    expect(prepare('Renew orbit.eth and fern.eth for 27 days')).toMatchObject({
      status: 'invalid',
    })
    expect(prepare('Renew orbit.eth and fern.eth for 28 days')).toMatchObject({
      status: 'ready',
      action: { intent: 'bulk_renew', durationDays: 28 },
    })
    expect(
      prepare('Renew orbit.eth for 10 days', { renewal_target: choice('one') }),
    ).toMatchObject({
      status: 'ready',
      action: { intent: 'renew', name: 'orbit.eth', durationDays: 10 },
    })
  })

  it('clarifies a bulk duration without losing the exact names or amount', () => {
    const query = 'Renew orbit.eth and fern.eth for 10'
    expect(prepare(query)).toMatchObject({
      status: 'needs_input',
      field: 'durationUnit',
    })
    expect(prepare(query, {}, { durationUnit: 'weeks' })).toEqual({
      status: 'ready',
      action: {
        intent: 'bulk_renew',
        names: ['orbit.eth', 'fern.eth'],
        filters: {},
        durationDays: 70,
      },
    })
    expect(prepare(query, {}, { durationUnit: 'days' })).toMatchObject({
      status: 'invalid',
    })
  })

  it('rejects conflicting continuation filters instead of replacing the previous selection', () => {
    expect(
      prepare(
        'Renew those manager names for 40 days',
        { renewal_target: choice('wallet_set'), role: choice('manager') },
        { lastNames: ['orbit.eth'], lastFilters: { role: 'owner' } },
      ),
    ).toMatchObject({ status: 'invalid' })
  })

  it('does not guess a selection when those names have no previous context', () => {
    expect(
      prepare('Renew those names for 40 days', {
        renewal_target: choice('wallet_set'),
      }),
    ).toMatchObject({ status: 'invalid' })
  })

  it.each([
    'Renew orbit.eth and fern.eth with animal meanings for 35 days',
    'Renew orbit.eth and fern.eth except orbit.eth for 35 days',
    'Renew orbit.eth and fern.eth for two months',
    'Renew orbit.eth and fern.eth for 35 days and transfer fern.eth',
  ])('never silently narrows an unsupported collection into one-name renewal: %s', (query) => {
    const result = prepare(query, {
      selection_constraints: choice('unsupported'),
    })
    expect(result === null || result.status === 'invalid').toBe(true)
  })

  it('never trusts a model single-name scope over an explicit multi-name list', () => {
    const result = prepare('Renew orbit.eth and fern.eth for 35 days', {
      renewal_target: choice('one'),
    })
    expect(
      result === null ||
        result.status !== 'ready' ||
        result.action.intent === 'bulk_renew',
    ).toBe(true)
    if (result?.status === 'ready')
      expect(result.action).toMatchObject({ names: ['orbit.eth', 'fern.eth'] })
  })

  it('opens one existing bulk review rather than navigating either name to renewal', async () => {
    const prepared = prepare('Renew orbit.eth and fern.eth for 69 days')
    expect(prepared).toMatchObject({ status: 'ready' })
    if (prepared?.status !== 'ready')
      throw new Error('Expected a prepared exact collection')
    const context = {
      queryClient: new QueryClient(),
      navigate: vi.fn(async () => undefined),
      favoriteLabels: new Set<string>(),
      addFavorite: vi.fn(),
      openPrimary: vi.fn(),
      openBulkRenew: vi.fn(),
      openProfileEditor: vi.fn(),
      openManagerReview: vi.fn(),
      isCurrent: () => true,
    } satisfies AiHandoffContext
    const fetchQuery = vi.spyOn(context.queryClient, 'fetchQuery')
    await expect(openAiAction(prepared.action, context)).resolves.toBeNull()
    expect(context.openBulkRenew).toHaveBeenCalledOnce()
    expect(context.navigate).not.toHaveBeenCalled()
    expect(fetchQuery).not.toHaveBeenCalled()
    expect(context.addFavorite).not.toHaveBeenCalled()
  })
})
