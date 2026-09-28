import { describe, expect, it } from 'vitest'
import { applyProfileEditProposal } from '@/features/profile/service/profileEditProposal'
import {
  checkProfileEditProposal,
  getProfileEditProposalCurrentValue,
} from '@/features/profile/service/profileRecordProposal'
import type { ProfileRecords } from '@/features/profile/types'
import { createDiff } from '@/features/profile/utils/createDiff'
import {
  newEmptyProfileRecords,
  transformToServiceFormat,
} from '@/features/profile/utils/transformRecords'
import { parseJevAiResponse } from './intent'
import { prepareAiHandoff } from './prepareAiHandoff'

const replacementPrompt =
  'Edit my profile pookie.eth and set github name to yoginth instead of bigint'

// These choices and scores were observed from Jev for replacementPrompt.
// Retaining the real response catches application-side rejection of an
// otherwise correctly understood request.
const observedResponse = {
  answers: {
    intent: { type: 'choice', choice: 'edit_profile', confidence: 1 },
    next_intent: { type: 'choice', choice: 'none', confidence: 0.99 },
    fully_supported: { type: 'noul', noul: 0.89 },
    unsupported_requirement: { type: 'noul', noul: 0.17 },
    multi_action: { type: 'noul', noul: 0.07 },
  },
}

const optimisticResponse = {
  answers: {
    ...observedResponse.answers,
    fully_supported: { type: 'noul', noul: 0.99 },
    unsupported_requirement: { type: 'noul', noul: 0.01 },
    multi_action: { type: 'noul', noul: 0.01 },
  },
}

const currentProfile = (): ProfileRecords => ({
  ...newEmptyProfileRecords(),
  base: {
    description: 'Building ENS tools',
    avatar: 'https://example.com/avatar.png',
    'primary-contact': 'com.github',
  },
  social: [
    { key: 'com.github', value: 'bigint' },
    { key: 'com.twitter', value: 'existing-social' },
  ],
  contact: [{ key: 'email', value: 'existing@example.com' }],
  links: [{ name: 'Personal website', url: 'https://example.com' }],
  addresses: [
    { coinType: 60, value: '0x000000000000000000000000000000000000dEaD' },
  ],
  unknown: [{ key: 'custom-record', value: 'preserve me' }],
})

const prepareReplacement = (query: string) => {
  const interpreted = parseJevAiResponse(observedResponse, query)
  expect(interpreted).toEqual({
    status: 'ok',
    action: {
      intent: 'edit_profile',
      name: 'pookie.eth',
      section: 'contact',
      field: 'github',
      value: 'yoginth',
      expectedValue: 'bigint',
    },
  })
  if (!interpreted) throw new Error('Expected a supported profile edit')
  const prepared = prepareAiHandoff(interpreted.action)
  expect(prepared).toEqual({
    status: 'ready',
    action: {
      intent: 'edit_profile',
      name: 'pookie.eth',
      section: 'contact',
      proposal: {
        field: 'github',
        value: 'yoginth',
        expectedValue: 'bigint',
      },
    },
  })
  if (
    prepared.status !== 'ready' ||
    prepared.action.intent !== 'edit_profile' ||
    !prepared.action.proposal
  )
    throw new Error('Expected a prepared profile proposal')
  return prepared.action.proposal
}

