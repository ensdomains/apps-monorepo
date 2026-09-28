import { zeroAddress } from 'viem'
import { assert, describe, expect, it, vi } from 'vitest'
import { parseJevAiResponse } from './intent'
import {
  type ManagerActionKind,
  parseManagerAction,
  prepareManagerAction,
} from './managerActions'
import {
  hasCompletePrimaryProfileRequest,
  hasCompleteProfileOwnerCopyRequest,
  hasCompleteProfileOwnerViewRequest,
  loadPrimaryProfile,
  loadProfileOwner,
  matchesPrimaryProfileWallet,
} from './profileNativeRead'

const wallet = '0x1111111111111111111111111111111111111111'
const owner = '0x2222222222222222222222222222222222222222'
const choice = (value: string) => ({
  type: 'choice',
  choice: value,
  confidence: 0.99,
})
const answers = (kind: ManagerActionKind) => ({
  manager_action: choice(kind),
  manager_constraints: choice('represented'),
})

describe('current primary-name profile', () => {
  it.each([
    'Open my primary name profile',
    'Show me my primary name',
    'Could you please view my current primary profile?',
    'Take me to my primary name profile',
    'Open the primary name profile for my connected wallet',
    'View the current primary profile of the connected account',
    'Open the profile for my currently set primary ENS name',
    'Show the profile of my existing primary name',
    'Open the profile for the primary ENS name on my connected wallet',
  ])('preserves only the connected-account target: %s', (query) => {
    expect(hasCompletePrimaryProfileRequest(query)).toBe(true)
    const action = parseManagerAction(
      query,
      answers('view_primary_profile'),
      [],
    )
    expect(action).toEqual({
      intent: 'manager_action',
      kind: 'view_primary_profile',
    })
    assert(action)
    expect(prepareManagerAction(action, {})).toEqual({
      status: 'ready',
      action,
    })
  })

  it.each([
    'Open primary name profile',
    "Open my friend's primary name profile",
    'Set my primary name',
    'Do not open my primary name profile',
    'Open my primary name profile and copy its address',
    'Open my primary name profile if gas is cheap',
    'Open my primary name profile tomorrow',
    'Open my primary name profile on Base',
    'Open the profile for my previously set primary ENS name',
    'Open the profile for my currently set primary ENS name and renew it',
    'Open the profile for her currently set primary ENS name',
    'Open my primary name profile instead of juniper.eth',
    `Open the primary name profile for ${owner}`,
  ])('rejects extra or changed targets despite optimistic metadata: %s', (query) => {
    expect(
      parseManagerAction(query, answers('view_primary_profile'), []),
    ).toBeNull()
  })

  it('reads the exact connected account and normalizes its verified current primary', async () => {
    const readPrimaryName = vi.fn().mockResolvedValue('JUNIPER.eth')
    const assertCurrent = vi.fn()
    expect(
      await loadPrimaryProfile(wallet, { readPrimaryName, assertCurrent }),
    ).toEqual({ status: 'ready', name: 'juniper.eth' })
    expect(readPrimaryName).toHaveBeenCalledExactlyOnceWith(wallet)
    expect(assertCurrent).toHaveBeenCalledTimes(2)
  })

  it('does not choose a fallback when a primary name is absent', async () => {
    expect(
      await loadPrimaryProfile(wallet, {
        assertCurrent: vi.fn(),
        readPrimaryName: async () => null,
      }),
    ).toMatchObject({
      status: 'unavailable',
      message: expect.stringContaining('does not have'),
    })
    const readPrimaryName = vi.fn()
    expect(
      await loadPrimaryProfile(undefined, {
        assertCurrent: vi.fn(),
        readPrimaryName,
      }),
    ).toMatchObject({ status: 'unavailable' })
    expect(readPrimaryName).not.toHaveBeenCalled()
  })

  it('keeps lookup failure distinct from no primary', async () => {
    await expect(
      loadPrimaryProfile(wallet, {
        assertCurrent: vi.fn(),
        readPrimaryName: async () => {
          throw new Error('RPC failed')
        },
      }),
    ).rejects.toThrow('RPC failed')
  })
})

