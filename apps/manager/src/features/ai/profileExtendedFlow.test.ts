import { describe, expect, it } from 'vitest'
import { applyProfileEditProposal } from '@/features/profile/service/profileEditProposal'
import {
  findProfileNetworks,
  getProfileFieldDefinition,
} from '@/features/profile/service/profileFieldRegistry'
import { checkProfileEditProposal } from '@/features/profile/service/profileRecordProposal'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import { prepareProfileAiDetails } from './profileAiPreparation'
import { parseProfileSection } from './profileIntent'
import { buildProfileValueContext } from './profileValueContext'

const prepare = (query: string) => {
  const action = parseProfileSection(query, 'pookie.eth')
  expect(action, query).not.toBeNull()
  if (!action) throw new Error('Expected a profile action')
  return prepareProfileAiDetails(action)
}

describe('native profile actions through interpretation and draft preparation', () => {
  it.each([
    'Delete the Solana record from pookie.eth and notify me',
    'Delete the Solana record from pookie.eth and message Alice',
    'Rename pookie.eth link "Portfolio" to "Work" and share with Alice',
    'Change the title of pookie.eth link "Portfolio" to "Work" and email Alice',
    'Delete the Solana and Bitcoin records from pookie.eth',
    'Delete the Solana record and GitHub from pookie.eth',
  ])('rejects an extra recipient action or destination: %s', (query) => {
    expect(parseProfileSection(query, 'pookie.eth')).toBeNull()
  })

  it('keeps instruction-like words inside exact titles and record values', () => {
    expect(
      prepare('Rename pookie.eth link "Notify Alice" to "Send a message"'),
    ).toMatchObject({
      status: 'ready',
      proposal: {
        field: 'link',
        operation: 'rename',
        linkTarget: 'Notify Alice',
        linkName: 'Send a message',
      },
    })
    expect(
      prepare('Set pookie.eth description to "Review links and notify Alice"'),
    ).toMatchObject({
      status: 'ready',
      proposal: {
        field: 'description',
        value: 'Review links and notify Alice',
      },
    })
  })

  it.each([
    ['Delete the Solana record from pookie.eth', 501],
    ['Remove pookie.eth BTC record', 0],
    ['Clear the Base record on pookie.eth', 2147568180],
  ])('recognizes an exact network record even with uncertain field classification: %s', (query, coinType) => {
    const action = parseProfileSection(query, 'pookie.eth', {
      profile_field: { type: 'choice', choice: 'address', confidence: 0.51 },
      profile_network: {
        type: 'choice',
        choice: `coin_${coinType}`,
        confidence: 0.97,
      },
      profile_operation: { type: 'choice', choice: 'remove', confidence: 1 },
    })
    expect(action).toMatchObject({
      field: 'address',
      addressCoinType: coinType,
      operation: 'remove',
    })
    if (!action) throw new Error('Expected a native network record removal')
    expect(prepareProfileAiDetails(action)).toMatchObject({
      status: 'ready',
      proposal: { field: 'address', coinType, operation: 'remove' },
    })
  })

  it.each([
    'Change the title of pookie.eth link "Portfolio" to "Work"',
    'Update the label of the "Portfolio" link on pookie.eth to "Work"',
    'Set pookie.eth link "Portfolio" title to "Work"',
  ])('understands exact link-title edits without changing their URL: %s', (query) => {
    expect(prepare(query)).toMatchObject({
      status: 'ready',
      proposal: {
        field: 'link',
        operation: 'rename',
        linkTarget: 'Portfolio',
        linkName: 'Work',
        value: '',
      },
    })
  })

  it('clarifies missing link title details and rejects an extra URL change', () => {
    expect(prepare('Rename pookie.eth link "Portfolio"')).toMatchObject({
      status: 'needs_input',
      field: 'profileLinkName',
    })
    expect(
      prepare('Change the title of pookie.eth link "Portfolio"'),
    ).toMatchObject({ status: 'needs_input', field: 'profileLinkName' })
    expect(prepare('Rename a link on pookie.eth')).toMatchObject({
      status: 'needs_input',
      field: 'profileLinkTarget',
    })
    expect(
      parseProfileSection(
        'Rename pookie.eth link "Portfolio" to "Work" with URL https://example.com/new',
        'pookie.eth',
      ),
    ).toBeNull()
  })

  it.each([
    ['Remove GitHub "bigint" from pookie.eth', 'github', 'bigint', 'yoginth'],
    [
      'Remove email old@example.com from pookie.eth',
      'email',
      'old@example.com',
      'new@example.com',
    ],
    [
      'Remove Ethereum address 0x000000000000000000000000000000000000dEaD from pookie.eth',
      'eth_address',
      '0x000000000000000000000000000000000000dEaD',
      '0x000000000000000000000000000000000000bEEF',
    ],
  ])('checks the exact old value before a qualified removal: %s', (query, field, expectedValue, differentValue) => {
    const action = parseProfileSection(query, 'pookie.eth')
    expect(action).toMatchObject({ operation: 'remove', field, expectedValue })
    if (!action) throw new Error('Expected constrained removal')
    const prepared = prepareProfileAiDetails(action)
    expect(prepared).toMatchObject({
      status: 'ready',
      proposal: { operation: 'remove', expectedValue },
    })
    if (prepared.status !== 'ready' || !prepared.proposal)
      throw new Error('Expected proposal')
    const different = applyProfileEditProposal(newEmptyProfileRecords(), {
      ...prepared.proposal,
      operation: 'set',
      value: differentValue,
    })
    expect(checkProfileEditProposal(different, prepared.proposal)).toContain(
      'Your request expected',
    )
    const matching = applyProfileEditProposal(newEmptyProfileRecords(), {
      ...prepared.proposal,
      operation: 'set',
      value: expectedValue,
    })
    expect(checkProfileEditProposal(matching, prepared.proposal)).toBeNull()
  })

  it('preserves a link removal URL constraint and rejects competing old values', () => {
    const action = parseProfileSection(
      'Remove the "Portfolio" link with URL https://example.com/old from pookie.eth',
      'pookie.eth',
    )
    expect(action).toMatchObject({
      operation: 'remove',
      linkTarget: 'Portfolio',
      expectedValue: 'https://example.com/old',
    })
    if (!action) throw new Error('Expected constrained link removal')
    const prepared = prepareProfileAiDetails(action)
    if (prepared.status !== 'ready' || !prepared.proposal)
      throw new Error('Expected proposal')
    const records = {
      ...newEmptyProfileRecords(),
      links: [{ name: 'Portfolio', url: 'https://example.com/new' }],
    }
    expect(checkProfileEditProposal(records, prepared.proposal)).toContain(
      'Your request expected',
    )
    expect(
      parseProfileSection(
        'Remove GitHub "bigint" or "yoginth" from pookie.eth',
        'pookie.eth',
      ),
    ).toBeNull()
  })

  it('understands a transposed removal verb without correcting exact values or negation', () => {
    const choice = (choice: string) => ({
      type: 'choice',
      choice,
      confidence: 0.99,
    })
    const answers = {
      profile_field: choice('github'),
      profile_operation: choice('remove'),
      profile_value: choice('none'),
      profile_previous_value: choice('none'),
    }
    const action = parseProfileSection(
      'remvoe orbit.eth githb record',
      'orbit.eth',
      answers,
    )
    expect(action).toMatchObject({ field: 'github', operation: 'remove' })
    if (!action) throw new Error('Expected removal proposal')
    expect(prepareProfileAiDetails(action)).toMatchObject({
      status: 'ready',
      proposal: { field: 'github', operation: 'remove', value: '' },
    })
    expect(
      parseProfileSection(
        'Do not remvoe orbit.eth githb record',
        'orbit.eth',
        answers,
      ),
    ).toBeNull()
    expect(
      parseProfileSection(
        'Set orbit.eth GitHub to remvoe',
        'orbit.eth',
        answers,
      ),
    ).toBeNull()
    expect(
      parseProfileSection('Set orbit.eth GitHub to remvoe', 'orbit.eth', {
        ...answers,
        profile_operation: choice('set'),
        profile_value: choice('value_1'),
      }),
    ).toMatchObject({ field: 'github', value: 'remvoe' })
  })

  it('preserves full replacement roles, missing replacement values, and unpin operations', () => {
    const choice = (choice: string, confidence = 0.99) => ({
      type: 'choice',
      choice,
      confidence,
    })
    const replacement = parseProfileSection(
      'Set orbit.eth GitHub to star-sailor instead of old-orbit',
      'orbit.eth',
      {
        profile_field: choice('github'),
        profile_operation: choice('replace', 0.84),
        profile_network: choice('none', 0.4),
        profile_value: choice('value_1'),
        profile_previous_value: choice('value_2'),
      },
    )
    expect(replacement).toMatchObject({
      field: 'github',
      value: 'star-sailor',
      expectedValue: 'old-orbit',
    })
    const email = parseProfileSection(
      'Replace meadow.eth contact email',
      'meadow.eth',
      {
        profile_field: choice('email'),
        profile_operation: choice('replace', 0.62),
        profile_value: choice('none'),
        profile_previous_value: choice('none'),
      },
    )
    expect(email).toMatchObject({ field: 'email' })
    if (!email) throw new Error('Expected a missing email detail')
    expect(prepareProfileAiDetails(email)).toMatchObject({
      status: 'needs_input',
      field: 'profileValue',
    })
    const unpin = parseProfileSection(
      'unpin orbit.eth farcastr contact',
      'orbit.eth',
      {
        profile_field: choice('farcaster', 0.8),
        profile_operation: choice('unfeature', 0.38),
        profile_value: choice('none'),
        profile_previous_value: choice('none'),
      },
    )
    expect(unpin).toMatchObject({ field: 'farcaster', operation: 'unfeature' })
  })

  it('does not mistake the target name suffix for a link title', () => {
    const action = parseProfileSection(
      'Rename orbit.eth link "Portfolio" to "Selected work"',
      'orbit.eth',
    )
    expect(action).toMatchObject({
      field: 'link',
      operation: 'rename',
      linkTarget: 'Portfolio',
      linkName: 'Selected work',
    })
  })

  it('clarifies both sides of a rename and an unspecified replacement target without adding a link', () => {
    const rename = {
      section: 'links',
      field: 'link',
      operation: 'rename',
    } as const
    expect(prepareProfileAiDetails(rename)).toMatchObject({
      status: 'needs_input',
      field: 'profileLinkTarget',
    })
    expect(
      prepareProfileAiDetails(rename, { profileLinkTarget: 'Portfolio' }),
    ).toMatchObject({ status: 'needs_input', field: 'profileLinkName' })
    expect(
      prepareProfileAiDetails(rename, {
        profileLinkTarget: 'Portfolio',
        profileLinkName: 'Work',
      }),
    ).toMatchObject({
      status: 'ready',
      proposal: {
        operation: 'rename',
        linkTarget: 'Portfolio',
        linkName: 'Work',
      },
    })
    const replacement = parseProfileSection(
      'Change pookie.eth link to https://example.com/new',
      'pookie.eth',
    )
    expect(replacement).toMatchObject({ linkTargetRequested: true })
    if (!replacement) throw new Error('Expected link clarification')
    expect(prepareProfileAiDetails(replacement)).toMatchObject({
      status: 'needs_input',
      field: 'profileLinkTarget',
    })
    expect(
      prepareProfileAiDetails(replacement, { profileLinkTarget: 'Portfolio' }),
    ).toMatchObject({
      status: 'ready',
      proposal: {
        linkTarget: 'Portfolio',
        linkName: 'Portfolio',
        value: 'https://example.com/new',
      },
    })
  })

  it('redacts named link titles and domain-shaped social values without confusing the target', () => {
    const query = 'Set pookie.eth Farcaster to builder.eth'
    const context = buildProfileValueContext(query)
    expect(context.state).toContain('pookie.eth')
    expect(context.state).not.toContain('builder.eth')
    expect(prepare(query)).toMatchObject({
      status: 'ready',
      proposal: { field: 'farcaster', value: 'builder.eth' },
    })
    expect(
      buildProfileValueContext(
        'Add a link named Portfolio with URL https://example.com to pookie.eth',
      ).state,
    ).not.toContain('Portfolio')
    expect(findProfileNetworks('Set base.eth GitHub to yoginth')).toEqual([])
  })
  it.each([
    [
      'Use https://example.org/images/lamp.webp as pookie.eth avatar',
      'general',
      'avatar',
      'https://example.org/images/lamp.webp',
    ],
    [
      'Add https://example.net/portfolio to pookie.eth links',
      'links',
      undefined,
      'https://example.net/portfolio',
    ],
  ])('keeps a reordered destination distinct from an exact URL: %s', (query, section, field, value) => {
    const action = parseProfileSection(query, 'pookie.eth')
    expect(action).toMatchObject({ section, value })
    expect(action?.field).toBe(field)
    expect(buildProfileValueContext(query).state).toContain('pookie.eth')
    expect(buildProfileValueContext(query).state).not.toContain(value)
  })
  it.each([
    [
      'Set pookie.eth banner to https://example.com/banner.png',
      'header',
      'header',
      'https://example.com/banner.png',
    ],
    [
      'Set pookie.eth full name to "Yoginth Developer"',
      'display_name',
      'name',
      'Yoginth Developer',
    ],
    [
      'Set pookie.eth website to https://example.com/work',
      'website',
      'url',
      'https://example.com/work',
    ],
    [
      'Set pookie.eth location to "Bengaluru, India"',
      'location',
      'location',
      'Bengaluru, India',
    ],
    ['Set pookie.eth timezone to UTC+5', 'timezone', 'timezone', 'UTC+5'],
    ['Set pookie.eth language to English', 'language', 'language', 'en'],
    [
      'Set pookie.eth phone to "+91 1234567890"',
      'phone',
      'phone',
      '+91 1234567890',
    ],
    [
      'Set pookie.eth mailing address to "42 Main Street"',
      'postal_address',
      'mail',
      '42 Main Street',
    ],
  ])('prepares exactly the native record for %s', (query, field, key, value) => {
    const result = prepare(query)
    expect(result).toMatchObject({
      status: 'ready',
      proposal: { field, value },
    })
    if (result.status !== 'ready' || !result.proposal)
      throw new Error('Expected a proposal')
    const before = newEmptyProfileRecords()
    const after = applyProfileEditProposal(before, result.proposal)
    const definition = getProfileFieldDefinition(result.proposal.field)
    expect(definition?.key).toBe(key)
    if (definition?.storage === 'base')
      expect(after.base[key as keyof typeof after.base]).toBe(value)
    else expect(after.contact).toContainEqual({ key, value })
    expect(before).toEqual(newEmptyProfileRecords())
    expect(buildProfileValueContext(query).state).not.toContain(value)
  })

  it.each([
    ['Twitter', 'twitter', 'com.twitter'],
    ['Telegram', 'telegram', 'org.telegram'],
    ['Farcaster', 'farcaster', 'xyz.farcaster'],
    ['Discord', 'discord', 'com.discord'],
    ['Instagram', 'instagram', 'com.instagram'],
    ['LinkedIn', 'linkedin', 'com.linkedin'],
    ['GitHub', 'github', 'com.github'],
    ['Mastodon', 'mastodon', 'com.mastodon'],
    ['Reddit', 'reddit', 'com.reddit'],
    ['TikTok', 'tiktok', 'com.tiktok'],
    ['Twitch', 'twitch', 'com.twitch'],
  ])('sets the existing %s social record without altering a supplied handle', (label, field, key) => {
    const result = prepare(`Set pookie.eth ${label} to yoginht`)
    expect(result).toMatchObject({
      status: 'ready',
      proposal: { field, value: 'yoginht' },
    })
    if (result.status !== 'ready' || !result.proposal)
      throw new Error('Expected a proposal')
    expect(
      applyProfileEditProposal(newEmptyProfileRecords(), result.proposal)
        .social,
    ).toEqual([{ key, value: 'yoginht' }])
  })

  it.each([
    ['Bitcoin', 0, '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'],
    ['Solana', 501, '11111111111111111111111111111111'],
  ])('uses the actual %s address validator and coin type', (network, coinType, value) => {
    const result = prepare(`Set pookie.eth ${network} address to ${value}`)
    expect(result).toMatchObject({
      status: 'ready',
      section: 'addresses',
      proposal: { field: 'address', coinType, value },
    })
    if (result.status !== 'ready' || !result.proposal)
      throw new Error('Expected a proposal')
    expect(
      applyProfileEditProposal(newEmptyProfileRecords(), result.proposal)
        .addresses,
    ).toEqual([{ coinType, value }])
  })

  it('asks for an actual address for a named person rather than inventing it', () => {
    expect(
      prepare("Set pookie.eth bitcoin address to satoshi's address"),
    ).toMatchObject({ status: 'needs_input', field: 'profileValue' })
    expect(prepare('Set pookie.eth Bitcoin address to garbage')).toMatchObject({
      status: 'invalid',
    })
  })

  it('keeps chain selection local and applies a saved Ethereum address only after live checks', () => {
    const result = prepare('Use my Ethereum address on Base for pookie.eth')
    const coinType = findProfileNetworks('Base address')[0]?.coinType
    expect(coinType).toBeDefined()
    expect(result).toMatchObject({
      status: 'ready',
      proposal: { field: 'address', operation: 'use_eth', coinType },
    })
    if (result.status !== 'ready' || !result.proposal)
      throw new Error('Expected a proposal')
    expect(
      checkProfileEditProposal(newEmptyProfileRecords(), result.proposal),
    ).toContain('valid Ethereum')
    const eth = '0x000000000000000000000000000000000000dEaD'
    const before = {
      ...newEmptyProfileRecords(),
      addresses: [{ coinType: 60, value: eth }],
    }
    expect(checkProfileEditProposal(before, result.proposal)).toBeNull()
    expect(
      applyProfileEditProposal(before, result.proposal).addresses,
    ).toContainEqual({ coinType, value: eth })
  })

  it('removes just the requested record and removes its featured entry', () => {
    const result = prepare('Remove GitHub from pookie.eth')
    expect(result).toMatchObject({
      status: 'ready',
      proposal: { field: 'github', operation: 'remove' },
    })
    if (result.status !== 'ready' || !result.proposal)
      throw new Error('Expected a proposal')
    const before = {
      ...newEmptyProfileRecords(),
      base: { 'primary-contact': 'com.github' },
      social: [
        { key: 'com.github', value: 'yoginth' },
        { key: 'com.twitter', value: 'keep' },
      ],
    }
    const after = applyProfileEditProposal(before, result.proposal)
    expect(after.social).toEqual([{ key: 'com.twitter', value: 'keep' }])
    expect(after.base['primary-contact']).toBeUndefined()
  })

  it('features a populated social field and rejects exceeding the existing capacity', () => {
    const result = prepare('Feature GitHub on pookie.eth')
    expect(result).toMatchObject({
      status: 'ready',
      proposal: { field: 'github', operation: 'feature' },
    })
    if (result.status !== 'ready' || !result.proposal)
      throw new Error('Expected a proposal')
    const records = {
      ...newEmptyProfileRecords(),
      social: [{ key: 'com.github', value: 'yoginth' }],
    }
    expect(
      checkProfileEditProposal(newEmptyProfileRecords(), result.proposal),
    ).toContain('Add GitHub')
    expect(checkProfileEditProposal(records, result.proposal)).toBeNull()
    const after = applyProfileEditProposal(records, result.proposal)
    expect(after.base['primary-contact']).toBe('com.github')
    expect(
      checkProfileEditProposal(
        {
          ...records,
          base: {
            'domains.ens.primary-contacts': JSON.stringify([
              'com.twitter',
              'org.telegram',
              'xyz.farcaster',
            ]),
          },
        },
        result.proposal,
      ),
    ).toContain('already feature 3')
  })

  it('adds, replaces, renames and removes an exactly named custom link', () => {
    const empty = newEmptyProfileRecords()
    const added = prepare(
      'Add a link named "Portfolio" with URL https://example.com to pookie.eth',
    )
    expect(added).toMatchObject({
      status: 'ready',
      proposal: {
        field: 'link',
        linkName: 'Portfolio',
        value: 'https://example.com',
      },
    })
    if (added.status !== 'ready' || !added.proposal)
      throw new Error('Expected link proposal')
    const records = applyProfileEditProposal(empty, added.proposal)
    const replaced = prepare(
      'Change the "Portfolio" link on pookie.eth to https://example.com/work',
    )
    expect(replaced).toMatchObject({
      status: 'ready',
      proposal: {
        linkName: 'Portfolio',
        linkTarget: 'Portfolio',
        value: 'https://example.com/work',
      },
    })
    const renamed = prepare(
      'Rename the "Portfolio" link on pookie.eth to "Work"',
    )
    expect(renamed).toMatchObject({
      status: 'ready',
      proposal: {
        operation: 'rename',
        linkTarget: 'Portfolio',
        linkName: 'Work',
      },
    })
    if (renamed.status !== 'ready' || !renamed.proposal)
      throw new Error('Expected link proposal')
    expect(applyProfileEditProposal(records, renamed.proposal).links).toEqual([
      { name: 'Work', url: 'https://example.com' },
    ])
    const removed = prepare('Remove the "Portfolio" link from pookie.eth')
    if (removed.status !== 'ready' || !removed.proposal)
      throw new Error('Expected link proposal')
    expect(checkProfileEditProposal(empty, removed.proposal)).toContain(
      'unique title',
    )
    expect(applyProfileEditProposal(records, removed.proposal).links).toEqual(
      [],
    )
  })

  it.each([
    'Set pookie.eth profile record',
    'Change pookie.eth profile details',
  ])('asks which field for vague mutations: %s', (query) => {
    expect(prepare(query)).toMatchObject({
      status: 'needs_input',
      field: 'profileField',
    })
  })

  it.each([
    'Do not remove GitHub from pookie.eth',
    'Set pookie.eth twitter to yoginth and transfer pookie.eth',
    'Set pookie.eth phone and email to yoginth@example.com',
    'Set pookie.eth contenthash to ipfs://QmExample',
    'Change pookie.eth resolver to 0x000000000000000000000000000000000000dEaD',
    'Generate a bio for pookie.eth',
    'Set pookie.eth Bitcoin and Solana addresses',
  ])('rejects an unsupported or ambiguous request as a whole: %s', (query) => {
    expect(parseProfileSection(query, 'pookie.eth')).toBeNull()
  })
})
