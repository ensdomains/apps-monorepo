import { describe, expect, it } from 'vitest'
import { PROFILE_FIELD_DEFINITIONS } from '@/features/profile/service/profileFieldRegistry'
import { readCompleteSocialProfileRequest } from './completeSocialProfileRequest'
import { buildJevAiRequest, parseJevAiResponse } from './intent'
import { prepareAiHandoff } from './prepareAiHandoff'
import { parseProfileSection } from './profileIntent'
import { buildProfileValueContext } from './profileValueContext'

const choice = (value: string, confidence = 0.99) => ({
  type: 'choice',
  choice: value,
  confidence,
})
const answers = (field: string, operation: string) => ({
  intent: choice('edit_profile'),
  fully_supported: { type: 'noul', noul: 0.99 },
  unsupported_requirement: { type: 'noul', noul: 0.01 },
  request_mode: choice('requested'),
  action_count: choice('one'),
  multi_action: { type: 'noul', noul: 0.01 },
  next_intent: choice('none'),
  profile_field: choice(field),
  profile_operation: choice(operation),
  profile_value: choice('none'),
  profile_previous_value: choice('none'),
})

const socialFields = PROFILE_FIELD_DEFINITIONS.filter(
  ({ storage }) => storage === 'social',
)
const compositions = socialFields.flatMap(({ field }) => [
  {
    field,
    query: `For brook.eth, unpin its ${field} contact`,
    operation: 'unfeature',
    syntax: 'verb',
  },
  {
    field,
    query: `Put a star on the ${field} contact for brook.eth`,
    operation: 'feature',
    syntax: 'verb',
  },
  {
    field,
    query: `Take the star off ${field} on brook.eth`,
    operation: 'unfeature',
    syntax: 'pin_removal',
  },
  {
    field,
    query: `Unfeature the ${field} contact in brook.eth's profile`,
    operation: 'unfeature',
    syntax: 'verb',
  },
])