describe('copy exact current profile owner', () => {
  it.each([
    'Copy the owner address of juniper.eth',
    "Copy juniper.eth's current owner wallet address",
    'Put the owner address of juniper.eth on my clipboard',
    'Please copy the owner of juniper.eth to my clipboard',
    'Put the address that owns juniper.eth on my clipboard',
    'Copy the wallet address which currently owns juniper.eth',
  ])('retains the requested name: %s', (query) => {
    expect(hasCompleteProfileOwnerCopyRequest(query)).toBe(true)
    const action = parseManagerAction(query, answers('copy_profile_owner'), [
      'juniper.eth',
    ])
    expect(action).toEqual({
      intent: 'manager_action',
      kind: 'copy_profile_owner',
      name: 'juniper.eth',
    })
    assert(action)
    expect(prepareManagerAction(action, {})).toEqual({
      status: 'ready',
      action,
    })
  })

  it('asks for a missing name without using the wallet or primary name', () => {
    const action = parseManagerAction(
      'Copy the owner address',
      answers('copy_profile_owner'),
      [],
    )
    expect(action).toEqual({
      intent: 'manager_action',
      kind: 'copy_profile_owner',
      name: undefined,
    })
    assert(action)
    expect(prepareManagerAction(action, {})).toMatchObject({
      status: 'needs_input',
      field: 'name',
    })
    assert(action)
    expect(prepareManagerAction(action, { name: 'JUNIPER.eth' })).toEqual({
      status: 'ready',
      action: { ...action, name: 'juniper.eth' },
    })
  })

  it('retains a missing generic ENS-name target expressed with a possessive', () => {
    const action = parseManagerAction(
      "Could you copy an ENS name's owner address?",
      answers('copy_profile_owner'),
      [],
    )
    expect(action).toMatchObject({
      intent: 'manager_action',
      kind: 'copy_profile_owner',
    })
    assert(action)
    expect(prepareManagerAction(action, {})).toMatchObject({
      status: 'needs_input',
      field: 'name',
    })
  })

  it.each([
    'Copy the previous owner of juniper.eth',
    'Put the address that owns juniper.eth on my clipboard and favourite it',
    'Copy the address that previously owned juniper.eth',
    "Copy an ENS name's owner address into my Ethereum record",
    "Copy the owner's ENS name for juniper.eth",
    'Copy the owner address of my wallet',
    'Copy the manager address of juniper.eth',
    'Copy the owner receiving address of juniper.eth',
    'Copy the owner of juniper.eth and favourite it',
    'Copy the owner of juniper.eth if it exists',
    'Copy the owner of juniper.eth to my friend',
    'Copy the owner of juniper.eth into cedar.eth',
    'Copy the owner of juniper.eth and cedar.eth',
    'Copy the owner of juniper.eth using my wallet if missing',
    'Do not copy the owner of juniper.eth',
  ])('rejects a changed resource, recipient, or additional operation: %s', (query) => {
    expect(
      parseManagerAction(query, answers('copy_profile_owner'), ['juniper.eth']),
    ).toBeNull()
  })

  it('clarifies exact name alternatives and rejects a third name', () => {
    const action = parseManagerAction(
      'Copy the owner of juniper.eth or cedar.eth',
      answers('copy_profile_owner'),
      ['juniper.eth', 'cedar.eth'],
    )
    expect(action?.nameCandidates).toEqual(['juniper.eth', 'cedar.eth'])
    assert(action)
    expect(prepareManagerAction(action, {})).toMatchObject({
      status: 'needs_input',
      field: 'name',
    })
    assert(action)
    expect(prepareManagerAction(action, { name: 'other.eth' }).status).toBe(
      'invalid',
    )
  })

  it.each([
    'v1',
    'v2',
  ] as const)('reads %s ownership without wallet or resolver substitution', async (protocol) => {
    const readOwner = vi.fn().mockResolvedValue({ owner, protocol })
    expect(
      await loadProfileOwner('JUNIPER.eth', {
        assertCurrent: vi.fn(),
        readOwner,
      }),
    ).toEqual({ status: 'ready', name: 'juniper.eth', address: owner })
    expect(readOwner).toHaveBeenCalledExactlyOnceWith('juniper.eth')
  })

  it.each([
    null,
    { protocol: 'v2' as const, owner: undefined },
    { protocol: 'v1' as const, owner: zeroAddress },
  ])('does not substitute an unavailable owner: %s', async (result) => {
    expect(
      await loadProfileOwner('juniper.eth', {
        assertCurrent: vi.fn(),
        readOwner: async () => result,
      }),
    ).toMatchObject({ status: 'unavailable' })
  })

  it('rejects an invalid exact name before any read', async () => {
    const readOwner = vi.fn()
    expect(
      await loadProfileOwner('invalid', { assertCurrent: vi.fn(), readOwner }),
    ).toMatchObject({ status: 'unavailable' })
    expect(readOwner).not.toHaveBeenCalled()
  })
})

