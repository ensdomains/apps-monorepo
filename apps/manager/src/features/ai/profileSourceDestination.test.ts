import { describe, expect, it } from 'vitest'
import { evmChainOptions } from '@/features/profile/components/dialogs/edit-profile/tabs/addresses/addressPickerRecords'
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
const answers = (overrides: Record<string, unknown> = {}) => ({
  intent: choice('edit_profile'),
  next_intent: choice('none'),
  fully_supported: { type: 'noul', noul: 0.99 },
  unsupported_requirement: { type: 'noul', noul: 0.01 },
  multi_action: { type: 'noul', noul: 0.01 },
  profile_field: choice('address'),
  profile_operation: choice('use_eth', 0.61),
  ...overrides,
})

describe('same-profile Ethereum source and chain destination', () => {
  it('asks for the profile before reusing its existing Ethereum record', () => {
    const query =
      'Make the Polygon address use the Ethereum address from the same profile'
    const result = parseJevAiResponse(
      { answers: answers({ profile_network: choice('coin_2147483785') }) },
      query,
    )
    expect(result?.action).toEqual({
      intent: 'edit_profile',
      section: 'addresses',
      field: 'address',
      operation: 'use_eth',
      addressCoinType: 2147483785,
    })
    if (!result) throw new Error('Expected a profile clarification')
    expect(prepareAiHandoff(result.action)).toMatchObject({
      status: 'needs_input',
      field: 'name',
    })
    expect(buildProfileValueContext(query)).toMatchObject({
      state: query,
      candidates: [],
    })
  })

  it('keeps a confident incompatible main intent rejected for a profile copy request', () => {
    const query =
      'Copy the Ethereum address from juniper.eth into another network record on that profile'
    expect(
      parseJevAiResponse(
        { answers: answers({ intent: choice('manager_action', 0.67) }) },
        query,
      ),
    ).toBeNull()
  })

  it.each([
    ['Use current ETH record for Polygon on juniper.eth', 'Polygon'],
    ['Use the saved Ethereum address for Base on juniper.eth', 'Base'],
    ["Reuse juniper.eth's ETH address for Polygon", 'Polygon'],
    ['Copy the existing ETH record from juniper.eth to Polygon', 'Polygon'],
    ['Use my current Ethereum address on Base for juniper.eth', 'Base'],
    ['Enable Polygon using current ETH record on juniper.eth', 'Polygon'],
    ['Use Base with the same Ethereum address on juniper.eth please', 'Base'],
    ['Use current ETH record as its Polygon address on juniper.eth', 'Polygon'],
    ['Use the ETH record on juniper.eth as its Base record', 'Base'],
    [
      'For juniper.eth, Base should reuse the Ethereum address already saved there',
      'Base',
    ],
    [
      'The Polgyon address on juniper.eth should match its existing Ethereum address',
      'Polygon',
    ],
    [
      'Make the Polygon address on juniper.eth use the Ethereum address from the same profile',
      'Polygon',
    ],
  ])('prepares one exact destination without inventing an address: %s', (query, network) => {
    const coinType = evmChainOptions.find(
      ({ label }) => label === network,
    )?.coinType
    expect(coinType).toBeDefined()
    const result = parseJevAiResponse({ answers: answers() }, query)
    expect(result?.action).toEqual({
      intent: 'edit_profile',
      name: 'juniper.eth',
      section: 'addresses',
      field: 'address',
      operation: 'use_eth',
      addressCoinType: coinType,
    })
    if (result?.action.intent !== 'edit_profile')
      throw new Error('Expected address reuse')
    const prepared = prepareAiHandoff(result.action)
    expect(prepared).toMatchObject({
      status: 'ready',
      action: {
        name: 'juniper.eth',
        section: 'addresses',
        proposal: {
          field: 'address',
          coinType,
          operation: 'use_eth',
          value: '',
        },
      },
    })
    const context = buildProfileValueContext(query)
    expect(context.targetQuery).toContain('juniper.eth')
    expect(context.state).toContain(
      query.includes('Polgyon') ? 'Polgyon' : network,
    )
    expect(context.candidates).toEqual([])
  })

  it('treats an Ethereum source-field answer as source context only when the full reuse syntax agrees', () => {
    const result = parseProfileSection(
      'Use current Ethereum record for Polygon on juniper.eth',
      'juniper.eth',
      answers({ profile_field: choice('eth_address') }),
    )
    expect(result).toMatchObject({
      field: 'address',
      operation: 'use_eth',
      addressCoinType: 2147483785,
    })
    expect(
      parseProfileSection(
        'Change juniper.eth Ethereum address',
        'juniper.eth',
        {
          profile_field: choice('eth_address'),
          profile_operation: choice('set'),
        },
      ),
    ).toMatchObject({ field: 'eth_address' })
  })

  it.each([
    'Use the existing Ethereum address on juniper.eth for another network',
    'Reuse my current ETH record for juniper.eth',
    'Reuse the current Ethereum address on juniper.eth for a different network',
    'Copy the Ethereum address from juniper.eth into another network record on that profile',
  ])('asks for the missing chain using the existing network control: %s', (query) => {
    const result = parseJevAiResponse({ answers: answers() }, query)
    if (!result) throw new Error('Expected missing-network action')
    expect(prepareAiHandoff(result.action)).toMatchObject({
      status: 'needs_input',
      field: 'profileNetwork',
    })
  })

  it('asks for the exact profile when it was not supplied', () => {
    const result = parseJevAiResponse(
      { answers: answers() },
      'Use current ETH record for Polygon on my profile',
    )
    if (!result) throw new Error('Expected missing-name action')
    expect(prepareAiHandoff(result.action)).toMatchObject({
      status: 'needs_input',
      field: 'name',
    })
  })

  it('reads the current ETH value only during native proposal review and preserves other chains', () => {
    const action = parseProfileSection(
      'Use current ETH record for Polygon on juniper.eth',
      'juniper.eth',
    )
    if (!action) throw new Error('Expected reuse action')
    const prepared = prepareProfileAiDetails(action)
    if (prepared.status !== 'ready' || !prepared.proposal)
      throw new Error('Expected reuse proposal')
    expect(
      checkProfileEditProposal(newEmptyProfileRecords(), prepared.proposal),
    ).toContain('valid Ethereum')
    const current = '0x000000000000000000000000000000000000dEaD'
    const base = {
      coinType:
        evmChainOptions.find(({ label }) => label === 'Base')?.coinType ?? 0,
      value: '0x000000000000000000000000000000000000bEEF',
    }
    const records = {
      ...newEmptyProfileRecords(),
      addresses: [{ coinType: 60, value: current }, base],
    }
    expect(checkProfileEditProposal(records, prepared.proposal)).toBeNull()
    expect(
      applyProfileEditProposal(records, prepared.proposal).addresses,
    ).toEqual([
      { coinType: 60, value: current },
      base,
      { coinType: 2147483785, value: current },
    ])
  })

  it.each([
    'Use my Ethereum address from acacia.eth for Polygon on juniper.eth',
    'Copy the ETH record from juniper.eth to Polygon on acacia.eth',
    "Use Satoshi's current ETH record for Polygon on juniper.eth",
    'Use current ETH record for all networks on juniper.eth',
    'Use current ETH record for Polygon and Base on juniper.eth',
    'Use current ETH record for Polygon on juniper.eth but not its saved address',
    'Do not reuse current ETH record for Polygon on juniper.eth',
    'Use current ETH record for Polygon on juniper.eth and change the GitHub contact',
    'Use current ETH record for Polygon on juniper.eth instead of 0x000000000000000000000000000000000000dEaD',
    'Use current ETH record for Polygon on juniper.eth only if its balance is positive',
    'Use current ETH record for Polygon on juniper.eth then copy it to every chain',
  ])('cannot silently change the source, destination, or extra requirement: %s', (query) => {
    expect(
      parseProfileSection(
        query,
        'juniper.eth',
        answers({ profile_operation: choice('use_eth') }),
      ),
    ).toBeNull()
    expect(
      parseJevAiResponse(
        { answers: answers({ profile_operation: choice('use_eth') }) },
        query,
      ),
    ).toBeNull()
  })

  it('rejects a non-EVM destination through the existing native validator', () => {
    const action = parseProfileSection(
      'Use current ETH record for Solana on juniper.eth',
      'juniper.eth',
    )
    if (!action) throw new Error('Expected native network validation')
    expect(prepareProfileAiDetails(action)).toMatchObject({ status: 'invalid' })
  })

  it('keeps source/destination-looking strings private when they are exact replacement values', () => {
    const query =
      'Replace the GitHub contact current-eth-record with polygon-address on juniper.eth'
    const context = buildProfileValueContext(query)
    expect(context.candidates.map(({ value }) => value)).toEqual([
      'current-eth-record',
      'polygon-address',
    ])
    expect(context.state).not.toContain('current-eth-record')
    expect(context.state).not.toContain('polygon-address')
    expect(
      parseProfileSection(query, 'juniper.eth', {
        profile_field: choice('github'),
        profile_operation: choice('replace'),
        profile_value: choice('value_2'),
        profile_previous_value: choice('value_1'),
      }),
    ).toMatchObject({
      field: 'github',
      value: 'polygon-address',
      expectedValue: 'current-eth-record',
    })
  })

  it('does not execute record-source words embedded in a description', () => {
    const query =
      'Set juniper.eth description to "Use current ETH record as its Polygon address"'
    expect(buildProfileValueContext(query).state).toBe(
      'Set juniper.eth description to [PROFILE_VALUE_1]',
    )
    expect(parseProfileSection(query, 'juniper.eth')).toMatchObject({
      field: 'description',
      value: 'Use current ETH record as its Polygon address',
    })
  })

  it.each([
    'For juniper.eth, Base should reuse satoshi’s Ethereum address already saved there',
    'The Polygon address on juniper.eth should match the Ethereum address on another.eth',
    'Make all network addresses on juniper.eth use its Ethereum address',
    'Make the Polygon address on juniper.eth not use its Ethereum address',
    'Make the Polygon address on juniper.eth use its Ethereum address and pin GitHub',
    'For juniper.eth, Base should reuse the Ethereum address already saved there if gas is cheap',
  ])('rejects another source, broader destination, polarity, or extra clauses: %s', (query) => {
    expect(parseProfileSection(query, 'juniper.eth', answers())).toBeNull()
    expect(parseJevAiResponse({ answers: answers() }, query)).toBeNull()
  })

  it('preserves old/new handles before a trailing GitHub contact destination', () => {
    const query =
      'Replace tamarind-old with tamarind-new in the GitHub contact on tamarind.eth'
    const context = buildProfileValueContext(query)
    expect(context.state).toBe(
      'Replace [PROFILE_VALUE_1] with [PROFILE_VALUE_2] in the GitHub contact on tamarind.eth',
    )
    const result = parseJevAiResponse(
      {
        answers: answers({
          profile_field: choice('unknown', 0.62),
          profile_operation: choice('replace', 0.98),
          profile_value: choice('value_2', 0.98),
          profile_previous_value: choice('value_1', 0.73),
        }),
      },
      query,
    )
    if (!result) throw new Error('Expected exact old/new profile replacement')
    expect(prepareAiHandoff(result.action)).toEqual({
      status: 'ready',
      action: {
        intent: 'edit_profile',
        name: 'tamarind.eth',
        section: 'contact',
        proposal: {
          field: 'github',
          expectedValue: 'tamarind-old',
          value: 'tamarind-new',
        },
      },
    })
    expect(
      parseProfileSection(query, 'tamarind.eth', {
        profile_field: choice('github'),
        profile_operation: choice('replace'),
        profile_value: choice('value_1'),
        profile_previous_value: choice('value_2'),
      }),
    ).toBeNull()
  })
})
