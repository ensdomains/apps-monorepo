import { describe, expect, it } from 'vitest'
import {
  getExplicitNameAction,
  hasExplicitNameActionConflict,
  hasProfileActionConflict,
  isExplicitlyExcludedAiTarget,
} from './actionSafety'
import { parseJevAiResponse } from './intent'
import { prepareAiHandoff } from './prepareAiHandoff'

describe('explicit action and target safeguards', () => {
  const choice = (value: string, confidence = 0.99) => ({
    type: 'choice',
    choice: value,
    confidence,
  })
  const profileAnswers = {
    profile_field: choice('eth_address'),
    profile_operation: choice('set'),
  }

  const addressCopyAnswers = {
    intent: choice('manager_action'),
    manager_action: choice('copy_profile_address'),
    manager_constraints: choice('represented'),
    manager_address_network: choice('coin_60'),
    fully_supported: { type: 'noul', noul: 0.99 },
    unsupported_requirement: { type: 'noul', noul: 0.01 },
    multi_action: { type: 'noul', noul: 0.01 },
    request_mode: choice('requested'),
    action_count: choice('one'),
    next_intent: choice('none'),
    ...profileAnswers,
  }

  it('keeps explicit clipboard copying separate from profile-record assignment metadata', () => {
    const query =
      "Copy the Ethereum address from pookie.eth's profile to my clipboard"
    expect(
      hasProfileActionConflict(query, 'manager_action', addressCopyAnswers),
    ).toBe(false)
    const result = parseJevAiResponse({ answers: addressCopyAnswers }, query)
    expect(result?.action).toEqual({
      intent: 'manager_action',
      kind: 'copy_profile_address',
      name: 'pookie.eth',
      addressCoinType: 60,
    })
    if (!result) throw new Error('Expected a clipboard review action')
    expect(prepareAiHandoff(result.action)).toMatchObject({
      status: 'ready',
      action: { name: 'pookie.eth', addressCoinType: 60 },
    })
  })

  it.each([
    'Copy the Ethereum address from pookie.eth into the Polygon record',
    'Copy the Ethereum address from pookie.eth to bob.eth',
    'Copy the Ethereum address from pookie.eth and favourite it',
    'Copy the Ethereum address from pookie.eth but use my wallet if it is missing',
  ])('cannot reduce a different or compound request to clipboard copying: %s', (query) => {
    expect(
      parseJevAiResponse({ answers: addressCopyAnswers }, query),
    ).toBeNull()
  })

  it.each([
    [
      'Put the owner address of pookie.eth on my clipboard',
      'copy_profile_owner',
    ],
    ["Copy the owner address of pookie.eth's profile", 'copy_profile_owner'],
    ['Open my current primary name profile', 'view_primary_profile'],
  ] as const)('preserves the native read despite irrelevant profile mutation metadata: %s', (query, kind) => {
    const answers = {
      ...addressCopyAnswers,
      manager_action: choice(kind),
    }
    const result = parseJevAiResponse({ answers }, query)
    expect(result?.action).toMatchObject({ intent: 'manager_action', kind })
    if (!result) throw new Error('Expected a native profile review')
    expect(prepareAiHandoff(result.action)).toMatchObject({ status: 'ready' })
  })

  it.each([
    'Put the owner address of pookie.eth into its Ethereum record',
    'Copy the owner address of pookie.eth into bob.eth',
    'Copy the owner address of pookie.eth and renew it',
    'Copy the owner receiving address of pookie.eth',
    'Do not copy the owner address of pookie.eth',
  ])('does not bypass profile safeguards for a non-clipboard owner request: %s', (query) => {
    expect(
      parseJevAiResponse(
        {
          answers: {
            ...addressCopyAnswers,
            manager_action: choice('copy_profile_owner'),
          },
        },
        query,
      ),
    ).toBeNull()
  })

  it.each([
    'Unstar the twiter account for bluefern.eth',
    'Unpin bluefern.eth Twitter contact',
    'Remove the Twitter record on bluefern.eth',
    'Edit the social account on bluefern.eth',
    'Unstar the Myspace account for bluefern.eth',
    'Star Twitter for bluefern.eth',
    'Pin bluefern.eth GitHub',
    'Put a star on the Bitcoin address for bluefern.eth',
    'Take the star off the Solana address on bluefern.eth',
    'Star the wallet address in bluefern.eth',
    'Unpin the addresses on bluefern.eth',
    'Bookmark the GitHub account on bluefern.eth',
    'Save the GitHub contact on bluefern.eth to favourites',
    'Unstar Telegarm on bluefern.eth',
    'Unstar instgram on bluefern.eth',
    'Put a star on Myspace for bluefern.eth',
    'Take the star off Myspace for bluefern.eth',
    'Star my resolver for bluefern.eth',
  ])('never substitutes name favourites for a profile resource operation: %s', (query) => {
    expect(hasProfileActionConflict(query, 'favorite')).toBe(true)
    expect(
      hasProfileActionConflict(query, 'manager_action', {
        manager_action: choice('unfavorite'),
      }),
    ).toBe(true)
  })

  it('rejects a captured address-field feature request instead of favouriting the name', () => {
    const result = parseJevAiResponse(
      {
        answers: {
          ...addressCopyAnswers,
          intent: choice('favorite', 0.85),
          profile_field: choice('address', 0.77),
          profile_network: choice('coin_0', 0.94),
          profile_operation: choice('feature', 0.72),
          fully_supported: { type: 'noul', noul: 0.75 },
          unsupported_requirement: { type: 'noul', noul: 0.29 },
        },
      },
      'Put a star on the Bitcoin address for alderleaf.eth',
    )
    expect(result).toBeNull()
  })

  it.each([
    'Star bluefern.eth',
    'Unstar bluefern.eth',
    'Unstar twiter.eth',
    'Star bitcoin.eth',
    'Unstar wallet.eth',
    'Star addresses.eth',
    'Bookmark bluefern.eth',
    'Save bluefern.eth to favourites',
    'Unstar telegarm.eth',
    'Star bluefern.eth in my wallet',
    'Put a star on bluefern.eth',
    'Put a star on the bluefern.eth name',
  ])('keeps bare name starring distinct: %s', (query) => {
    expect(hasProfileActionConflict(query, 'favorite')).toBe(false)
    expect(
      hasProfileActionConflict(query, 'manager_action', {
        manager_action: choice('unfavorite'),
      }),
    ).toBe(false)
  })

  it('retains native account contact-method actions', () => {
    expect(
      hasProfileActionConflict('Remove my email contact', 'manager_action', {
        manager_action: choice('email_remove'),
      }),
    ).toBe(false)
  })

  it.each([
    'Set pookie.eth Ethereum address',
    'Change the Ethereum address on pookie.eth',
    'Set the avatar of pookie.eth',
    'Update pookie.eth email',
    'Change the GitHub of my primary name',
    'Set pookie.eth bio to "make me primary"',
  ])('blocks conflicting classification of an explicit profile assignment: %s', (query) => {
    expect(hasProfileActionConflict(query, 'set_primary', profileAnswers)).toBe(
      true,
    )
    expect(
      hasProfileActionConflict(query, 'edit_profile', profileAnswers),
    ).toBe(false)
  })

  it('uses confident profile details only with actual profile context', () => {
    const answers = {
      profile_field: choice('github'),
      profile_operation: choice('set'),
    }
    expect(
      hasProfileActionConflict('Set pookie.eth githb', 'set_primary', answers),
    ).toBe(true)
    expect(
      hasProfileActionConflict('Show github.eth', 'view_name', answers),
    ).toBe(false)
    expect(
      hasProfileActionConflict('Show pookie.eth', 'view_name', answers),
    ).toBe(false)
    expect(
      hasProfileActionConflict('Open pookie.eth', 'view_name', {
        ...answers,
        profile_operation: choice('none'),
      }),
    ).toBe(false)
    expect(
      hasProfileActionConflict('Set pookie.eth githb', 'set_primary', {
        ...answers,
        profile_field: choice('github', 0.1),
      }),
    ).toBe(false)
  })

  it.each([
    'Set pookie.eth as primary name',
    'Set my primary name to pookie.eth',
    'Use pookie.eth as my reverse name',
    'Make pookie.eth my main name',
    'Set my primary name for my Ethereum address to pookie.eth',
    'Set github.eth as primary',
    'Set avatar.eth as primary',
  ])('keeps explicit primary-name requests distinct from profile fields: %s', (query) => {
    expect(hasProfileActionConflict(query, 'set_primary', profileAnswers)).toBe(
      false,
    )
  })

  it('never prepares a primary-name action for the observed missing Ethereum-address request', () => {
    const query = 'Set pookie.eth Ethereum address'
    const answers = {
      fully_supported: { type: 'noul', noul: 0.95 },
      unsupported_requirement: { type: 'noul', noul: 0.05 },
      multi_action: { type: 'noul', noul: 0.05 },
      next_intent: choice('none'),
      request_mode: choice('requested'),
      action_count: choice('one'),
      profile_field: choice('eth_address', 0.98),
      profile_operation: choice('set', 0.97),
      profile_value: choice('none'),
      profile_previous_value: choice('none'),
    }
    expect(
      parseJevAiResponse(
        { answers: { ...answers, intent: choice('set_primary', 0.58) } },
        query,
      ),
    ).toBeNull()
    expect(
      parseJevAiResponse(
        { answers: { ...answers, intent: choice('set_primary', 1) } },
        query,
      ),
    ).toBeNull()
    const correct = parseJevAiResponse(
      { answers: { ...answers, intent: choice('edit_profile') } },
      query,
    )
    expect(correct?.action).toMatchObject({
      intent: 'edit_profile',
      field: 'eth_address',
      name: 'pookie.eth',
    })
    if (!correct) throw new Error('Expected a profile value clarification')
    expect(prepareAiHandoff(correct.action)).toMatchObject({
      status: 'needs_input',
      field: 'profileValue',
      label: 'Ethereum address',
    })
  })
  it.each([
    'Set alice.eth as primary, not bob.eth',
    'Use alice.eth instead of bob.eth',
    'Choose alice.eth rather than bob.eth',
    'Set my primary except bob.eth',
    'Set alice.eth as primary without using bob.eth',
    'Set alice.eth as primary excluding the name bob.eth',
  ])('blocks the excluded name even when a model selects it: %s', (query) => {
    const optimisticModelTarget = { name: 'bob.eth', confidence: 1 }
    expect(
      isExplicitlyExcludedAiTarget(query, optimisticModelTarget.name),
    ).toBe(true)
    expect(isExplicitlyExcludedAiTarget(query, 'alice.eth')).toBe(false)
  })

  it('normalizes case and punctuation without changing which name is excluded', () => {
    expect(
      isExplicitlyExcludedAiTarget('Use alice.eth, not "BOB.eth".', 'bob.eth'),
    ).toBe(true)
    expect(
      isExplicitlyExcludedAiTarget('Use alice.eth, not 😎.eth', '😎.eth'),
    ).toBe(true)
    expect(
      isExplicitlyExcludedAiTarget('Use alice.eth, not sub.bob.eth', 'bob.eth'),
    ).toBe(false)
    expect(
      isExplicitlyExcludedAiTarget('Use bob.eth, not bbo.eth', 'bob.eth'),
    ).toBe(false)
  })

  it.each([
    ['Register pookie.eth for 69 days', 'register'],
    ['Please buy pookie.eth for one year', 'register'],
    ['Can you get me pookie.eth for 69 days?', 'register'],
    ['Get pookie.eth for 69 days', 'register'],
    ['Claim pookie.eth for a year', 'register'],
    ['Renew pookie.eth for 10 days', 'renew'],
    ['Please extend pookie.eth another ten days', 'renew'],
  ] as const)('keeps an explicit named action grounded: %s', (query, intent) => {
    expect(getExplicitNameAction(query)).toBe(intent)
    expect(hasExplicitNameActionConflict(query, intent)).toBe(false)
    expect(
      hasExplicitNameActionConflict(
        query,
        intent === 'renew' ? 'register' : 'renew',
      ),
    ).toBe(true)
  })

  it.each([
    'Get pookie.eth renewed for another 10 days',
    'Get pookie.eth set as primary',
    'I wanna keep pookie.eth for 10 more days',
    'plz extnd pookie.eth fr anothr 10 days',
    'Register a name',
  ])('leaves paraphrases without an explicit conflict to semantic interpretation: %s', (query) => {
    expect(getExplicitNameAction(query)).toBeNull()
    expect(hasExplicitNameActionConflict(query, 'renew')).toBe(false)
  })

  it('does not reinterpret other action families or subname prefixes', () => {
    expect(
      hasExplicitNameActionConflict(
        'Get pookie.eth set as primary',
        'set_primary',
      ),
    ).toBe(false)
    expect(
      isExplicitlyExcludedAiTarget(
        'Open pookie.eth, not sub.pookie.eth',
        'pookie.eth',
      ),
    ).toBe(false)
  })
})