describe('AI profile action through the existing record editor', () => {
  it.each([
    {
      query: 'Set pookie.eth githb to yoginht',
      field: 'github',
      value: 'yoginht',
      stored: 'yoginht',
      section: 'contact',
    },
    {
      query: 'Set pookie.eth bio to "I build ENS tools!"',
      field: 'description',
      value: 'I build ENS tools!',
      stored: 'I build ENS tools!',
      section: 'general',
    },
    {
      query: 'Set pookie.eth avatar to https://example.com/new.png',
      field: 'avatar',
      value: 'https://example.com/new.png',
      stored: 'https://example.com/new.png',
      section: 'general',
    },
    {
      query: 'Set pookie.eth email to new@example.com',
      field: 'email',
      value: 'new@example.com',
      stored: 'new@example.com',
      section: 'contact',
    },
    {
      query:
        'Set pookie.eth Ethereum address to 0x1111111111111111111111111111111111111111',
      field: 'eth_address',
      value: '0x1111111111111111111111111111111111111111',
      stored: '0x1111111111111111111111111111111111111111',
      section: 'addresses',
    },
    {
      query: 'Use Garnet theme for pookie.eth',
      field: 'theme',
      value: 'Garnet',
      stored: '#E72A96',
      section: 'appearance',
    },
  ])('prepares exactly one existing editor change for $field', ({
    query,
    field,
    value,
    stored,
    section,
  }) => {
    const interpreted = parseJevAiResponse(
      {
        answers: {
          ...optimisticResponse.answers,
          profile_field: { type: 'choice', choice: field, confidence: 0.99 },
          profile_operation: {
            type: 'choice',
            choice: 'set',
            confidence: 0.99,
          },
          profile_value: {
            type: 'choice',
            choice: 'value_1',
            confidence: 0.99,
          },
          profile_previous_value: {
            type: 'choice',
            choice: 'none',
            confidence: 0.99,
          },
        },
      },
      query,
    )
    expect(interpreted?.action).toEqual({
      intent: 'edit_profile',
      name: 'pookie.eth',
      section,
      field,
      value,
    })
    if (!interpreted) throw new Error('Expected profile interpretation')
    const prepared = prepareAiHandoff(interpreted.action)
    expect(prepared.status).toBe('ready')
    if (
      prepared.status !== 'ready' ||
      prepared.action.intent !== 'edit_profile' ||
      !prepared.action.proposal
    )
      throw new Error('Expected a ready profile proposal')
    const before = currentProfile()
    expect(
      checkProfileEditProposal(before, prepared.action.proposal),
    ).toBeNull()
    const after = applyProfileEditProposal(before, prepared.action.proposal)
    expect(
      getProfileEditProposalCurrentValue(after, prepared.action.proposal.field),
    ).toBe(stored)
    expect(Object.values(createDiff(before, after))).toHaveLength(1)
    expect(before).toEqual(currentProfile())
  })
  it.each([
    replacementPrompt,
    'Change GitHub on pookie.eth from bigint to yoginth',
  ])('prepares a single GitHub record replacement for "%s"', (query) => {
    const proposal = prepareReplacement(query)
    const before = currentProfile()
    expect(checkProfileEditProposal(before, proposal)).toBeNull()
    const after = applyProfileEditProposal(before, proposal)

    expect(after.social).toEqual([
      { key: 'com.github', value: 'yoginth' },
      { key: 'com.twitter', value: 'existing-social' },
    ])
    expect(before.social[0]?.value).toBe('bigint')
    expect(after).toEqual({ ...before, social: after.social })
    expect(Object.values(createDiff(before, after))).toEqual([
      expect.objectContaining({
        fieldKey: 'com.github',
        sectionKey: 'social',
        type: 'modified',
        original: 'bigint',
        current: 'yoginth',
      }),
    ])

    const beforeService = transformToServiceFormat(before)
    const afterService = transformToServiceFormat(after)
    expect(afterService).toEqual({
      ...beforeService,
      texts: beforeService.texts.map((record) =>
        record.key === 'com.github' ? { ...record, value: 'yoginth' } : record,
      ),
    })
    expect(
      afterService.texts.filter(({ key }) => key === 'com.github'),
    ).toEqual([{ key: 'com.github', value: 'yoginth' }])
  })

  it('blocks the replacement when the loaded record differs from the old value in the request', () => {
    const proposal = prepareReplacement(replacementPrompt)
    const records = {
      ...currentProfile(),
      social: [{ key: 'com.github', value: 'someone-else' }],
    }
    const failure = checkProfileEditProposal(records, proposal)
    expect(failure).toContain('someone-else')
    expect(failure).toContain('bigint')
    expect(records.social).toEqual([
      { key: 'com.github', value: 'someone-else' },
    ])
  })

  it.each([
    "Don't change GitHub on pookie.eth to yoginth",
    'Edit pookie.eth but do not set GitHub to yoginth',
    'Edit pookie.eth profile and set github to yoginth and email to yoginth@example.com',
    'Edit pookie.eth profile and set github to yoginth and Twitter to yoginth',
    'Edit pookie.eth profile and set github to yoginth and transfer it to alice.eth',
    'Edit pookie.eth profile and generate a funny bio',
  ])('rejects an unsafe or incomplete interpretation of "%s"', (query) => {
    expect(parseJevAiResponse(optimisticResponse, query)).toBeNull()
  })
})
