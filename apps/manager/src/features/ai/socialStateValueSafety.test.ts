import { describe, expect, it } from 'vitest'
import { PROFILE_FIELD_DEFINITIONS } from '@/features/profile/service/profileFieldRegistry'
import {
  hasUnquotedSocialStateRole,
  readCompleteSocialProfileRequest,
} from './completeSocialProfileRequest'
import { buildJevAiRequest, parseJevAiResponse } from './intent'
import { prepareAiHandoff } from './prepareAiHandoff'
import { parseProfileSection } from './profileIntent'
import { buildProfileValueContext } from './profileValueContext'

const choice = (value: string, confidence = 0.99) => ({
  type: 'choice',
  choice: value,
  confidence,
})
const answers = (field = 'reddit', value = 'none') => ({
  intent: choice('edit_profile', 0.95),
  fully_supported: { type: 'noul', noul: 0.9 },
  unsupported_requirement: { type: 'noul', noul: 0.2 },
  request_mode: choice('requested'),
  action_count: choice('one'),
  multi_action: { type: 'noul', noul: 0.05 },
  next_intent: choice('none'),
  profile_field: choice(field, 0.92),
  profile_operation: choice('set', 0.81),
  profile_value: choice(value, 0.94),
  profile_previous_value: choice('none'),
})

describe('social state role cannot become a username assignment', () => {
  const socialFields = PROFILE_FIELD_DEFINITIONS.filter(
    ({ storage }) => storage === 'social',
  )
  it.each(socialFields)('marks $field as featured without assigning a value', ({
    field,
  }) => {
    const query = `Mark the ${field} contact on nightingale.eth as featured`
    expect(readCompleteSocialProfileRequest(query)).toMatchObject({
      field,
      operation: 'feature',
      syntax: 'state',
    })
    expect(buildProfileValueContext(query)).toMatchObject({
      state: query,
      candidates: [],
    })
    const result = parseJevAiResponse({ answers: answers(field) }, query)
    expect(result?.action).toMatchObject({ field, operation: 'feature' })
    if (!result) throw new Error('Expected a native contact-state action')
    expect(prepareAiHandoff(result.action)).toEqual({
      status: 'ready',
      action: {
        intent: 'edit_profile',
        name: 'nightingale.eth',
        section: 'contact',
        proposal: { field, operation: 'feature', value: '' },
      },
    })
  })

  it('rejects the captured obsolete value role instead of replaying the wrong username replacement', () => {
    expect(
      parseJevAiResponse(
        { answers: answers('reddit', 'value_1') },
        'Mark the Reddit contact on nightingale.eth as featured',
      ),
    ).toBeNull()
  })

  it.each([
    'Kindly set the Reddit contact on cypress.eth as featured',
    'Set the Reddit contact on cypress.eth as featured tomorrow',
    'I would like to set the Reddit contact on cypress.eth as pinned',
    'Set the Reddit contact on cypress.eth as featured, not hidden',
    'Set the Reddit contact on cypress.eth as featured without changing the username',
    'Kindly set the Reddit contact on cypress.eth as\tpinned',
    'Kindly set the Reddit contact on cypress.eth as\nnot\tpinned',
    'Set the Reddit contact on cypress.eth as not unfeatured',
  ])('rejects unsupported state context before literal-value extraction: %s', (query) => {
    expect(hasUnquotedSocialStateRole(query)).toBe(true)
    expect(readCompleteSocialProfileRequest(query)).toBeNull()
    for (const role of ['none', 'value_1', 'value_2'])
      expect(
        parseJevAiResponse({ answers: answers('reddit', role) }, query),
      ).toBeNull()
  })

  it('keeps a polite complete state request as an operation, never a literal value', () => {
    const query = 'Set the Reddit contact on cypress.eth as featured please'
    expect(parseJevAiResponse({ answers: answers() }, query)?.action).toEqual({
      intent: 'edit_profile',
      name: 'cypress.eth',
      section: 'contact',
      field: 'reddit',
      operation: 'feature',
    })
    expect(
      parseJevAiResponse({ answers: answers('reddit', 'value_1') }, query),
    ).toBeNull()
  })

  it.each([
    'featured',
    'pinned',
    'starred',
    'unfeatured',
    'unpinned',
    'unstarred',
    'not featured',
    'not pinned',
    'not starred',
  ])('never treats unsupported as-%s context as a value', (state) => {
    const query = `Kindly mark the Reddit contact on cypress.eth as ${state}`
    expect(hasUnquotedSocialStateRole(query)).toBe(true)
    expect(
      parseProfileSection(query, 'cypress.eth', answers('reddit', 'value_1')),
    ).toBeNull()
  })

  it.each([
    'Set the Reddit username on cypress.eth to featured',
    'Set the Reddit username on cypress.eth as featured',
    'Set the Reddit handle on cypress.eth as featured',
    'Set the Reddit contact on cypress.eth as "featured"',
    'Set the Reddit contact on cypress.eth to "featured"',
  ])('preserves an explicitly supplied literal value: %s', (query) => {
    expect(hasUnquotedSocialStateRole(query)).toBe(false)
    expect(
      buildProfileValueContext(query).candidates.map(({ value }) => value),
    ).toEqual(['featured'])
    expect(
      parseProfileSection(query, 'cypress.eth', answers('reddit', 'value_1')),
    ).toMatchObject({ field: 'reddit', value: 'featured' })
  })

  it('keeps private values masked in mixed state and record assignments', () => {
    const query =
      'Mark Reddit contact on pookie.eth as featured and set Github to secret-user-72'
    expect(hasUnquotedSocialStateRole(query)).toBe(true)
    const context = buildProfileValueContext(query)
    expect(context.candidates.map(({ value }) => value)).toEqual([
      'secret-user-72',
    ])
    const request = JSON.stringify(buildJevAiRequest(query))
    expect(request).not.toContain('secret-user-72')
    expect(request).not.toContain('pookie.eth')
    expect(
      parseJevAiResponse({ answers: answers('reddit', 'value_1') }, query),
    ).toBeNull()
  })
})
