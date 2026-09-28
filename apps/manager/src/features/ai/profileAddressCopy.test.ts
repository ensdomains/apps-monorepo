import { describe, expect, it, vi } from 'vitest'
import { transformProfileRecords } from '@/features/profile/utils/transformRecords'
import { type ManagerAction, parseManagerAction } from './managerActions'
import { prepareManagerAction } from './prepareManagerAction'
import {
  buildProfileAddressCopyQuestion,
  hasExplicitAddressCopyOperation,
  loadProfileAddressCopy,
  resolveProfileAddressCopy,
} from './profileAddressCopy'

const choice = (value: string, confidence = 0.99) => ({
  type: 'choice',
  choice: value,
  confidence,
})
const answers = (network: string) => ({
  manager_action: choice('copy_profile_address'),
  manager_constraints: choice('represented'),
  manager_address_network: choice(network),
})
const action = (details: Partial<ManagerAction> = {}): ManagerAction => ({
  intent: 'manager_action',
  kind: 'copy_profile_address',
  ...details,
})
const eth = '0x0000000000000000000000000000000000000001'
const btc = 'bc1qsyntheticstoredaddress'
const records = transformProfileRecords({
  texts: [],
  coins: [
    { coinType: 60, value: eth },
    { coinType: 0, value: btc },
  ],
})

