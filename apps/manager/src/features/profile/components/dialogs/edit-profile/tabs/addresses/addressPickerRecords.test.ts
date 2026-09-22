import {
  getCoinTypeForReverseRegistrarChainId,
  L2_REVERSE_REGISTRAR_CHAIN_IDS,
} from '@ens-apps/l2-primary/v1'
import { describe, expect, it } from 'vitest'
import { getAddressRecordDef } from '@/features/profile/data/records'
import { evmChainOptions, getPickerRecordGroups } from './addressPickerRecords'

// Regression guard: the manager used to offer these L2s under their mainnet
// coin types, which the explorer never reads.
describe('L2 address records key on this deployment’s coin type', () => {
  const pickerCoinTypes = new Set([
    ...evmChainOptions.map(({ coinType }) => coinType),
    ...getPickerRecordGroups({
      mode: 'evm',
      normalizedSearchValue: '',
      unavailableCoinTypes: new Set(),
    }).popularRecords.map(({ coinType }) => coinType),
  ])

  it.each(
    L2_REVERSE_REGISTRAR_CHAIN_IDS,
  )('offers chain %i under its Sepolia coin type, not its mainnet one', (chainId) => {
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
  })

  it.each(
    L2_REVERSE_REGISTRAR_CHAIN_IDS,
  )('keeps the record definition (label, icon) for chain %i', (chainId) => {
    const def = getAddressRecordDef(
      getCoinTypeForReverseRegistrarChainId(chainId, 'sepolia'),
    )

    expect(def).toBeDefined()
    expect(def?.name).toBeTruthy()
  })
})
