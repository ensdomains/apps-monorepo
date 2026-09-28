import { describe, expect, it } from 'vitest'
import { applyProfileEditProposal } from '@/features/profile/service/profileEditProposal'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import { parseJevAiResponse } from './intent'
import { prepareAiHandoff } from './prepareAiHandoff'
import { buildProfileValueContext } from './profileValueContext'

const choice = (value: string, confidence = 0.99) => ({
  type: 'choice',
  choice: value,
  confidence,
})

// Relevant choices captured from the independent development failure. An
// uncertain operation must neither veto exact instruction syntax nor become
// an unrelated generic editor action.
const response = (overrides: Record<string, unknown> = {}) => ({
  answers: {
    intent: choice('edit_profile', 0.83),
    next_intent: choice('none', 0.87),
    fully_supported: { type: 'noul', noul: 0.82 },
    unsupported_requirement: { type: 'noul', noul: 0.19 },
    multi_action: { type: 'noul', noul: 0.09 },
    request_mode: choice('requested', 0.93),
    action_count: choice('one', 0.95),
    profile_field: choice('github', 0.85),
    profile_operation: choice('set', 0.29),
    profile_value: choice('none', 1),
    profile_previous_value: choice('none', 1),
    ...overrides,
  },
})

describe('profile operation and editor-opening distinction', () => {
  it('preserves a mistyped unpin through interpretation, preparation, and editor draft', () => {
    const query = 'Unpn the githb contact on larch.eth'
    const interpreted = parseJevAiResponse(response(), query)
    expect(interpreted?.action).toEqual({
      intent: 'edit_profile',
      name: 'larch.eth',
      section: 'contact',
      field: 'github',
      operation: 'unfeature',
    })
    if (!interpreted) throw new Error('Expected an exact unpin action')
    const prepared = prepareAiHandoff(interpreted.action)
    expect(prepared).toEqual({
      status: 'ready',
      action: {
        intent: 'edit_profile',
        name: 'larch.eth',
        section: 'contact',
        proposal: { field: 'github', operation: 'unfeature', value: '' },
      },
    })
    if (
      prepared.status !== 'ready' ||
      prepared.action.intent !== 'edit_profile' ||
      !prepared.action.proposal
    )
      throw new Error('Expected an editor proposal')
    const records = {
      ...newEmptyProfileRecords(),
      base: { 'primary-contact': 'com.github' },
      social: [{ key: 'com.github', value: 'larch-dev' }],
    }
    const draft = applyProfileEditProposal(records, prepared.action.proposal)
    expect(draft.base['primary-contact']).toBeUndefined()
    expect(draft.social).toEqual(records.social)
  })

  it.each([
    'Show me the address editor for coral.eth',
    'Show me the addresses editor for coral.eth',
  ])('preserves the requested address editor when no record field is requested: %s', (query) => {
    const result = parseJevAiResponse(
      response({
        profile_field: choice('none', 0.37),
        profile_operation: choice('open', 0.95),
      }),
      query,
    )
    expect(result?.action).toEqual({
      intent: 'edit_profile',
      name: 'coral.eth',
      section: 'addresses',
    })
    if (!result) throw new Error('Expected address-editor navigation')
    expect(prepareAiHandoff(result.action)).toEqual({
      status: 'ready',
      action: result.action,
    })
  })

  it.each([
    'Open the contact tab on larch.eth',
    'Please edit social records for larch.eth',
    'Open the GitHub editor for larch.eth',
  ])('preserves a complete editor-opening request: %s', (query) => {
    const result = parseJevAiResponse(
      response({
        profile_field: choice('none'),
        profile_operation: choice('open'),
      }),
      query,
    )
    expect(result?.action).toEqual({
      intent: 'edit_profile',
      name: 'larch.eth',
      section: 'contact',
    })
    if (!result) throw new Error('Expected explicit editor navigation')
    expect(prepareAiHandoff(result.action)).toEqual({
      status: 'ready',
      action: result.action,
    })
  })

  it.each([
    'Unppin the githb contact on larch.eth',
    'Toggle the GitHub contact on larch.eth',
    'Open the contact tab on larch.eth and unppin GitHub',
    'Show me the address editor for coral.eth and unppin GitHub',
    'Show me the address editor for coral.eth if gas is cheap',
    'Never unpn the githb contact on larch.eth',
    "Don't unpn the githb contact on larch.eth",
    'Unpn the githb contact on larch.eth and pin GitHub',
    'Unpn the githb contact on larch.eth then unpn GitHub',
    'Unpn the githb contact on larch.eth if I own it',
  ])('does not drop an unresolved, negative, or additional operation: %s', (query) => {
    expect(parseJevAiResponse(response(), query)).toBeNull()
  })

  it('rejects a confident contrary operation instead of correcting the model answer', () => {
    expect(
      parseJevAiResponse(
        response({ profile_operation: choice('feature') }),
        'Unpn the githb contact on larch.eth',
      ),
    ).toBeNull()
  })

  it('keeps unpn exact when supplied as a username or quoted description', () => {
    for (const [field, query, value] of [
      ['github', 'Set larch.eth GitHub to unpn', 'unpn'],
      [
        'description',
        'Set larch.eth description to "Unpn the githb contact"',
        'Unpn the githb contact',
      ],
    ] as const) {
      const result = parseJevAiResponse(
        response({
          profile_field: choice(field),
          profile_operation: choice('set'),
        }),
        query,
      )
      expect(result?.action).toMatchObject({ field, value })
      expect(buildProfileValueContext(query).state).not.toContain(value)
    }
  })
})
