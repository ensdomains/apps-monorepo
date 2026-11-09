import {
  getCoinTypeForReverseRegistrarChainId,
  L2_REVERSE_REGISTRAR_CHAIN_IDS,
} from '@ens-apps/l2-primary/v1'
import { describe, expect, it } from 'vitest'
import { getMainReceivingAddress } from '@/features/profile/components/view/ProfileView.helpers'
import {
  getAddressPresentation,
  getAddressRecordDef,
} from '@/features/profile/data/records'
import { getAddressOption } from './AddressesTab.helpers'
import {
  evmChainOptions,
  getPickerRecordGroups,
  otherNetworkOptions,
} from './addressPickerRecords'

// Regression guard: the manager used to offer these L2s under their mainnet
// coin types, which the explorer never reads.
describe('L2 address records key on this deployment’s coin type', () => {
  it('uses the same labels and artwork in the editor and profile', () => {
    for (const option of [...evmChainOptions, ...otherNetworkOptions]) {
      const presentation = getAddressPresentation(option.coinType)
      const profileAddress = getMainReceivingAddress({
        addresses: [{ coinType: option.coinType, value: 'example-address' }],
        base: {},
        contact: [],
        links: [],
        social: [],
        unknown: [],
        agentRegistrations: [],
      })
      expect(option.label).toBe(presentation.label)
      expect(getAddressOption(option.coinType).label).toBe(presentation.label)
      expect(profileAddress).toMatchObject(presentation)
    }
  })
  const pickerCoinTypes = new Set([
    ...evmChainOptions.map(({ coinType }) => coinType),
    ...getPickerRecordGroups({
      mode: 'evm',
      normalizedSearchValue: '',
      unavailableCoinTypes: new Set(),
    }).popularRecords.map(({ coinType }) => coinType),
  ])

  it.each(L2_REVERSE_REGISTRAR_CHAIN_IDS)(
    'offers chain %i under its Sepolia coin type, not its mainnet one',
    (chainId) => {
      const sepoliaCoinType = getCoinTypeForReverseRegistrarChainId(
        chainId,
        'sepolia',
      )
      const mainnetCoinType = getCoinTypeForReverseRegistrarChainId(
        chainId,
        'mainnet',
      )

      expect(pickerCoinTypes).toContain(sepoliaCoinType)
      expect(pickerCoinTypes).not.toContain(mainnetCoinType)
    },
  )

  it.each(L2_REVERSE_REGISTRAR_CHAIN_IDS)(
    'keeps the record definition (label, icon) for chain %i',
    (chainId) => {
      const def = getAddressRecordDef(
        getCoinTypeForReverseRegistrarChainId(chainId, 'sepolia'),
      )

      expect(def).toBeDefined()
      expect(def?.name).toBeTruthy()
    },
  )
})

describe('EVM chains added in address-encoder 3.0.0', () => {
  it.each([
    ['Unichain', 2147483778],
    ['Monad', 2147483791],
    ['Sonic', 2147483794],
    ['World Chain', 2147484128],
    ['HyperEVM', 2147484647],
    ['Lisk', 2147484783],
    ['Soneium', 2147485516],
    ['Ronin', 2147485668],
    ['Abstract', 2147486389],
    ['Tempo', 2147487865],
    ['Robinhood Chain', 2147488311],
    ['Arc', 2147488690],
    ['Plasma', 2147493393],
    ['Arbitrum Nova', 2147525818],
    ['Ink', 2147540721],
    ['Berachain', 2147563742],
    ['Taiko', 2147650648],
  ] as const)('finds %s by name under coin type %i', (name, coinType) => {
    const { otherRecords, popularRecords } = getPickerRecordGroups({
      mode: 'evm',
      normalizedSearchValue: name.toLowerCase(),
      unavailableCoinTypes: new Set(),
    })
    const found = [...popularRecords, ...otherRecords].find(
      (record) => record.name === name,
    )

    expect(found?.coinType).toBe(coinType)
    expect(getAddressPresentation(coinType).label).toBe(name)
  })
})

describe('coins address-encoder 3.0.0 removed', () => {
  it('no longer offers Binance Chain (714) for a new record', () => {
    const { otherRecords, popularRecords } = getPickerRecordGroups({
      mode: 'other',
      normalizedSearchValue: 'binance',
      unavailableCoinTypes: new Set(),
    })

    expect(otherNetworkOptions.map(({ coinType }) => coinType)).not.toContain(
      714,
    )
    expect(
      [...popularRecords, ...otherRecords].map(({ coinType }) => coinType),
    ).not.toContain(714)
  })
})
