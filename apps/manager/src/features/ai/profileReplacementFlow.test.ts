import { describe, expect, it } from 'vitest'
import { checkProfileEditProposal } from '@/features/profile/service/profileRecordProposal'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import { parseJevAiResponse } from './intent'
import { prepareAiHandoff } from './prepareAiHandoff'
import { prepareProfileAiDetails } from './profileAiPreparation'
import { parseProfileSection } from './profileIntent'
import { buildProfileValueContext } from './profileValueContext'

const choice = (choice: string, confidence = 0.99) => ({
  type: 'choice',
  choice,
  confidence,
})
const response = (details: Record<string, unknown>) => ({
  answers: {
    fully_supported: { type: 'noul', noul: 0.99 },
    unsupported_requirement: { type: 'noul', noul: 0.01 },
    multi_action: { type: 'noul', noul: 0.01 },
    intent: choice('edit_profile'),
    next_intent: choice('none'),
    ...details,
  },
})

describe('exact profile replacement wording', () => {
  it('keeps a leading target and field visible while extracting old and new handles', () => {
    const query = 'Replace birch.eth GitHub handle birch-old with birch-new'
    expect(buildProfileValueContext(query).state).toBe(
      'Replace birch.eth GitHub handle [PROFILE_VALUE_1] with [PROFILE_VALUE_2]',
    )
    const result = parseJevAiResponse(
      response({
        profile_field: choice('unknown', 0.96),
        profile_operation: choice('replace'),
        profile_value: choice('value_2'),
        profile_previous_value: choice('value_1'),
      }),
      query,
    )
    expect(result?.action).toEqual({
      intent: 'edit_profile',
      name: 'birch.eth',
      field: 'github',
      section: 'contact',
      value: 'birch-new',
      expectedValue: 'birch-old',
    })
    if (!result) throw new Error('Expected replacement action')
    expect(prepareAiHandoff(result.action)).toMatchObject({
      status: 'ready',
      action: { proposal: { value: 'birch-new', expectedValue: 'birch-old' } },
    })
  })

  it.each([
    'For moss.eth replace link "Studio" URL https://example.org/first with https://example.org/second',
    'Change moss.eth link "Studio" from https://example.org/first to https://example.org/second',
  ])('preserves the exact current URL condition in %s', (query) => {
    const action = parseProfileSection(query, 'moss.eth', {
      profile_field: choice('link', 0.37),
      profile_operation: choice('replace'),
      profile_value: choice('value_3'),
      profile_previous_value: choice('none', 0.25),
    })
    expect(action).toMatchObject({
      field: 'link',
      linkTarget: 'Studio',
      linkName: 'Studio',
      value: 'https://example.org/second',
      expectedValue: 'https://example.org/first',
    })
    if (!action) throw new Error('Expected named link replacement')
    const prepared = prepareProfileAiDetails(action)
    if (prepared.status !== 'ready' || !prepared.proposal)
      throw new Error('Expected prepared link replacement')
    const records = {
      ...newEmptyProfileRecords(),
      links: [{ name: 'Studio', url: 'https://example.org/other' }],
    }
    expect(checkProfileEditProposal(records, prepared.proposal)).not.toBeNull()
    expect(
      checkProfileEditProposal(
        {
          ...records,
          links: [{ name: 'Studio', url: 'https://example.org/first' }],
        },
        prepared.proposal,
      ),
    ).toBeNull()
  })

  it('asks for the missing target while retaining an explicit GitHub link destination', () => {
    const result = parseJevAiResponse(
      response({
        profile_field: choice('github', 0.87),
        profile_operation: choice('set'),
        profile_value: choice('value_1'),
        profile_previous_value: choice('none'),
      }),
      'Add a GitHub link for my profile using https://github.com/cedar-labs',
    )
    expect(result?.action).toMatchObject({
      intent: 'edit_profile',
      section: 'links',
      linkRequested: true,
      linkService: 'github',
      value: 'https://github.com/cedar-labs',
    })
    if (!result) throw new Error('Expected missing-name link action')
    expect(prepareAiHandoff(result.action)).toMatchObject({
      status: 'needs_input',
      field: 'name',
    })
  })

  it('recognizes pinning a supported contact despite a misspelled field label', () => {
    expect(
      parseProfileSection('pin githb on cedar.eth', 'cedar.eth', {
        profile_field: choice('github', 0.88),
        profile_operation: choice('feature', 0.63),
      }),
    ).toEqual({
      intent: 'edit_profile',
      name: 'cedar.eth',
      field: 'github',
      section: 'contact',
      operation: 'feature',
    })
  })

  it.each([
    'Replace birch.eth GitHub handle birch-old with birch-new and change email to other@example.com',
    'Replace birch.eth GitHub handle birch-old with birch-new and notify Alice',
    'Do not replace birch.eth GitHub handle birch-old with birch-new',
    'For moss.eth replace link "Studio" URL https://example.org/first with https://example.org/second and share with Alice',
  ])('does not lose extra instructions or negation: %s', (query) => {
    expect(parseJevAiResponse(response({}), query)).toBeNull()
  })
})
