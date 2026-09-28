import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { applyProfileEditProposal } from '@/features/profile/service/profileEditProposal'
import { PROFILE_FIELD_DEFINITIONS } from '@/features/profile/service/profileFieldRegistry'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
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

const choice = (value: string, confidence = 0.99) => ({
  type: 'choice',
  choice: value,
  confidence,
})

// Relevant answers from the first, preserved focused-development failure.
// The model confidently confused a social unfeature with name unfavouriting.
const capturedAnswers = {
  intent: choice('manager_action'),
  fully_supported: { type: 'noul', noul: 0.9 },
  unsupported_requirement: { type: 'noul', noul: 0.14 },
  multi_action: { type: 'noul', noul: 0.05 },
  next_intent: choice('none', 0.95),
  request_mode: choice('requested', 1),
  action_count: choice('one'),
  manager_action: choice('unfavorite'),
  manager_constraints: choice('represented', 0.98),
  profile_field: choice('twitter', 0.43),
  profile_operation: choice('unfeature', 0.95),
  profile_value: choice('none', 1),
  profile_previous_value: choice('none', 1),
  profile_network: choice('none', 0.28),
}

// Relevant unmodified choices from social-contrast-telegram in the preserved
// first 12 social contrasts. Its only failing gate was main-intent confidence.
const capturedTelegramAnswers = {
  intent: choice('edit_profile', 0.49),
  fully_supported: { type: 'noul', noul: 0.6 },
  unsupported_requirement: { type: 'noul', noul: 0.4 },
  multi_action: { type: 'noul', noul: 0.04 },
  next_intent: choice('none', 0.85),
  request_mode: choice('requested', 1),
  action_count: choice('one', 1),
  manager_action: choice('telegram_remove', 0.87),
  manager_constraints: choice('represented', 0.44),
  profile_field: choice('telegram', 0.53),
  profile_operation: choice('unfeature', 0.74),
  profile_value: choice('none', 1),
  profile_previous_value: choice('none', 1),
  profile_network: choice('unknown', 0.03),
}

// The first live state-word request mistook "as featured" for a new username.
// Keep its relevant original votes so this failure cannot silently return.
const capturedFeaturedStateAnswers = {
  intent: choice('edit_profile', 1),
  fully_supported: { type: 'noul', noul: 0.96 },
  unsupported_requirement: { type: 'noul', noul: 0.11 },
  multi_action: { type: 'noul', noul: 0.05 },
  next_intent: choice('none', 0.99),
  request_mode: choice('requested', 1),
  action_count: choice('one', 0.99),
  profile_field: choice('github', 0.97),
  profile_operation: choice('set', 0.99),
  profile_value: choice('value_1', 0.99),
  profile_previous_value: choice('none', 0.99),
  profile_network: choice('unknown', 0.47),
}

