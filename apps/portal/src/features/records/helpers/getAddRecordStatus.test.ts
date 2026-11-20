import { describe, expect, it } from 'vitest'
import type { RecordType } from '@/utils/records/editRecordUtils'
import { getAddRecordFeedback, getAddRecordStatus } from './getAddRecordStatus'

const ETH_ADDRESS = '0x1234567890123456789012345678901234567890'
const BTC_ADDRESS = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'

const run = (type: RecordType | '', key: string, value: string) =>
  getAddRecordStatus({ type, key, value })

describe('getAddRecordStatus', () => {
  it.each([
    ['', ETH_ADDRESS],
    ['   ', ETH_ADDRESS],
    ['', ''],
    ['ETH', ''],
    ['ETH', '   '],
    ['BTC', ''],
  ])(
    'treats an address row with coin %j and value %j as incomplete',
    (key, value) => {
      expect(run('address', key, value).status).toBe('incomplete')
    },
  )

  it.each([
    ['ETH', 'not-an-address'],
    ['ETH', BTC_ADDRESS],
    ['BTC', ETH_ADDRESS],
    ['DEFAULT', BTC_ADDRESS],
  ])(
    'reports an entered %s address %j as invalid, naming the coin',
    (key, value) => {
      expect(run('address', key, value)).toEqual({
        status: 'invalid',
        message: expect.stringContaining(`Invalid ${key} address`),
      })
    },
  )

  it.each([
    ['UNKNOWN', ''],
    ['UNKNOWN', ETH_ADDRESS],
    ['constructor', ETH_ADDRESS],
  ])('refuses an unrecognized coin %j rather than defaulting', (key, value) => {
    expect(run('address', key, value)).toEqual({
      status: 'invalid',
      message: 'Unsupported coin. Select a supported coin.',
    })
  })

  it.each([
    ['ETH', ETH_ADDRESS],
    ['btc', BTC_ADDRESS],
    ['BTC', BTC_ADDRESS],
    ['DEFAULT', ETH_ADDRESS],
  ])('allows a valid %s address row', (key, value) => {
    expect(run('address', key, value)).toEqual({ status: 'ready' })
  })

  it.each([
    ['', 'description'],
    ['description', ''],
    ['   ', 'description'],
    ['description', '   '],
  ])(
    'treats a text row with key %j and value %j as incomplete',
    (key, value) => {
      expect(run('text', key, value).status).toBe('incomplete')
    },
  )

  it('allows a text row when both key and value are present', () => {
    expect(run('text', 'description', 'Hello')).toEqual({ status: 'ready' })
  })

  it('requires a selected record type', () => {
    expect(run('', 'ETH', ETH_ADDRESS).status).toBe('incomplete')
  })

  it.each(['abi', 'contentHash'] as const)(
    'preserves the existing empty-input policy for %s',
    (type) => {
      expect(run(type, '', '')).toEqual({ status: 'ready' })
    },
  )
})

describe('getAddRecordFeedback', () => {
  const INVALID = run('address', 'ETH', 'not-an-address')

  it('keeps an invalid address quiet until the value field is left, but explains the disabled button', () => {
    expect(getAddRecordFeedback(INVALID, false)).toEqual({
      disabledReason: expect.stringContaining('Invalid ETH address'),
      error: null,
    })
  })

  it('shows the invalid address error once the value field is left', () => {
    const feedback = getAddRecordFeedback(INVALID, true)
    expect(feedback.error).toEqual(
      expect.stringContaining('Invalid ETH address'),
    )
    expect(feedback.disabledReason).toBe(feedback.error)
  })

  it('never shows an inline error for an incomplete row, even after the field is left', () => {
    const feedback = getAddRecordFeedback(run('address', 'ETH', ''), true)
    expect(feedback.error).toBeNull()
    expect(feedback.disabledReason).toEqual(expect.any(String))
  })

  it('clears both once the address is corrected', () => {
    expect(
      getAddRecordFeedback(run('address', 'ETH', ETH_ADDRESS), true),
    ).toEqual({ disabledReason: null, error: null })
  })
})
