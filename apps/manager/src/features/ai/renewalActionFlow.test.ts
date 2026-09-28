import { QueryClient } from '@tanstack/react-query'
import * as v from 'valibot'
import { describe, expect, it, vi } from 'vitest'
import { createActor } from 'xstate'
import {
  getDurationPrefillSeconds,
  renewalDurationSearchSchema,
} from '@/features/register-v2/utils/durationSearch'
import { renewalUiMachine } from '@/features/renew/state/renewalUi.machine'
import { parseJevAiResponse } from './intent'
import { type AiHandoffContext, openAiAction } from './openAiAction'
import { prepareAiHandoff } from './prepareAiHandoff'

vi.mock('@/features/profile/service/profileOwner', () => ({
  profileOwnerQuery: (name: string) => ({ queryKey: ['owner', name] }),
}))

vi.mock('@/features/register-v2/data/queries/availability.query', () => ({
  getRegistrationV2AvailabilityQueryOptions: (name: string) => ({
    queryKey: ['availability', name],
  }),
}))

// Observed Jev answers for the exact for-another prompt after clarifying
// renewal support. Keep the acceptance path tied to a real model response.
const renewalResponse = {
  answers: {
    intent: { type: 'choice', choice: 'renew', confidence: 1 },
    next_intent: { type: 'choice', choice: 'none', confidence: 0.97 },
    fully_supported: { type: 'noul', noul: 0.95 },
    unsupported_requirement: { type: 'noul', noul: 0.07 },
    multi_action: { type: 'noul', noul: 0.05 },
  },
}

const makeContext = () =>
  ({
    queryClient: new QueryClient(),
    navigate: vi.fn(async (_options: unknown) => undefined),
    favoriteLabels: new Set<string>(),
    addFavorite: vi.fn().mockResolvedValue(undefined),
    openPrimary: vi.fn(),
    openBulkRenew: vi.fn(),
    openProfileEditor: vi.fn(),
    openManagerReview: vi.fn(),
    isCurrent: () => true,
  }) satisfies AiHandoffContext

describe('AI extension request through existing renewal routes', () => {
  it.each([
    ['extend pookie.eth for another 10 days', 'v1', '/renew-v1/$name'],
    ['extend pookie.eth for another 10 days', 'v2', '/renew/$name'],
    ['extend pookie.eth by 10 days', 'v1', '/renew-v1/$name'],
    ['extend pookie.eth by 10 days', 'v2', '/renew/$name'],
    ['renew pookie.eth for another 10 days', 'v1', '/renew-v1/$name'],
    ['renew pookie.eth for another 10 days', 'v2', '/renew/$name'],
  ] as const)('preserves 10 added days for "%s" on %s', async (query, protocol, route) => {
    const interpreted = parseJevAiResponse(renewalResponse, query)
    expect(interpreted).toEqual({
      status: 'ok',
      action: { intent: 'renew', name: 'pookie.eth', durationDays: 10 },
    })
    if (!interpreted) throw new Error('Expected a supported renewal request')

    const prepared = prepareAiHandoff(interpreted.action)
    expect(prepared).toMatchObject({
      status: 'ready',
      action: { intent: 'renew', name: 'pookie.eth', durationDays: 10 },
    })
    if (prepared.status !== 'ready')
      throw new Error('Expected a prepared renewal action')

    const context = makeContext()
    vi.spyOn(context.queryClient, 'fetchQuery').mockResolvedValue({
      owner: '0x000000000000000000000000000000000000dead',
      protocol,
    })
    await openAiAction(prepared.action, context)

    expect(context.navigate).toHaveBeenCalledWith({
      to: route,
      params: { name: 'pookie.eth' },
      search: { durationDays: 10 },
    })
    const { search: validatedSearch } = v.parse(
      v.object({ search: renewalDurationSearchSchema }),
      context.navigate.mock.calls[0]?.[0],
    )
    const currentExpiry = 1_800_000_000n
    const durationSeconds = getDurationPrefillSeconds(
      validatedSearch,
      new Date(Number(currentExpiry) * 1000),
    )
    expect(durationSeconds).toBe(864_000)
    if (durationSeconds === undefined)
      throw new Error('Expected the requested renewal duration')
    const renewal = createActor(renewalUiMachine, {
      input: {
        currentExpiry,
        protocol,
        initialDurationSeconds: BigInt(durationSeconds),
      },
    }).start()
    expect(renewal.getSnapshot().context.duration).toBe(864_000n)
    expect(renewal.getSnapshot().matches({ pricing: 'duration' })).toBe(true)
    renewal.stop()

    expect(context.addFavorite).not.toHaveBeenCalled()
    expect(context.openPrimary).not.toHaveBeenCalled()
    expect(context.openProfileEditor).not.toHaveBeenCalled()
  })
})

describe('AI specific-name viewing', () => {
  const viewResponse = {
    answers: {
      intent: { type: 'choice', choice: 'view_name', confidence: 1 },
      next_intent: { type: 'choice', choice: 'none', confidence: 0.95 },
      fully_supported: { type: 'noul', noul: 0.8 },
      unsupported_requirement: { type: 'noul', noul: 0.07 },
      multi_action: { type: 'noul', noul: 0.05 },
    },
  }

  it('opens the existing profile route from the observed Show response', async () => {
    const interpreted = parseJevAiResponse(viewResponse, 'Show pookie.eth')
    expect(interpreted).toEqual({
      status: 'ok',
      action: { intent: 'view_name', name: 'pookie.eth' },
    })
    if (!interpreted) throw new Error('Expected a supported view request')
    const prepared = prepareAiHandoff(interpreted.action)
    if (prepared.status !== 'ready')
      throw new Error('Expected a prepared view action')
    const context = makeContext()
    await openAiAction(prepared.action, context)
    expect(context.navigate).toHaveBeenCalledWith({
      to: '/$name',
      params: { name: 'pookie.eth' },
    })
  })

  it('rejects a contradictory unfiltered wallet-list classification', () => {
    const choice = { type: 'choice', choice: 'any', confidence: 0.99 }
    expect(
      parseJevAiResponse(
        {
          answers: {
            ...viewResponse.answers,
            intent: { type: 'choice', choice: 'find_names', confidence: 0.67 },
            expiry: choice,
            role: choice,
            version: choice,
            upgrade: choice,
            favorite: choice,
            primary: choice,
            sort: choice,
          },
        },
        'Show pookie.eth',
      ),
    ).toBeNull()
  })
})
