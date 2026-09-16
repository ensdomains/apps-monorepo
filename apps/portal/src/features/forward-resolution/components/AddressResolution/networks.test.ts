import {
  getCoinTypeForReverseRegistrarChainId,
  L2_REVERSE_REGISTRAR_CHAIN_IDS,
} from '@ens-apps/l2-primary/v1'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EVM_COIN_TYPE, MAINNET_COIN_TYPE } from '@/lib/coinType'
import { FORWARD_RESOLUTION_NETWORKS, forwardAddress } from './networks'

const OWNER = '0x1111111111111111111111111111111111111111'
const ON_OPTIMISM = '0x2222222222222222222222222222222222222222'

const networkFor = (coinType: number) => {
  const network = FORWARD_RESOLUTION_NETWORKS.find(
    (candidate) => candidate.coinType === coinType,
  )
  if (!network) throw new Error(`no network row for coin type ${coinType}`)
  return network
}

const optimism = networkFor(
  getCoinTypeForReverseRegistrarChainId(10, 'sepolia'),
)

describe('FORWARD_RESOLUTION_NETWORKS', () => {
  // Regression guard: the explorer must read L2 records back on the coin type
  // the manager writes them on.
  it.each(
    L2_REVERSE_REGISTRAR_CHAIN_IDS,
  )('keys chain %i on this deployment’s coin type', (chainId) => {
    const network = FORWARD_RESOLUTION_NETWORKS.find(
      (candidate) => candidate.l2ChainId === chainId,
    )

    expect(network?.coinType).toBe(
      getCoinTypeForReverseRegistrarChainId(chainId, 'sepolia'),
    )
  })
})

describe('forwardAddress', () => {
  it('reads an L2 record back on the coin type the manager wrote it on', () => {
    expect(
      forwardAddress(
        optimism,
        new Map([
          [getCoinTypeForReverseRegistrarChainId(10, 'sepolia'), ON_OPTIMISM],
        ]),
      ),
    ).toEqual({ address: ON_OPTIMISM, addressSource: 'record' })
  })

  it('marks the ENSIP-19 default fallback as not a record for that network', () => {
    expect(
      forwardAddress(optimism, new Map([[DEFAULT_EVM_COIN_TYPE, OWNER]])),
    ).toEqual({ address: OWNER, addressSource: 'default' })
  })

  it('does not fall back to the mainnet (coin 60) record', () => {
    expect(
      forwardAddress(optimism, new Map([[MAINNET_COIN_TYPE, OWNER]])),
    ).toEqual({ address: null, addressSource: null })
  })

  it('never falls back on the two L1 rows', () => {
    expect(
      forwardAddress(
        networkFor(MAINNET_COIN_TYPE),
        new Map([[DEFAULT_EVM_COIN_TYPE, OWNER]]),
      ),
    ).toEqual({ address: null, addressSource: null })
  })
})
