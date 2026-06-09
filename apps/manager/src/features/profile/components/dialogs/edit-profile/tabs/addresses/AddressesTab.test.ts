import { describe, expect, it } from 'vitest'
import { addressRecords } from '@/features/profile/data/records'
import {
  ETH_COIN_TYPE,
  getPickerRecords,
  isEvmCoinType,
} from './addressPickerRecords'

describe('getPickerRecords', () => {
  it('lists every available other-network address record when search is empty', async () => {
    const unavailableCoinTypes = new Set([ETH_COIN_TYPE, 0, 501, 714])
    const records = getPickerRecords({
      mode: 'other',
      normalizedSearchValue: '',
      unavailableCoinTypes,
    })
    const expectedRecords = addressRecords.filter(
      (record) =>
        !unavailableCoinTypes.has(record.coinType) &&
        !isEvmCoinType(record.coinType) &&
        record.coinType !== ETH_COIN_TYPE,
    )

    expect(records.map(({ coinType }) => coinType)).toEqual(
      expectedRecords.map(({ coinType }) => coinType),
    )
    expect(records.length).toBeGreaterThan(4)
  })
})
