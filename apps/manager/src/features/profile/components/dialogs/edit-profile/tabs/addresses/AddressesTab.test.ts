import { describe, expect, it } from 'vitest'
import { addressRecords } from '@/features/profile/data/records'
import type { AddressRecordValue } from '@/features/profile/types'
import {
  applyEthAddressChange,
  getAddressDisplayState,
  getAddressOption,
  getAddressValue,
  normalizeAddressRows,
  removeAddress,
  upsertAddress,
} from './AddressesTab.helpers'
import {
  BNB_COIN_TYPE,
  BSC_COIN_TYPE,
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

describe('address row helpers', () => {
  const ethAddress = '0x1111111111111111111111111111111111111111'
  const nextEthAddress = '0x2222222222222222222222222222222222222222'
  const customBaseAddress = '0x3333333333333333333333333333333333333333'
  const baseCoinType = 2147492101
  const optimismCoinType = 2147483658
  const bitcoinCoinType = 0

  const address = (coinType: number, value: string): AddressRecordValue => ({
    coinType,
    value,
  })

  it('normalizes address rows by keeping the first row for each coin type', () => {
    expect(
      normalizeAddressRows([
        address(ETH_COIN_TYPE, ethAddress),
        address(baseCoinType, customBaseAddress),
        address(ETH_COIN_TYPE, nextEthAddress),
      ]),
    ).toEqual([
      address(ETH_COIN_TYPE, ethAddress),
      address(baseCoinType, customBaseAddress),
    ])
  })

  it('upserts address rows without introducing duplicate coin types', () => {
    expect(
      upsertAddress(
        [
          address(ETH_COIN_TYPE, ethAddress),
          address(baseCoinType, customBaseAddress),
          address(baseCoinType, ethAddress),
        ],
        baseCoinType,
        nextEthAddress,
      ),
    ).toEqual([
      address(ETH_COIN_TYPE, ethAddress),
      address(baseCoinType, nextEthAddress),
    ])

    expect(
      upsertAddress(
        [address(ETH_COIN_TYPE, ethAddress)],
        BNB_COIN_TYPE,
        'bnb1',
      ),
    ).toEqual([
      address(ETH_COIN_TYPE, ethAddress),
      address(BNB_COIN_TYPE, 'bnb1'),
    ])
  })

  it('removes every row matching the coin type', () => {
    expect(
      removeAddress(
        [
          address(ETH_COIN_TYPE, ethAddress),
          address(baseCoinType, customBaseAddress),
          address(baseCoinType, ethAddress),
        ],
        baseCoinType,
      ),
    ).toEqual([address(ETH_COIN_TYPE, ethAddress)])
  })

  it('reads configured and fallback address option labels', () => {
    expect(getAddressOption(baseCoinType)).toEqual({
      coinType: baseCoinType,
      label: 'Base',
    })
    expect(getAddressOption(123_456_789)).toEqual({
      coinType: 123_456_789,
      label: 'Address 123456789',
    })
  })

  it('returns an empty string when an address row is missing', () => {
    expect(
      getAddressValue([address(ETH_COIN_TYPE, ethAddress)], baseCoinType),
    ).toBe('')
  })

  it('propagates Ethereum address changes to mirrored EVM rows only', () => {
    expect(
      applyEthAddressChange(
        [
          address(ETH_COIN_TYPE, ethAddress),
          address(optimismCoinType, ethAddress),
          address(baseCoinType, customBaseAddress),
          address(bitcoinCoinType, 'bc1qcustom'),
        ],
        ethAddress,
        nextEthAddress,
      ),
    ).toEqual([
      address(ETH_COIN_TYPE, nextEthAddress),
      address(optimismCoinType, nextEthAddress),
      address(baseCoinType, customBaseAddress),
      address(bitcoinCoinType, 'bc1qcustom'),
    ])
  })

  it('keeps only ETH and non-EVM rows when the Ethereum address is cleared', () => {
    expect(
      applyEthAddressChange(
        [
          address(ETH_COIN_TYPE, ethAddress),
          address(optimismCoinType, ethAddress),
          address(baseCoinType, customBaseAddress),
          address(bitcoinCoinType, 'bc1qcustom'),
        ],
        ethAddress,
        '',
      ),
    ).toEqual([
      address(ETH_COIN_TYPE, ''),
      address(bitcoinCoinType, 'bc1qcustom'),
    ])
  })

  it('derives visible chip rows, custom EVM rows, other-network rows, and unavailable picker sets', () => {
    const state = getAddressDisplayState({
      addresses: [
        address(ETH_COIN_TYPE, ethAddress),
        address(optimismCoinType, ethAddress),
        address(baseCoinType, customBaseAddress),
        address(bitcoinCoinType, 'bc1qcustom'),
        address(123_456_789, 'custom-other'),
      ],
      ethAddress,
      extraEvmCoinTypes: [BSC_COIN_TYPE],
      extraOtherCoinTypes: [123_456_789],
    })

    expect(state.customEvmOptions).toEqual([
      { coinType: baseCoinType, label: 'Base' },
    ])
    expect(
      state.visibleEvmChipOptions.map(({ coinType }) => coinType),
    ).toContain(optimismCoinType)
    expect(
      state.visibleEvmChipOptions.map(({ coinType }) => coinType),
    ).not.toContain(baseCoinType)
    expect(state.visibleOtherRows).toEqual([
      { coinType: bitcoinCoinType, label: 'Bitcoin' },
      { coinType: 123_456_789, label: 'Address 123456789' },
    ])
    expect(state.unavailableEvmCoinTypes.has(BSC_COIN_TYPE)).toBe(true)
    expect(state.unavailableOtherCoinTypes.has(123_456_789)).toBe(true)
  })
})
