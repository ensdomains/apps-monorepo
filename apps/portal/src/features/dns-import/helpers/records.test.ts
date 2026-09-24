import { describe, expect, it } from 'vitest'
import {
  getOffchainVerificationRecord,
  getOnchainVerificationRecord,
} from './records'

const ADDRESS = '0x0b08dA7068b73A579Bd5E8a8290ff8afd37bc32A' as const

describe('getOnchainVerificationRecord', () => {
  it('builds the _ens TXT record with an a= value', () => {
    expect(getOnchainVerificationRecord(ADDRESS)).toEqual({
      type: 'TXT',
      name: '_ens',
      value: `a=${ADDRESS}`,
    })
  })

  // Shown before the wallet is connected so DNSSEC and this record can be set
  // up in one visit to the DNS manager.
  it('falls back to a placeholder address with no wallet connected', () => {
    expect(getOnchainVerificationRecord(undefined)).toEqual({
      type: 'TXT',
      name: '_ens',
      value: 'a=<your address>',
    })
  })
})

describe('getOffchainVerificationRecord', () => {
  it('uses the dnsname.ens.eth name form on mainnet', () => {
    expect(getOffchainVerificationRecord(1, ADDRESS)).toEqual({
      type: 'TXT',
      name: '@',
      value: `ENS1 dnsname.ens.eth ${ADDRESS}`,
    })
  })

  it('uses the raw official resolver address on Sepolia', () => {
    expect(getOffchainVerificationRecord(11155111, ADDRESS)).toEqual({
      type: 'TXT',
      name: '@',
      value: `ENS1 0x0EF1aF80c24B681991d675176D9c07d8C9236B9a ${ADDRESS}`,
    })
  })

  it('falls back to a placeholder address with no wallet connected', () => {
    expect(getOffchainVerificationRecord(1, undefined)).toEqual({
      type: 'TXT',
      name: '@',
      value: 'ENS1 dnsname.ens.eth <your address>',
    })
  })
})