describe('read the current owner without copying', () => {
  it.each([
    'who owns pookie.eth?',
    'Who currently owns pookie.eth?',
    "Who is pookie.eth's owner?",
    'What is the owner of pookie.eth?',
    "What's the current owner of pookie.eth?",
    'Show me the owner of pookie.eth',
  ])('prepares an exact read-only owner question: %s', (query) => {
    expect(hasCompleteProfileOwnerViewRequest(query)).toBe(true)
    const action = parseManagerAction(query, answers('view_profile_owner'), [
      'pookie.eth',
    ])
    expect(action).toEqual({
      intent: 'manager_action',
      kind: 'view_profile_owner',
      name: 'pookie.eth',
    })
    assert(action)
    expect(prepareManagerAction(action, {})).toMatchObject({ status: 'ready' })
  })

  it('asks for a missing name while retaining the owner lookup', () => {
    const action = parseManagerAction(
      'Who owns this ENS name?',
      answers('view_profile_owner'),
      [],
    )
    expect(action).toMatchObject({
      intent: 'manager_action',
      kind: 'view_profile_owner',
    })
    assert(action)
    expect(prepareManagerAction(action, {})).toMatchObject({
      status: 'needs_input',
      field: 'name',
    })
    expect(prepareManagerAction(action, { name: 'pookie.eth' })).toMatchObject({
      status: 'ready',
      action: { name: 'pookie.eth' },
    })
  })

  it.each([
    'Who used to own pookie.eth?',
    'Who manages pookie.eth?',
    'Who owns pookie.eth and renew it?',
    'Who owns pookie.eth if it expires?',
    'Who owns pookie.eth in 2020?',
    'Who owns the Bitcoin address of pookie.eth?',
    'Who owns pookie.eth or another.eth?',
    'Who owns pookie.eth and another.eth?',
    'Who owns my connected wallet?',
    'Who owns pookie.eth and copy the address?',
  ])('rejects a different or compound lookup: %s', (query) => {
    expect(
      parseManagerAction(query, answers('view_profile_owner'), ['pookie.eth']),
    ).toBeNull()
  })

  it('keeps the question distinct from clipboard copying', () => {
    expect(
      parseManagerAction(
        'who owns pookie.eth?',
        answers('copy_profile_owner'),
        ['pookie.eth'],
      ),
    ).toBeNull()
    expect(
      parseManagerAction(
        'Copy the owner address of pookie.eth',
        answers('view_profile_owner'),
        ['pookie.eth'],
      ),
    ).toBeNull()
  })

  it('routes a confident model disagreement to the exact read-only question', () => {
    const interpreted = parseJevAiResponse(
      {
        answers: {
          ...answers('view_profile_owner'),
          intent: { ...choice('view_name'), confidence: 0.8 },
          fully_supported: { type: 'noul', noul: 0.99 },
          unsupported_requirement: { type: 'noul', noul: 0.01 },
          request_mode: choice('requested'),
          action_count: choice('one'),
          multi_action: { type: 'noul', noul: 0.01 },
          next_intent: choice('none'),
          profile_field: choice('none'),
          profile_operation: choice('none'),
        },
      },
      'who owns pookie.eth?',
    )
    expect(interpreted?.action).toMatchObject({
      intent: 'manager_action',
      kind: 'view_profile_owner',
      name: 'pookie.eth',
    })
  })
})

