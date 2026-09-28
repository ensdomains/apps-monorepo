import { describe, expect, it } from 'vitest'
import { PROFILE_FIELD_DEFINITIONS } from '@/features/profile/service/profileFieldRegistry'
import { parseJevAiResponse } from './intent'
import { prepareAiHandoff } from './prepareAiHandoff'
import { parseProfileSection } from './profileIntent'
import { buildProfileValueContext } from './profileValueContext'
import { readSocialProfileState } from './socialProfileState'

const choice = (value: string, confidence = 0.99) => ({
  type: 'choice',
  choice: value,
  confidence,
})
const profileAnswers = (field: string, operation = 'set') => ({
  profile_field: choice(field),
  profile_operation: choice(operation),
  profile_network: choice('none'),
  profile_value: choice('none'),
  profile_previous_value: choice('none'),
})

describe('existing social contact states versus literal usernames', () => {
  const stateCases = PROFILE_FIELD_DEFINITIONS.filter(
    ({ storage }) => storage === 'social',
  ).flatMap(({ field }) => [
    {
      field,
      query: `Set the ${field} contact on cinquefoil.eth as featured`,
      operation: 'feature',
    },
    {
      field,
      query: `Make cinquefoil.eth ${field} account unfeatured`,
      operation: 'unfeature',
    },
  ])

  it.each(
    stateCases,
  )('keeps the $field $operation state visible and prepares the native operation', ({
    field,
    query,
    operation,
  }) => {
    expect(readSocialProfileState(query)).toEqual({ field, operation })
    expect(buildProfileValueContext(query)).toMatchObject({
      state: query,
      candidates: [],
    })
    const action = parseProfileSection(
      query,
      'cinquefoil.eth',
      profileAnswers(field),
    )
    expect(action).toEqual({
      intent: 'edit_profile',
      name: 'cinquefoil.eth',
      section: 'contact',
      field,
      operation,
    })
    if (!action) throw new Error('Expected explicit contact state')
    expect(prepareAiHandoff(action)).toEqual({
      status: 'ready',
      action: {
        intent: 'edit_profile',
        name: 'cinquefoil.eth',
        section: 'contact',
        proposal: { field, operation, value: '' },
      },
    })
  })

  it.each([
    ['Set the GitHub contact on cinquefoil.eth as pinned', 'feature'],
    ['Make the GitHub account on cinquefoil.eth as starred', 'feature'],
    ['Make the GitHub contact for cinquefoil.eth not featured', 'unfeature'],
    ['Set the GitHub contact for cinquefoil.eth as unpinned', 'unfeature'],
    ['Set the GitHub contact for cinquefoil.eth as unstarred', 'unfeature'],
  ])('recognizes the exact contact state: %s', (query, operation) => {
    expect(readSocialProfileState(query)).toEqual({
      field: 'github',
      operation,
    })
  })

  it.each([
    'Set cinquefoil.eth GitHub username to featured',
    'Set cinquefoil.eth GitHub to "featured"',
    'Set the GitHub contact on cinquefoil.eth as "featured"',
  ])('preserves featured when explicitly supplied as a literal value: %s', (query) => {
    expect(readSocialProfileState(query)).toBeNull()
    const context = buildProfileValueContext(query)
    expect(context.candidates.map(({ value }) => value)).toEqual(['featured'])
    expect(context.state).not.toContain('featured')
    const action = parseProfileSection(query, 'cinquefoil.eth', {
      ...profileAnswers('github'),
      profile_value: choice('value_1'),
    })
    expect(action).toMatchObject({ field: 'github', value: 'featured' })
    expect(action).not.toHaveProperty('operation')
  })

  it.each([
    'Set the GitHub and Twitter contacts on cinquefoil.eth as featured',
    'Set the GitHub contact on cinquefoil.eth as featured and renew it',
    'Set the GitHub contact on cinquefoil.eth as featured if gas is cheap',
    'Set the GitHub contact on cinquefoil.eth as featured tomorrow',
    'Do not set the GitHub contact on cinquefoil.eth as featured',
    'Set the GitHub contact on cinquefoil.eth and coral.eth as featured',
    'Set github.eth as featured',
    'Set the email contact on cinquefoil.eth as featured',
  ])('cannot prove an unsupported or incomplete state instruction: %s', (query) => {
    expect(readSocialProfileState(query)).toBeNull()
  })

  it('does not overwrite a username with the original captured mistaken value role', () => {
    const answers = {
      ...profileAnswers('github'),
      intent: choice('edit_profile', 1),
      fully_supported: { type: 'noul', noul: 0.96 },
      unsupported_requirement: { type: 'noul', noul: 0.11 },
      request_mode: choice('requested', 1),
      action_count: choice('one', 0.99),
      next_intent: choice('none', 0.99),
      multi_action: { type: 'noul', noul: 0.05 },
      profile_field: choice('github', 0.97),
      profile_operation: choice('set', 0.99),
      profile_network: choice('unknown', 0.47),
      profile_value: choice('value_1', 0.99),
    }
    expect(
      parseJevAiResponse(
        { answers },
        'Set the GitHub contact on cinquefoil.eth as featured',
      ),
    ).toBeNull()
  })

  it.each([
    'unfeature',
    'remove',
    'replace',
    'unsupported',
  ])('rejects an explicitly contrary model operation: %s', (operation) => {
    expect(
      parseProfileSection(
        'Set the GitHub contact on cinquefoil.eth as featured',
        'cinquefoil.eth',
        profileAnswers('github', operation),
      ),
    ).toBeNull()
  })
})
