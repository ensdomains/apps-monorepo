import { describe, expect, it } from 'vitest'
import { PROFILE_FIELD_DEFINITIONS } from '@/features/profile/service/profileFieldRegistry'
import { readCompleteSocialProfileRequest } from './completeSocialProfileRequest'
import { prepareAiHandoff } from './prepareAiHandoff'
import {
  hasExplicitSocialProfileOperation,
  parseProfileSection,
} from './profileIntent'
import { buildProfileValueContext } from './profileValueContext'

const choice = (value: string, confidence = 0.99) => ({
  type: 'choice',
  choice: value,
  confidence,
})
const answers = (field: string, operation: string, confidence = 0.99) => ({
  profile_field: choice(field),
  profile_operation: choice(operation, confidence),
  profile_value: choice('none'),
  profile_previous_value: choice('none'),
})

describe('complete social operation structure and missing information', () => {
  const registryCases = PROFILE_FIELD_DEFINITIONS.filter(
    ({ storage }) => storage === 'social',
  ).flatMap(({ field }) => [
    {
      field,
      query: `Could you please remove the pin from the ${field} contact on cinquefoil.eth?`,
      operation: 'unfeature',
      rawOperation: 'remove',
      syntax: 'pin_removal',
    },
    {
      field,
      query: `Can you feature cinquefoil.eth's ${field} account?`,
      operation: 'feature',
      rawOperation: 'feature',
      syntax: 'verb',
    },
    {
      field,
      query: `Would you remove the ${field} record from cinquefoil.eth?`,
      operation: 'remove',
      rawOperation: 'remove',
      syntax: 'verb',
    },
  ])

  it.each(
    registryCases,
  )('separates $field $operation from record deletion: $query', ({
    field,
    query,
    operation,
    rawOperation,
    syntax,
  }) => {
    expect(readCompleteSocialProfileRequest(query)).toEqual({
      field,
      fieldRequested: false,
      operation,
      syntax,
    })
    const context = buildProfileValueContext(query)
    expect(context.state).toBe(query)
    expect(context.candidates).toEqual([])
    const action = parseProfileSection(
      query,
      'cinquefoil.eth',
      answers(field, rawOperation),
    )
    expect(action).toEqual({
      intent: 'edit_profile',
      name: 'cinquefoil.eth',
      section: 'contact',
      field,
      operation,
    })
    if (!action) throw new Error('Expected one exact social operation')
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
    [
      "Unpin feverfew.eth's Discord contact",
      'feverfew.eth',
      'discord',
      'unfeature',
    ],
    [
      'Star the instgram contact on hellebore.eth',
      'hellebore.eth',
      'instagram',
      'feature',
    ],
    [
      'Remove the pin from the Reddit contact on cinquefoil.eth',
      'cinquefoil.eth',
      'reddit',
      'unfeature',
    ],
  ])('preserves the requested resource and direction for %s', (query, name, field, operation) => {
    expect(parseProfileSection(query, name, answers(field, operation))).toEqual(
      { intent: 'edit_profile', name, section: 'contact', field, operation },
    )
  })

  it.each([
    'none',
    'unknown',
  ])('asks for the missing field while retaining the requested feature operation: %s', (rawField) => {
    const query = 'Please feature a contact on cinquefoil.eth'
    expect(readCompleteSocialProfileRequest(query)).toEqual({
      fieldRequested: true,
      operation: 'feature',
      syntax: 'verb',
    })
    const action = parseProfileSection(
      query,
      'cinquefoil.eth',
      answers(rawField, 'feature'),
    )
    expect(action).toEqual({
      intent: 'edit_profile',
      name: 'cinquefoil.eth',
      section: 'contact',
      fieldRequested: true,
      operation: 'feature',
    })
    if (!action) throw new Error('Expected social field clarification')
    expect(prepareAiHandoff(action)).toMatchObject({
      status: 'needs_input',
      field: 'profileField',
    })
    expect(prepareAiHandoff(action, { profileField: 'reddit' })).toEqual({
      status: 'ready',
      action: {
        intent: 'edit_profile',
        name: 'cinquefoil.eth',
        section: 'contact',
        proposal: { field: 'reddit', operation: 'feature', value: '' },
      },
    })
  })

  it('asks for a missing name without losing the chosen social field or operation', () => {
    const action = parseProfileSection(
      'Could you unpin the Reddit contact?',
      undefined,
      answers('reddit', 'unfeature'),
    )
    expect(action).toEqual({
      intent: 'edit_profile',
      section: 'contact',
      field: 'reddit',
      operation: 'unfeature',
    })
    if (!action) throw new Error('Expected name clarification')
    expect(prepareAiHandoff(action)).toMatchObject({
      status: 'needs_input',
      field: 'name',
    })
  })

  it.each([
    0.2, 0.99,
  ])('never supplies a guessed missing field at confidence %s', (confidence) => {
    expect(
      parseProfileSection(
        'Please feature a contact on cinquefoil.eth',
        'cinquefoil.eth',
        {
          ...answers('github', 'feature'),
          profile_field: choice('github', confidence),
        },
      ),
    ).toBeNull()
  })

  it.each([
    'Remove the pin from Reddit on cinquefoil.eth tomorrow',
    'Unpin cinquefoil.eth Reddit next Friday',
    'Star the Reddit contact on cinquefoil.eth if gas is cheap',
    'Star the Reddit contact on cinquefoil.eth unless it is already starred',
    'Do not star the Reddit contact on cinquefoil.eth',
    'Could you never unpin the Reddit contact on cinquefoil.eth?',
    'Unpin the Reddit and Discord contacts on cinquefoil.eth',
    'Unpin the Reddit contact on cinquefoil.eth and feverfew.eth',
    'Unpin the Reddit contact on cinquefoil.eth and favourite it',
    'Unpin the Reddit contact on cinquefoil.eth but keep it featured',
  ])('does not drop an extra or negative clause: %s', (query) => {
    expect(readCompleteSocialProfileRequest(query)).toBeNull()
    expect(
      parseProfileSection(
        query,
        'cinquefoil.eth',
        answers('reddit', 'unfeature'),
      ),
    ).toBeNull()
  })

  it('distinguishes an uncertain generic edit from explicit opposite direction', () => {
    const query = 'Unpin the Reddit contact on cinquefoil.eth'
    expect(
      parseProfileSection(
        query,
        'cinquefoil.eth',
        answers('reddit', 'set', 0.29),
      ),
    ).toMatchObject({ operation: 'unfeature' })
    for (const operation of ['feature', 'remove'])
      expect(
        parseProfileSection(
          query,
          'cinquefoil.eth',
          answers('reddit', operation, 0.29),
        ),
      ).toBeNull()
    expect(
      hasExplicitSocialProfileOperation(
        query,
        'cinquefoil.eth',
        answers('reddit', 'unfeature', 0.29),
      ),
    ).toBe(false)
  })

  it('does not correct literal target or username spellings', () => {
    expect(readCompleteSocialProfileRequest('Star instgram.eth')).toBeNull()
    for (const query of [
      'Set cinquefoil.eth Instagram to instgram',
      'Use private-handle for instgram on cinquefoil.eth',
    ]) {
      const context = buildProfileValueContext(query)
      const expected = query.startsWith('Set') ? 'instgram' : 'private-handle'
      expect(context.candidates.map(({ value }) => value)).toEqual([expected])
      expect(context.state).not.toContain(expected)
      expect(context.targetQuery).toContain('cinquefoil.eth')
    }
    const query = 'Set cinquefoil.eth Instagram to "instgram"'
    expect(
      parseProfileSection(query, 'cinquefoil.eth', {
        ...answers('instagram', 'set'),
        profile_value: choice('value_1'),
      }),
    ).toMatchObject({ field: 'instagram', value: 'instgram' })
  })

  it.each([
    '😎.eth',
    'café.eth',
  ])('keeps the exact Unicode target while proving the contact operation: %s', (name) => {
    const query = `Could you remove the pin from the Instagram contact on ${name}?`
    expect(readCompleteSocialProfileRequest(query)).toEqual({
      field: 'instagram',
      fieldRequested: false,
      operation: 'unfeature',
      syntax: 'pin_removal',
    })
    expect(buildProfileValueContext(query)).toMatchObject({
      state: query,
      candidates: [],
    })
    expect(
      parseProfileSection(query, name, answers('instagram', 'unfeature')),
    ).toEqual({
      intent: 'edit_profile',
      name,
      section: 'contact',
      field: 'instagram',
      operation: 'unfeature',
    })
  })

  it.each([
    'Star the Instagram contact on "😎.eth"',
    'Star the Instagram contact on https://example.org',
    'Star the Instagram contact on invalid..eth',
    'Set the Instagram username on 😎.eth to "featured"',
  ])('never treats a quoted or invalid value as target proof: %s', (query) => {
    expect(readCompleteSocialProfileRequest(query)).toBeNull()
  })
})