describe('social-record operations versus ENS name favourites', () => {
  it('rejects the captured username replacement for a featured-state request', () => {
    const response = { answers: capturedFeaturedStateAnswers }
    const before = structuredClone(response)
    expect(
      parseJevAiResponse(
        response,
        'Set the GitHub contact on cinquefoil.eth as featured',
      ),
    ).toBeNull()
    expect(response).toEqual(before)
  })

  it('keeps featured as an exact username when the user explicitly supplies that value', () => {
    const result = parseJevAiResponse(
      { answers: capturedFeaturedStateAnswers },
      'Set the GitHub username on cinquefoil.eth to featured',
    )
    if (!result) throw new Error('Expected the literal username assignment')
    expect(prepareAiHandoff(result.action)).toEqual({
      status: 'ready',
      action: {
        intent: 'edit_profile',
        name: 'cinquefoil.eth',
        section: 'contact',
        proposal: { field: 'github', value: 'featured' },
      },
    })
  })

  it('prepares the captured Telegram operation without rewriting its uncertain main choice', () => {
    const response = { answers: capturedTelegramAnswers }
    const before = structuredClone(response)
    const result = parseJevAiResponse(
      response,
      'Unpin the Telegram account for wisteria.eth',
    )
    expect(result?.action).toEqual({
      intent: 'edit_profile',
      name: 'wisteria.eth',
      section: 'contact',
      field: 'telegram',
      operation: 'unfeature',
    })
    if (!result) throw new Error('Expected the exact Telegram operation')
    expect(prepareAiHandoff(result.action)).toEqual({
      status: 'ready',
      action: {
        intent: 'edit_profile',
        name: 'wisteria.eth',
        section: 'contact',
        proposal: { field: 'telegram', operation: 'unfeature', value: '' },
      },
    })
    expect(response).toEqual(before)
  })

  const lowIntentSocialCases = PROFILE_FIELD_DEFINITIONS.filter(
    ({ storage }) => storage === 'social',
  ).flatMap(({ field }) =>
    (['feature', 'unfeature'] as const).flatMap((operation) =>
      [0, 0.49].map((confidence) => ({ field, operation, confidence })),
    ),
  )

  it.each(
    lowIntentSocialCases,
  )('preserves a complete $field $operation when matching main confidence is $confidence', ({
    field,
    operation,
    confidence,
  }) => {
    const response = {
      answers: {
        ...capturedTelegramAnswers,
        intent: choice('edit_profile', confidence),
        profile_field: choice(field, 0.53),
        profile_operation: choice(operation, 0.74),
      },
    }
    const before = structuredClone(response)
    const query = `${operation === 'feature' ? 'Pin' : 'Unpin'} the ${field} account on wisteria.eth`
    const result = parseJevAiResponse(response, query)
    expect(result?.action).toMatchObject({
      intent: 'edit_profile',
      name: 'wisteria.eth',
      field,
      operation,
    })
    if (!result) throw new Error('Expected complete social instruction')
    expect(prepareAiHandoff(result.action)).toEqual({
      status: 'ready',
      action: {
        intent: 'edit_profile',
        name: 'wisteria.eth',
        section: 'contact',
        proposal: { field, operation, value: '' },
      },
    })
    expect(response).toEqual(before)
  })

  it.each([
    { intent: undefined },
    { intent: null },
    { intent: { type: 'noul', noul: 0.99 } },
    { intent: choice('edit_profile', Number.NaN) },
    { intent: choice('edit_profile', Number.POSITIVE_INFINITY) },
    { intent: choice('edit_profile', -0.1) },
    { intent: choice('edit_profile', 1.1) },
    { intent: choice('unsupported', 0.49) },
    { intent: choice('none', 0.49) },
    { intent: choice('view_name', 0.49) },
    { intent: choice('view_name', 0.99) },
    { profile_field: choice('unknown') },
    { profile_field: choice('github', 0.2) },
    { profile_field: undefined },
    { profile_operation: choice('unfeature', Number.NaN) },
    { profile_operation: choice('feature', 0.99) },
    { profile_operation: undefined },
    { fully_supported: { type: 'noul', noul: 0.19 } },
    { unsupported_requirement: { type: 'noul', noul: 0.6 } },
    { request_mode: choice('negated') },
    { request_mode: choice('unclear') },
    { request_mode: choice('requested', 0.64) },
    { action_count: choice('many') },
    { multi_action: { type: 'noul', noul: 0.5 } },
    { profile_value: choice('value_1') },
  ])('does not repair other failed or contradictory gates %#', (override) => {
    expect(
      parseJevAiResponse(
        {
          answers: {
            ...capturedTelegramAnswers,
            ...override,
          },
        },
        'Unpin the Telegram account for wisteria.eth',
      ),
    ).toBeNull()
  })

  // Complete clause coverage now corroborates matching uncertain choices and
  // uses the same capability bounds as other fully understood direct requests.
  it.each([
    { profile_operation: choice('unfeature', 0.64) },
    { fully_supported: { type: 'noul', noul: 0.49 } },
    { unsupported_requirement: { type: 'noul', noul: 0.5 } },
  ])('preserves a fully specified social operation within direct-request bounds %#', (override) => {
    expect(
      parseJevAiResponse(
        { answers: { ...capturedTelegramAnswers, ...override } },
        'Unpin the Telegram account for wisteria.eth',
      )?.action,
    ).toEqual({
      intent: 'edit_profile',
      name: 'wisteria.eth',
      section: 'contact',
      field: 'telegram',
      operation: 'unfeature',
    })
  })

  it.each([
    'Unpin the Telegram account for wisteria.eth and star its GitHub',
    'Unpin the Telegram account for wisteria.eth tomorrow',
    'Unpin the Telegram account for wisteria.eth if gas is cheap',
    'Never unpin the Telegram account for wisteria.eth',
    'Unpin the Telegram account for wisteria.eth and coral.eth',
    'Set the Telegram account for wisteria.eth to new-handle',
    'Open the Telegram account for wisteria.eth',
    'Unpin wisteria.eth',
  ])('never discards a remaining clause to recover weak profile intent: %s', (query) => {
    expect(
      parseJevAiResponse({ answers: capturedTelegramAnswers }, query),
    ).toBeNull()
  })

  it.each([
    {
      query: 'unstar the twiter account for pookie.eth',
      operation: 'unfeature',
      answers: {
        ...capturedAnswers,
        fully_supported: { type: 'noul', noul: 0.91 },
        unsupported_requirement: { type: 'noul', noul: 0.15 },
        next_intent: choice('none', 0.94),
        manager_action: choice('unfavorite', 1),
        manager_constraints: choice('represented', 0.97),
        profile_field: choice('none', 0.47),
        profile_network: choice('none', 0.35),
      },
    },
    {
      query: 'Star the Twitter account on pookie.eth',
      operation: 'feature',
      answers: {
        ...capturedAnswers,
        intent: choice('favorite', 0.93),
        fully_supported: { type: 'noul', noul: 0.75 },
        unsupported_requirement: { type: 'noul', noul: 0.26 },
        next_intent: choice('none', 0.93),
        action_count: choice('one', 0.98),
        manager_action: choice('none', 0.56),
        manager_constraints: choice('unsupported', 0.29),
        profile_field: choice('none', 0.8),
        profile_operation: choice('feature', 0.89),
        profile_network: choice('unknown', 0.14),
      },
    },
  ])('preserves the exact social target when the captured field answer abstains: $query', ({
    query,
    operation,
    answers,
  }) => {
    // Actual first-call evidence from the two rejected browser diagnostics.
    // No raw choice or confidence is rewritten to make the interpretation pass.
    const result = parseJevAiResponse({ answers }, query)
    expect(result?.action).toEqual({
      intent: 'edit_profile',
      name: 'pookie.eth',
      section: 'contact',
      field: 'twitter',
      operation,
    })
    if (!result) throw new Error('Expected the explicit social operation')
    expect(prepareAiHandoff(result.action)).toEqual({
      status: 'ready',
      action: {
        intent: 'edit_profile',
        name: 'pookie.eth',
        section: 'contact',
        proposal: { field: 'twitter', operation, value: '' },
      },
    })
  })

  it('takes the captured typo to the profile review and preserves the social record', async () => {
    const result = parseJevAiResponse(
      { answers: capturedAnswers },
      'unstar the twiter account for bluefern.eth',
    )
    expect(result?.action).toEqual({
      intent: 'edit_profile',
      name: 'bluefern.eth',
      section: 'contact',
      field: 'twitter',
      operation: 'unfeature',
    })
    if (!result) throw new Error('Expected the social operation')
    const prepared = prepareAiHandoff(result.action)
    expect(prepared).toEqual({
      status: 'ready',
      action: {
        intent: 'edit_profile',
        name: 'bluefern.eth',
        section: 'contact',
        proposal: { field: 'twitter', operation: 'unfeature', value: '' },
      },
    })
    if (
      prepared.status !== 'ready' ||
      prepared.action.intent !== 'edit_profile' ||
      !prepared.action.proposal
    )
      throw new Error('Expected a native profile proposal')

    const records = {
      ...newEmptyProfileRecords(),
      base: { 'primary-contact': 'com.twitter' },
      social: [
        { key: 'com.twitter', value: 'keep-twitter-handle' },
        { key: 'com.github', value: 'keep-github-handle' },
      ],
    }
    const draft = applyProfileEditProposal(records, prepared.action.proposal)
    expect(draft.social).toEqual(records.social)
    expect(draft.base['primary-contact']).toBeUndefined()
    expect(records.base['primary-contact']).toBe('com.twitter')

    const context = {
      queryClient: new QueryClient(),
      navigate: vi.fn(async () => undefined),
      favoriteLabels: new Set(['bluefern.eth']),
      addFavorite: vi.fn(),
      openPrimary: vi.fn(),
      openBulkRenew: vi.fn(),
      openProfileEditor: vi.fn(),
      openManagerReview: vi.fn(),
      isCurrent: () => true,
    } satisfies AiHandoffContext
    expect(await openAiAction(prepared.action, context)).toBeNull()
    expect(context.openProfileEditor).toHaveBeenCalledOnce()
    expect(context.openManagerReview).not.toHaveBeenCalled()
    expect(context.addFavorite).not.toHaveBeenCalled()
    expect(context.favoriteLabels).toEqual(new Set(['bluefern.eth']))
  })

  it('keeps the symmetric social-star request out of name favouriting', () => {
    const result = parseJevAiResponse(
      {
        answers: {
          ...capturedAnswers,
          intent: choice('favorite'),
          manager_action: choice('none'),
          profile_operation: choice('feature', 0.95),
        },
      },
      'Star the Twitter account on bluefern.eth',
    )
    expect(result?.action).toMatchObject({
      intent: 'edit_profile',
      field: 'twitter',
      operation: 'feature',
    })
  })

  it.each([
    'bluefern.eth',
    'twiter.eth',
  ])('preserves bare name unfavouriting for %s', (name) => {
    expect(
      parseJevAiResponse({ answers: capturedAnswers }, `Unstar ${name}`)
        ?.action,
    ).toEqual({ intent: 'manager_action', kind: 'unfavorite', name })
  })

  it.each([
    'Unstar the Twitter account on bluefern.eth and favourite it',
    'Unstar the social account on bluefern.eth',
  ])('never discards an unresolved profile operation: %s', (query) => {
    expect(parseJevAiResponse({ answers: capturedAnswers }, query)).toBeNull()
  })

  it('rejects a model field that contradicts the explicitly requested field', () => {
    expect(
      parseJevAiResponse(
        {
          answers: {
            ...capturedAnswers,
            profile_field: choice('github'),
          },
        },
        'Unstar the Twitter account on bluefern.eth',
      ),
    ).toBeNull()
  })
})
