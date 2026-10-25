import type { NameHistoryRow } from '@ens-apps/indexer/bigname'
import { describe, expect, it } from 'vitest'
import {
  mockHistoryRegistration,
  mockHistoryRegistrationPayment,
} from '@/test-utils/bigname/bigname.mock'
import { mergeRegistrationTwins } from './registrationTwins'

const registered = {
  ...mockHistoryRegistrationPayment,
  registration_id: null,
} as const satisfies NameHistoryRow

const linked = {
  ...mockHistoryRegistrationPayment,
  id: 'b'.repeat(64),
  log_index: 43,
  kind: 'RegistrationGranted',
  data: { ...mockHistoryRegistrationPayment.data, action_role: 'linked' },
} as const satisfies NameHistoryRow

describe('mergeRegistrationTwins', () => {
  it('keeps the registered row and takes its registration id from the linked twin', () => {
    const [row, ...rest] = mergeRegistrationTwins([linked, registered])
    expect(rest).toEqual([])
    expect(row.id).toBe(registered.id)
    expect(row.kind).toBe('LabelRegistered')
    expect(row.registration_id).toBe(linked.registration_id)
    expect(row.data).toEqual(registered.data)
  })

  it('takes a charge only the linked twin carries', () => {
    const { base_cost, premium, payment_token, ...bare } = registered.data
    const [row] = mergeRegistrationTwins([
      { ...registered, data: bare },
      linked,
    ])
    expect(row.data).toMatchObject({ base_cost, premium, payment_token })
    expect(row.data).toHaveProperty('action_role', 'registered')
  })

  it('keeps a linked row whose twin is not loaded', () => {
    expect(mergeRegistrationTwins([linked])).toEqual([linked])
  })

  it('leaves rows of other actions, and rows with no action, alone', () => {
    const other = {
      ...linked,
      data: { ...linked.data, action_id: 'd'.repeat(64) },
    } as const satisfies NameHistoryRow
    const rows: readonly NameHistoryRow[] = [
      registered,
      other,
      mockHistoryRegistration,
    ]
    const result = mergeRegistrationTwins(rows)
    expect(result).toHaveLength(3)
    expect(result[1]).toBe(other)
    expect(result[2]).toBe(mockHistoryRegistration)
  })
})