describe('compositional social resources and state operations', () => {
  it.each(
    compositions,
  )('keeps the $field $operation instruction intact: $query', ({
    field,
    query,
    operation,
    syntax,
  }) => {
    expect(readCompleteSocialProfileRequest(query)).toEqual({
      field,
      fieldRequested: false,
      operation,
      syntax,
    })
    expect(buildProfileValueContext(query)).toMatchObject({
      state: query,
      candidates: [],
    })
    const result = parseJevAiResponse(
      { answers: answers(field, operation) },
      query,
    )
    expect(result?.action).toEqual({
      intent: 'edit_profile',
      name: 'brook.eth',
      section: 'contact',
      field,
      operation,
    })
    if (!result) throw new Error('Expected one complete social action')
    expect(prepareAiHandoff(result.action)).toEqual({
      status: 'ready',
      action: {
        intent: 'edit_profile',
        name: 'brook.eth',
        section: 'contact',
        proposal: { field, operation, value: '' },
      },
    })
  })

  it.each(
    socialFields,
  )('composes a fronted target with a $field pin operation', ({ field }) => {
    for (const [phrase, operation] of [
      ['put a pin on', 'feature'],
      ['take the pin off', 'unfeature'],
      ['remove the star from', 'unfeature'],
      ['remove', 'remove'],
    ] as const) {
      const query = `On brook.eth, could you please ${phrase} its ${field} contact?`
      expect(
        parseProfileSection(query, 'brook.eth', answers(field, operation)),
      ).toMatchObject({ name: 'brook.eth', field, operation })
    }
  })

  it.each([
    ['For brook.eth, pin a contact', 'feature'],
    ["Unpin a social contact in brook.eth's profile", 'unfeature'],
    ['On brook.eth, take the star off its contact', 'unfeature'],
    ['Put a pin on a social account for brook.eth', 'feature'],
  ])('asks only for the missing field while retaining %s', (query, operation) => {
    const action = parseProfileSection(
      query,
      'brook.eth',
      answers('none', operation),
    )
    expect(action).toEqual({
      intent: 'edit_profile',
      name: 'brook.eth',
      section: 'contact',
      fieldRequested: true,
      operation,
    })
    if (!action) throw new Error('Expected a field clarification')
    expect(prepareAiHandoff(action)).toMatchObject({
      status: 'needs_input',
      field: 'profileField',
    })
  })

  it('asks for a missing name without dropping the field or state', () => {
    const query = 'Take the star off Telegram'
    const action = parseProfileSection(
      query,
      undefined,
      answers('telegram', 'unfeature'),
    )
    expect(action).toEqual({
      intent: 'edit_profile',
      section: 'contact',
      field: 'telegram',
      operation: 'unfeature',
    })
    if (!action) throw new Error('Expected a name clarification')
    expect(prepareAiHandoff(action)).toMatchObject({
      status: 'needs_input',
      field: 'name',
    })
  })

  it.each(
    socialFields,
  )('retains the $field unfeature operation through terminal politeness and missing name', ({
    field,
  }) => {
    for (const suffix of [', please', ' pls.', ',plz?']) {
      const query = `Unfeature the ${field === 'instagram' ? 'Instagram' : field} account${suffix}`
      const result = parseJevAiResponse(
        {
          answers: {
            ...answers(field, 'unfeature'),
            intent: choice('edit_profile', 0.47),
            profile_field: choice('none', 0.48),
            profile_operation: choice('unfeature', 0.98),
            fully_supported: { type: 'noul', noul: 0.61 },
            unsupported_requirement: { type: 'noul', noul: 0.38 },
          },
        },
        query,
      )
      expect(result?.action).toEqual({
        intent: 'edit_profile',
        section: 'contact',
        field,
        operation: 'unfeature',
      })
      if (!result)
        throw new Error(
          'Expected the exact operation before name clarification',
        )
      expect(prepareAiHandoff(result.action)).toMatchObject({
        status: 'needs_input',
        field: 'name',
      })
    }
  })

  it.each([
    'Unfeature the Instagram account, please if it exists',
    'Unfeature the Instagram account tomorrow, please',
    'Unfeature the Instagram account and star Reddit, please',
    'Do not unfeature the Instagram account, please',
  ])('keeps substantive trailing or negative clauses: %s', (query) => {
    expect(readCompleteSocialProfileRequest(query)).toBeNull()
    expect(
      parseJevAiResponse({ answers: answers('instagram', 'unfeature') }, query),
    ).toBeNull()
  })

  it.each([
    'please',
    '"please"',
    '"unpin Reddit, please"',
  ])('preserves the explicit literal username %s', (literal) => {
    const query = `Set the Discord username for brook.eth to ${literal}`
    const expected = literal.replace(/^"|"$/g, '')
    expect(readCompleteSocialProfileRequest(query)).toBeNull()
    expect(
      buildProfileValueContext(query).candidates.map(({ value }) => value),
    ).toEqual([expected])
    expect(
      parseProfileSection(query, 'brook.eth', {
        ...answers('discord', 'set'),
        profile_value: choice('value_1'),
      }),
    ).toMatchObject({ field: 'discord', value: expected })
  })

  it.each([
    'telegarm.eth',
    'discord.eth',
    'café.eth',
    '😎.eth',
  ])('preserves the exact target %s before instruction aliases', (name) => {
    const query = `For ${name}, unstar its Telegarm contact`
    const result = parseJevAiResponse(
      { answers: answers('telegram', 'unfeature') },
      query,
    )
    expect(result?.action).toMatchObject({
      name,
      field: 'telegram',
      operation: 'unfeature',
    })
    expect(JSON.stringify(buildJevAiRequest(query))).not.toContain(name)
  })

  it.each([
    'For brook.eth, unpin its Discord contact on river.eth',
    'On brook.eth, unpin river.eth Discord contact',
    'For brook.eth, unpin its Discord and Reddit contacts',
    'For brook.eth, do not unpin its Discord contact',
    'For brook.eth, unpin its Discord contact unless it is featured',
    'For brook.eth, unpin its Discord contact and favourite brook.eth',
    'Put a star on Discord for brook.eth tomorrow',
    'Take the star off Discord on brook.eth if it exists',
    'Put a star on Discord for brook.eth but keep it unfeatured',
    'Take the star off Discord on brook.eth and remove it',
    "Unfeature Discord in brook.eth's profile except its old account",
    'For "brook.eth", unpin its Discord contact',
    'For https://brook.eth, unpin its Discord contact',
  ])('does not ignore an extra constraint or invalid target: %s', (query) => {
    expect(readCompleteSocialProfileRequest(query)).toBeNull()
    for (const operation of ['feature', 'unfeature', 'set', 'remove'])
      expect(
        parseJevAiResponse({ answers: answers('discord', operation) }, query),
      ).toBeNull()
  })

  it('does not let an optimistic assignment disguise an incomplete marker operation', () => {
    const query =
      'I would like to put a star on the Discord contact for brook.eth tomorrow'
    const context = buildProfileValueContext(query)
    for (const value of ['none', ...context.candidates.map(({ id }) => id)])
      expect(
        parseProfileSection(query, 'brook.eth', {
          ...answers('discord', 'set'),
          profile_value: choice(value),
        }),
      ).toBeNull()
  })

  it('masks an additional exact assignment even when the combined request is rejected', () => {
    const query =
      'Put a star on Discord for brook.eth and set Telegarm username to private-telegarm-72'
    const body = JSON.stringify(buildJevAiRequest(query))
    expect(body).not.toContain('private-telegarm-72')
    expect(body).not.toContain('brook.eth')
    expect(
      parseJevAiResponse({ answers: answers('discord', 'feature') }, query),
    ).toBeNull()
  })

  it('never corrects a literal handle that resembles the instruction alias', () => {
    const query = 'Set the Telegram username for brook.eth to telegarm'
    const context = buildProfileValueContext(query)
    expect(context.candidates.map(({ value }) => value)).toEqual(['telegarm'])
    expect(
      parseProfileSection(query, 'brook.eth', {
        ...answers('telegram', 'set'),
        profile_value: choice('value_1'),
      }),
    ).toMatchObject({ field: 'telegram', value: 'telegarm' })
  })
})