describe('copy a current ENS profile address', () => {
  it.each([
    ['Copy juniper.eth Bitcoin address', 'coin_0', 0],
    [
      'Copy the Ethereum address from juniper.eth to my clipboard',
      'coin_60',
      60,
    ],
    ['Copy juniper.eth Solana address', 'coin_501', 501],
    [
      'Could you please copy the Bitcoin address from juniper.eth to my clipboard?',
      'coin_0',
      0,
    ],
    ["Copy juniper.eth's Bitcoin address.", 'coin_0', 0],
    ["Copy the Bitcoin address from juniper.eth's profile", 'coin_0', 0],
  ] as const)('preserves exact name and native network: %s', (query, network, coinType) => {
    const parsed = parseManagerAction(query, answers(network), ['juniper.eth'])
    expect(parsed).toEqual(
      action({ name: 'juniper.eth', addressCoinType: coinType }),
    )
    if (!parsed) throw new Error('Expected address copy')
    expect(prepareManagerAction(parsed, {})).toEqual({
      status: 'ready',
      action: parsed,
    })
  })

  it('offers only locally identified native network choices without private values', () => {
    const question = buildProfileAddressCopyQuestion(
      'Copy juniper.eth Bitcoin address',
    )
    expect(question.criteria).toMatchObject({ coin_0: 'Bitcoin' })
    expect(question.criteria).not.toHaveProperty('coin_60')
    expect(JSON.stringify(question)).not.toContain('juniper.eth')
  })

  it.each([
    'Copy an address from juniper.eth',
    'Copy a profile address from juniper.eth',
  ])('keeps the exact name while asking which address to copy: %s', (query) => {
    const parsed = parseManagerAction(query, answers('missing'), [
      'juniper.eth',
    ])
    expect(parsed).toEqual(action({ name: 'juniper.eth' }))
    if (!parsed) throw new Error('Expected address network clarification')
    expect(prepareManagerAction(parsed, {})).toMatchObject({
      status: 'needs_input',
      field: 'managerValue',
    })
    expect(prepareManagerAction(parsed, { managerValue: '0' })).toEqual({
      status: 'ready',
      action: action({ name: 'juniper.eth', addressCoinType: 0 }),
    })
  })

  it.each([
    'Copy an address from juniper.eth and favourite it',
    'Copy an address from juniper.eth to a friend',
    'Copy a profile address from juniper.eth if it exists',
    'Copy an address from juniper.eth for a',
  ])('does not accept extra clauses after an indefinite article: %s', (query) => {
    expect(
      parseManagerAction(query, answers('missing'), ['juniper.eth']),
    ).toBeNull()
  })

  it.each([
    'coin_60',
    'missing',
    'unsupported',
  ])('rejects %s evidence contradicting explicit Bitcoin', (network) => {
    expect(
      parseManagerAction('Copy juniper.eth Bitcoin address', answers(network), [
        'juniper.eth',
      ]),
    ).toBeNull()
  })

  it.each([
    0.2,
    Number.NaN,
    1.1,
  ])('rejects uncertain or malformed applicable network evidence %s', (confidence) => {
    expect(
      parseManagerAction(
        'Copy juniper.eth Bitcoin address',
        {
          ...answers('coin_0'),
          manager_address_network: choice('coin_0', confidence),
        },
        ['juniper.eth'],
      ),
    ).toBeNull()
  })

  it.each([
    'Copy juniper.eth Bitcoin and Ethereum addresses',
    'Copy juniper.eth Bitcoin address into its Ethereum record',
    'Copy juniper.eth Bitcoin address to another profile',
    'Copy juniper.eth Bitcoin address to my friend',
    'Copy juniper.eth Bitcoin address if gas is cheap',
    'Copy juniper.eth Bitcoin address tomorrow',
    'Copy the Ethereum address from juniper.eth and favourite it',
    'Copy juniper.eth Bitcoin address but use my wallet if missing',
    'Copy juniper.eth Bitcoin address with a QR code',
    'Copy juniper.eth Bitcoin address after checking the balance',
    'Copy juniper.eth Bitcoin address for',
  ])('does not drop another network, destination, or condition: %s', (query) => {
    expect(
      parseManagerAction(query, answers('coin_0'), ['juniper.eth']),
    ).toBeNull()
  })

  it('requires an explicit main-address request instead of inventing a network', () => {
    expect(
      parseManagerAction(
        'Copy juniper.eth main receiving address',
        answers('main'),
        ['juniper.eth'],
      ),
    ).toEqual(action({ name: 'juniper.eth', mainReceivingAddress: true }))
    expect(
      parseManagerAction('Copy juniper.eth address', answers('main'), [
        'juniper.eth',
      ]),
    ).toBeNull()
  })

  it('asks for a missing name, then a missing network without falling back to the wallet', () => {
    const initial = action()
    expect(prepareManagerAction(initial, {})).toMatchObject({
      status: 'needs_input',
      field: 'name',
    })
    const named = action({ name: 'juniper.eth' })
    expect(prepareManagerAction(named, {})).toMatchObject({
      status: 'needs_input',
      field: 'managerValue',
    })
    expect(prepareManagerAction(named, { managerValue: '0' })).toEqual({
      status: 'ready',
      action: { ...named, addressCoinType: 0 },
    })
    expect(prepareManagerAction(named, { managerValue: 'main' })).toEqual({
      status: 'ready',
      action: { ...named, mainReceivingAddress: true },
    })
    expect(
      prepareManagerAction(named, { managerValue: 'connected wallet' }),
    ).toMatchObject({ status: 'invalid' })
  })

  it('keeps exact-name alternatives constrained during continuation', () => {
    const alternatives = action({
      nameCandidates: ['juniper.eth', 'acacia.eth'],
    })
    expect(
      prepareManagerAction(alternatives, {
        name: 'other.eth',
        managerValue: '60',
      }),
    ).toMatchObject({ status: 'invalid' })
    expect(
      prepareManagerAction(alternatives, {
        name: 'acacia.eth',
        managerValue: '60',
      }),
    ).toMatchObject({
      status: 'ready',
      action: { name: 'acacia.eth', addressCoinType: 60 },
    })
  })

  it('uses the requested current record and reports an absent network without a fallback', () => {
    expect(resolveProfileAddressCopy(records, { addressCoinType: 0 })).toEqual({
      status: 'ready',
      value: btc,
      network: 'Bitcoin',
    })
    expect(resolveProfileAddressCopy(records, { addressCoinType: 60 })).toEqual(
      { status: 'ready', value: eth, network: 'Ethereum' },
    )
    expect(
      resolveProfileAddressCopy(records, { addressCoinType: 501 }).status,
    ).toBe('unavailable')
    expect(resolveProfileAddressCopy(records, {}).status).toBe('unavailable')
    expect(
      resolveProfileAddressCopy(records, {
        addressCoinType: 60,
        mainReceivingAddress: true,
      }).status,
    ).toBe('unavailable')
  })

  it('retains the native main receiving address behavior only when explicitly requested', () => {
    expect(
      resolveProfileAddressCopy(records, { mainReceivingAddress: true }),
    ).toEqual({
      status: 'ready',
      value: eth,
      network: 'Main receiving address',
    })
  })

  it('fetches the exact selected name and rejects a session change while loading', async () => {
    let current = true
    let finish: (value: typeof records) => void = () => undefined
    const readRecords = vi.fn(
      () =>
        new Promise<typeof records>((resolve) => {
          finish = resolve
        }),
    )
    const pending = loadProfileAddressCopy(
      { name: 'juniper.eth', addressCoinType: 0 },
      {
        assertCurrent: () => {
          if (!current) throw new Error('Session changed')
        },
        readRecords,
      },
    )
    const rejected = expect(pending).rejects.toThrow('Session changed')
    expect(readRecords).toHaveBeenCalledExactlyOnceWith('juniper.eth')
    current = false
    finish(records)
    await rejected
  })

  it('separates clipboard copying from copying into a record', () => {
    expect(
      hasExplicitAddressCopyOperation(
        'Copy the Bitcoin address of juniper.eth',
      ),
    ).toBe(true)
    expect(
      hasExplicitAddressCopyOperation(
        'Copy the Ethereum address into the Polygon record on juniper.eth',
      ),
    ).toBe(false)
  })
})
