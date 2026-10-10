import type { EventRow, NameHistoryRow } from '@ens-apps/indexer/bigname'
import { describe, expect, it } from 'vitest'
import { chain } from '@/config'
import { TOKENS } from '@/lib/tokens'
import {
  mockHistoryRegistration,
  mockHistoryRegistrationPayment,
  mockHistoryRenewalPayment,
} from '@/test-utils/bigname/bigname.mock'
import { formatHistoryAmount, withoutDuplicateCharges } from './historyPayment'

const USDC = { chain_id: chain.id, address: TOKENS.USDC.address.toLowerCase() }
const DAI = { chain_id: chain.id, address: TOKENS.DAI.address.toLowerCase() }
const UNKNOWN_TOKEN = '0x9999999999999999999999999999999999999999'

describe('formatHistoryAmount', () => {
  it('reads an ENSv1 amount as ETH from wei', () => {
    const { data } = mockHistoryRenewalPayment
    expect(formatHistoryAmount('cost', data.cost, data)).toBe(
      '0.00312500000000349 ETH',
    )
  })

  it("reads an ENSv2 amount in its payment token's own decimals and symbol", () => {
    const data = { ...mockHistoryRegistrationPayment.data, payment_token: USDC }
    expect(formatHistoryAmount('base_cost', data.base_cost, data)).toBe(
      '5 USDC',
    )
    // An explicit zero is a served value, not an absence.
    expect(formatHistoryAmount('premium', data.premium, data)).toBe('0 USDC')
    expect(
      formatHistoryAmount('cost', '1500000000000000000', {
        payment_token: DAI,
      }),
    ).toBe('1.5 DAI')
  })

  it('reads the fixture payment token, Sepolia USDC, when the app targets Sepolia', () => {
    const { data } = mockHistoryRegistrationPayment
    expect(formatHistoryAmount('base_cost', data.base_cost, data)).toBe(
      data.payment_token.address === USDC.address &&
        data.payment_token.chain_id === USDC.chain_id
        ? '5 USDC'
        : `5000000 units of ${data.payment_token.address}`,
    )
  })

  it('never guesses the decimals of a token it does not know', () => {
    expect(
      formatHistoryAmount('cost', '5000000', {
        payment_token: { chain_id: chain.id, address: UNKNOWN_TOKEN },
      }),
    ).toBe(`5000000 units of ${UNKNOWN_TOKEN}`)
    // The same address on another chain is another token.
    expect(
      formatHistoryAmount('cost', '5000000', {
        payment_token: { ...USDC, chain_id: chain.id + 1 },
      }),
    ).toBe(`5000000 units of ${USDC.address}`)
  })

  it('leaves an ENSv2 amount that names no token as served', () => {
    expect(
      formatHistoryAmount('cost', '5000000', { canonical_id: '12' }),
    ).toBeUndefined()
    expect(
      formatHistoryAmount('cost', '5000000', { token_id: '12' }),
    ).toBeUndefined()
  })

  it('leaves every other field, and a value that is not an amount, alone', () => {
    expect(formatHistoryAmount('expires_at', '1798608633', {})).toBeUndefined()
    expect(formatHistoryAmount('referrer', '0x00', {})).toBeUndefined()
    expect(formatHistoryAmount('cost', '-1', {})).toBeUndefined()
    expect(formatHistoryAmount('cost', 5, {})).toBeUndefined()
  })
})

const registered = mockHistoryRegistrationPayment
const linked = {
  ...registered,
  id: 'b'.repeat(64),
  log_index: 43,
  kind: 'RegistrationGranted',
  data: { ...registered.data, action_role: 'linked' },
} as const satisfies NameHistoryRow

describe('withoutDuplicateCharges', () => {
  it('states the charge of one action on its registered row only', () => {
    const [first, second] = withoutDuplicateCharges([linked, registered])
    // The `registered` row keeps it wherever it sits in the page.
    expect(second).toBe(registered)
    expect(first.data).toEqual({
      token_id: registered.data.token_id,
      canonical_id: registered.data.canonical_id,
      referrer: registered.data.referrer,
      registrant: registered.data.registrant,
      owner: registered.data.owner,
      expires_at: registered.data.expires_at,
      action_id: registered.data.action_id,
      action_role: 'linked',
    })
  })

  it('keeps the first copy when the registered row carries none', () => {
    const bare = {
      ...registered,
      data: { action_id: registered.data.action_id, action_role: 'registered' },
    } as const satisfies NameHistoryRow
    const other = { ...linked, id: 'c'.repeat(64) }
    const rows = withoutDuplicateCharges([bare, linked, other])
    expect(rows[0]).toBe(bare)
    expect(rows[1]).toBe(linked)
    expect(rows[2].data).not.toHaveProperty('base_cost')
    expect(rows[2].data).not.toHaveProperty('payment_token')
  })

  it('leaves the charges of different actions, and a differing charge, alone', () => {
    const otherAction = {
      ...linked,
      data: { ...linked.data, action_id: 'd'.repeat(64) },
    }
    const differing = {
      ...linked,
      data: { ...linked.data, base_cost: '6000000' },
    }
    const renewal: NameHistoryRow = mockHistoryRenewalPayment
    const rows: readonly NameHistoryRow[] = [
      registered,
      otherAction,
      differing,
      renewal,
    ]
    expect(withoutDuplicateCharges(rows)).toEqual(rows)
  })

  it('is the identity on rows that carry no charge', () => {
    const v041Linked = {
      ...mockHistoryRegistration,
      id: 'e'.repeat(64),
    }
    const rows: readonly (NameHistoryRow | EventRow)[] = [
      mockHistoryRegistration,
      v041Linked,
    ]
    const result = withoutDuplicateCharges(rows)
    expect(result[0]).toBe(rows[0])
    expect(result[1]).toBe(rows[1])
  })
})