describe('native read session boundary', () => {
  it('rejects a stale machine owner even before React observes the wallet change', () => {
    expect(matchesPrimaryProfileWallet(wallet, wallet)).toBe(true)
    expect(matchesPrimaryProfileWallet(owner, wallet)).toBe(false)
    expect(matchesPrimaryProfileWallet(wallet, owner)).toBe(false)
    expect(matchesPrimaryProfileWallet(undefined, wallet)).toBe(false)
    expect(matchesPrimaryProfileWallet(undefined, undefined)).toBe(false)
  })
  it.each([
    'primary',
    'owner',
  ] as const)('discards pending %s data after a session change', async (kind) => {
    let current = true
    let resolve: (() => void) | undefined
    const pending = new Promise<void>((done) => {
      resolve = done
    })
    const assertCurrent = () => {
      if (!current) throw new Error('Session changed')
    }
    const operation =
      kind === 'primary'
        ? loadPrimaryProfile(wallet, {
            assertCurrent,
            readPrimaryName: async () => {
              await pending
              return 'juniper.eth'
            },
          })
        : loadProfileOwner('juniper.eth', {
            assertCurrent,
            readOwner: async () => {
              await pending
              return { owner, protocol: 'v2' }
            },
          })
    current = false
    resolve?.()
    await expect(operation).rejects.toThrow('Session changed')
  })
})

describe('native read interpretation handoffs', () => {
  it.each([
    [
      'Open the profile for my currently set primary ENS name',
      'view_primary_profile',
      'view_name',
      undefined,
    ],
    [
      'Put the address that owns pinegrove.eth on my clipboard',
      'copy_profile_owner',
      'manager_action',
      'pinegrove.eth',
    ],
    [
      "Could you copy an ENS name's owner address?",
      'copy_profile_owner',
      'manager_action',
      undefined,
    ],
  ] as const)('retains native action and target through interpretation: %s', (query, kind, intent, name) => {
    const interpreted = parseJevAiResponse(
      {
        answers: {
          ...answers(kind),
          intent: {
            ...choice(intent),
            confidence: intent === 'view_name' ? 0.63 : 0.99,
          },
          fully_supported: { type: 'noul', noul: 0.99 },
          unsupported_requirement: { type: 'noul', noul: 0.01 },
          request_mode: choice('requested'),
          action_count: choice('one'),
          multi_action: { type: 'noul', noul: 0.01 },
          next_intent: choice('none'),
          profile_field: choice('none'),
          profile_operation: choice(
            kind === 'view_primary_profile' ? 'open' : 'none',
          ),
        },
      },
      query,
    )
    expect(interpreted?.action).toMatchObject({
      intent: 'manager_action',
      kind,
    })
    assert(interpreted?.action.intent === 'manager_action')
    const prepared = prepareManagerAction(interpreted.action, {})
    if (kind === 'copy_profile_owner' && !name)
      expect(prepared).toMatchObject({ status: 'needs_input', field: 'name' })
    else
      expect(prepared).toMatchObject({
        status: 'ready',
        action: { kind, ...(name ? { name } : {}) },
      })
  })
})
