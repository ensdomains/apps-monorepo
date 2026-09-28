import { describe, expect, it } from 'vitest'
import { applyProfileEditProposal } from '@/features/profile/service/profileEditProposal'
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

describe('profile resource and destination roles', () => {
  it.each([
    {
      query:
        'Add my GitHub as a link on moss.eth: https://github.com/moss-labs',
      name: 'moss.eth',
      url: 'https://github.com/moss-labs',
      field: choice('github', 0.82),
      operation: choice('set', 0.96),
    },
    {
      query: 'Add https://github.com/velvet-labs as a link on velvet.eth',
      name: 'velvet.eth',
      url: 'https://github.com/velvet-labs',
      field: choice('unknown', 0.85),
      operation: choice('set', 0.45),
    },
    {
      query:
        'Add my GitHub as a custom link on acacia.eth: https://github.com/acacia-dev',
      name: 'acacia.eth',
      url: 'https://github.com/acacia-dev',
      field: choice('github', 0.84),
      operation: choice('set', 0.93),
    },
  ])('adds a custom link with its exact URL: $query', ({
    query,
    name,
    url,
    field,
    operation,
  }) => {
    const result = parseJevAiResponse(
      response({ profile_field: field, profile_operation: operation }),
      query,
    )
    expect(result?.action).toMatchObject({
      intent: 'edit_profile',
      name,
      section: 'links',
      linkRequested: true,
      value: url,
    })
    if (!result) throw new Error('Expected a custom link action')
    expect(prepareAiHandoff(result.action)).toMatchObject({
      status: 'ready',
      action: { section: 'links', link: { name: 'GitHub', url } },
    })
    const context = buildProfileValueContext(query)
    expect(context.state).toMatch(/as a (?:custom )?link/)
    expect(context.state).not.toContain(url)
    expect(context.candidates.map(({ value }) => value)).toEqual([url])
  })

  it('keeps a GitHub contact assignment separate from a custom link', () => {
    const result = parseProfileSection(
      'Set moss.eth GitHub to https://github.com/moss-labs',
      'moss.eth',
      { profile_field: choice('github'), profile_operation: choice('set') },
    )
    expect(result).toMatchObject({ field: 'github', section: 'contact' })
    if (!result) throw new Error('Expected a contact record action')
    expect(prepareProfileAiDetails(result)).toMatchObject({
      status: 'ready',
      proposal: { field: 'github', value: 'moss-labs' },
    })
  })

  it('asks for a missing website link URL and retains the Links destination', () => {
    const result = parseJevAiResponse(
      response({
        profile_field: choice('website', 0.93),
        profile_operation: choice('set', 0.97),
      }),
      'Add a website link to cloud-nine.eth',
    )
    expect(result?.action).toMatchObject({
      section: 'links',
      linkRequested: true,
    })
    if (result?.action.intent !== 'edit_profile')
      throw new Error('Expected a link clarification')
    expect(prepareAiHandoff(result.action)).toMatchObject({
      status: 'needs_input',
      field: 'url',
    })
    expect(
      prepareProfileAiDetails(result.action, {
        url: 'https://example.org/cloud',
      }),
    ).toMatchObject({
      status: 'ready',
      section: 'links',
      link: { name: 'Link', url: 'https://example.org/cloud' },
    })
  })

  it.each([
    'please',
    'pls',
    'plz',
  ])('does not treat the target and %s as a supplied URL', (politeness) => {
    const result = parseJevAiResponse(
      response({
        profile_field: choice('website', 0.94),
        profile_operation: choice('set', 0.97),
      }),
      `Add a website link to juniper.eth ${politeness}`,
    )
    if (result?.action.intent !== 'edit_profile')
      throw new Error('Expected a link clarification')
    expect(result.action.value).toBeUndefined()
    expect(prepareAiHandoff(result.action)).toMatchObject({
      status: 'needs_input',
      field: 'url',
    })
  })

  it('keeps a replacement contact field visible and binds exact previous/new values', () => {
    const query =
      'Replace the GitHub contact juniper-old with juniper-new on juniper.eth'
    const context = buildProfileValueContext(query)
    expect(context.state).toBe(
      'Replace the GitHub contact [PROFILE_VALUE_1] with [PROFILE_VALUE_2] on juniper.eth',
    )
    const result = parseJevAiResponse(
      response({
        profile_field: choice('unknown', 0.48),
        profile_operation: choice('replace', 0.97),
      }),
      query,
    )
    expect(result?.action).toMatchObject({
      name: 'juniper.eth',
      field: 'github',
      section: 'contact',
      value: 'juniper-new',
      expectedValue: 'juniper-old',
    })
    if (result?.action.intent !== 'edit_profile')
      throw new Error('Expected an exact replacement')
    const prepared = prepareProfileAiDetails(result.action)
    if (prepared.status !== 'ready' || !prepared.proposal)
      throw new Error('Expected a replacement proposal')
    const existing = applyProfileEditProposal(newEmptyProfileRecords(), {
      field: 'github',
      value: 'different-current',
    })
    expect(checkProfileEditProposal(existing, prepared.proposal)).toContain(
      'Your request expected',
    )
  })

  it.each([
    'contact-old',
    'record-old',
    'username-old',
    'name-old',
  ])('does not strip a field-label prefix from the exact handle %s', (oldValue) => {
    const query = `Replace the GitHub ${oldValue} with juniper-new on juniper.eth`
    const action = parseProfileSection(query, 'juniper.eth')
    expect(action).toMatchObject({
      field: 'github',
      value: 'juniper-new',
      expectedValue: oldValue,
    })
    expect(
      buildProfileValueContext(query).candidates.map(({ value }) => value),
    ).toEqual([oldValue, 'juniper-new'])
  })

  it('keeps literal link words private when they are a quoted record value', () => {
    const query = 'Set moss.eth description to "as a link"'
    const context = buildProfileValueContext(query)
    expect(context.state).not.toContain('as a link')
    expect(parseProfileSection(query, 'moss.eth')).toMatchObject({
      field: 'description',
      value: 'as a link',
    })
  })

  it('keeps unquoted link words private when assigned to a different explicit field', () => {
    const query = 'Set moss.eth description as a link'
    const context = buildProfileValueContext(query)
    expect(context.state).toBe('Set moss.eth description as [PROFILE_VALUE_1]')
    expect(context.candidates.map(({ value }) => value)).toEqual(['a link'])
    expect(parseProfileSection(query, 'moss.eth')).toMatchObject({
      field: 'description',
      value: 'a link',
    })
  })

  it('preserves an explicitly supplied custom title even when it names a resource', () => {
    const query =
      'Add link named "Website" to moss.eth using https://example.org/moss'
    const action = parseProfileSection(query, 'moss.eth')
    expect(action).toMatchObject({ field: 'link', linkName: 'Website' })
    if (!action) throw new Error('Expected an exactly named link')
    expect(prepareProfileAiDetails(action)).toMatchObject({
      status: 'ready',
      proposal: {
        field: 'link',
        linkName: 'Website',
        value: 'https://example.org/moss',
      },
    })
  })

  it('reuses the exact target’s current Ethereum address for Polygon only after record checks', () => {
    const query =
      'Use the Ethereum address on orbit.eth for its Polygon address'
    const result = parseJevAiResponse(
      response({
        profile_field: choice('address', 0.96),
        profile_operation: choice('use_eth', 0.61),
      }),
      query,
    )
    expect(result?.action).toMatchObject({
      name: 'orbit.eth',
      field: 'address',
      operation: 'use_eth',
      addressCoinType: 2147483785,
    })
    if (result?.action.intent !== 'edit_profile')
      throw new Error('Expected a record reuse action')
    const prepared = prepareProfileAiDetails(result.action)
    expect(prepared).toMatchObject({
      status: 'ready',
      proposal: {
        field: 'address',
        coinType: 2147483785,
        operation: 'use_eth',
        value: '',
      },
    })
    if (prepared.status !== 'ready' || !prepared.proposal)
      throw new Error('Expected an address proposal')
    expect(
      checkProfileEditProposal(newEmptyProfileRecords(), prepared.proposal),
    ).toContain('valid Ethereum')
    const eth = '0x000000000000000000000000000000000000dEaD'
    const unrelated = {
      coinType: 2147483658,
      value: '0x000000000000000000000000000000000000bEEF',
    }
    const records = {
      ...newEmptyProfileRecords(),
      addresses: [{ coinType: 60, value: eth }, unrelated],
    }
    expect(checkProfileEditProposal(records, prepared.proposal)).toBeNull()
    expect(
      applyProfileEditProposal(records, prepared.proposal).addresses,
    ).toEqual([
      { coinType: 60, value: eth },
      unrelated,
      { coinType: 2147483785, value: eth },
    ])
  })

  it.each([
    'Do not use the Ethereum address on orbit.eth for its Polygon address',
    'Use the Ethereum address on moss.eth for orbit.eth Polygon address',
    'Use the Ethereum address on orbit.eth for its Polygon address and notify Alice',
    'Use the Ethereum address on orbit.eth for its Polygon address with 0x000000000000000000000000000000000000dEaD',
  ])('does not reinterpret a different source or extra condition as same-profile reuse: %s', (query) => {
    expect(
      parseProfileSection(query, 'orbit.eth', {
        profile_field: choice('address'),
        profile_operation: choice('use_eth'),
      }),
    ).toBeNull()
  })

  it.each([
    'Add my GitHub as a link on moss.eth: https://github.com/moss-labs and change email to new@example.com',
    'Add my GitHub as a link on moss.eth: https://github.com/moss-labs and share with Alice',
    'Do not add https://github.com/moss-labs as a link on moss.eth',
  ])('retains conjunction and negation guards for custom links: %s', (query) => {
    expect(parseJevAiResponse(response({}), query)).toBeNull()
  })
})
