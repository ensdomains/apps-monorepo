import { describe, expect, it } from 'vitest'
import { PROFILE_FIELD_DEFINITIONS } from '@/features/profile/service/profileFieldRegistry'
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

const answers = (field = 'twitter', operation = 'unfeature') => ({
  profile_field: choice(field, 0.43),
  profile_operation: choice(operation, 0.95),
  profile_value: choice('none'),
  profile_previous_value: choice('none'),
})

describe('complete social record operation proof', () => {
  const socialCases = PROFILE_FIELD_DEFINITIONS.filter(
    ({ storage }) => storage === 'social',
  ).flatMap(({ field }) =>
    (['feature', 'unfeature'] as const).flatMap((operation) =>
      [0.47, 0.8].map((confidence) => ({ field, operation, confidence })),
    ),
  )

  it.each(
    socialCases,
  )('uses exact $field $operation syntax when the raw field abstains at $confidence', ({
    field,
    operation,
    confidence,
  }) => {
    const query = `${operation === 'feature' ? 'Star' : 'Unstar'} the ${field} account on bluefern.eth`
    const raw = {
      ...answers(field, operation),
      profile_field: choice('none', confidence),
    }
    expect(hasExplicitSocialProfileOperation(query, 'bluefern.eth', raw)).toBe(
      true,
    )
    expect(parseProfileSection(query, 'bluefern.eth', raw)).toMatchObject({
      field,
      operation,
      section: 'contact',
      name: 'bluefern.eth',
    })
  })

  it.each([
    ['unstar the twiter account for bluefern.eth', 'unfeature'],
    ['Unpin bluefern.eth Twitter contact', 'unfeature'],
    ['Please star the Twitter account on bluefern.eth.', 'feature'],
    ['Pin Twitter for bluefern.eth', 'feature'],
    ['Remove the Twitter record from bluefern.eth', 'remove'],
  ])('preserves the exact social resource with matching raw choices: %s', (query, operation) => {
    const raw = answers('twitter', operation)
    expect(hasExplicitSocialProfileOperation(query, 'bluefern.eth', raw)).toBe(
      true,
    )
    expect(parseProfileSection(query, 'bluefern.eth', raw)).toMatchObject({
      name: 'bluefern.eth',
      section: 'contact',
      field: 'twitter',
      operation,
    })
  })

  it.each([
    'Star bluefern.eth',
    'Unstar twiter.eth',
    'Unstar the unknown account on bluefern.eth',
    'Unstar the Twitter account for bluefern.eth and renew it',
    'Unstar the Twitter account for bluefern.eth but keep it pinned',
    'Unstar the Twitter account for bluefern.eth if gas is cheap',
    'Unstar the Twitter account for bluefern.eth next Friday',
    'Do not unstar the Twitter account for bluefern.eth',
    'Never unstar the Twitter account for bluefern.eth',
    'Unstar the Twitter account for bluefern.eth and coral.eth',
    'Unstar the Twitter and GitHub accounts for bluefern.eth',
    'Remove the Twitter record old-handle from bluefern.eth',
    'Unstar the Twitter account "other-handle" for bluefern.eth',
  ])('cannot prove a different, conditional, or incomplete operation: %s', (query) => {
    for (const field of [
      choice('twitter', 0.43),
      choice('none', 0.47),
      choice('none', 0.8),
    ])
      expect(
        hasExplicitSocialProfileOperation(query, 'bluefern.eth', {
          ...answers(),
          profile_field: field,
        }),
      ).toBe(false)
  })

  it('requires the real raw field and operation to agree without raising their confidence', () => {
    const query = 'Unstar the twiter account for bluefern.eth'
    for (const override of [
      { profile_field: choice('github', 0.2) },
      { profile_field: choice('unknown', 0.99) },
      { profile_field: choice('twitter', Number.NaN) },
      { profile_field: choice('none', Number.NaN) },
      { profile_field: choice('none', -0.1) },
      { profile_field: choice('none', 1.1) },
      { profile_field: { type: 'noul', noul: 1 } },
      { profile_field: undefined },
      { profile_operation: choice('feature') },
      { profile_operation: choice('unfeature', 0.2) },
      { profile_operation: choice('unfeature', 1.1) },
    ]) {
      expect(
        hasExplicitSocialProfileOperation(query, 'bluefern.eth', {
          ...answers(),
          ...override,
        }),
      ).toBe(false)
    }
  })

  it('keeps exact values private when instruction spelling matches a social alias', () => {
    for (const query of [
      'Set bluefern.eth twiter to private-handle',
      'Use private-handle for twiter on bluefern.eth',
    ]) {
      const context = buildProfileValueContext(query)
      expect(context.candidates.map(({ value }) => value)).toEqual([
        'private-handle',
      ])
      expect(context.state).not.toContain('private-handle')
      expect(context.targetQuery).toContain('bluefern.eth')
    }
    const query = 'Set bluefern.eth Twitter to twiter'
    const context = buildProfileValueContext(query)
    expect(context.candidates.map(({ value }) => value)).toEqual(['twiter'])
    expect(
      parseProfileSection(query, 'bluefern.eth', {
        ...answers('twitter', 'set'),
        profile_field: choice('twitter'),
        profile_value: choice('value_1'),
      }),
    ).toMatchObject({ field: 'twitter', value: 'twiter' })
  })
})
