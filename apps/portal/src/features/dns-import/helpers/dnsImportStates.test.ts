import {
  DnsDnssecVerificationFailedError,
  DnsDnssecWildcardExpansionError,
  DnsInvalidAddressChecksumError,
  DnsInvalidTxtRecordError,
  DnsNoTxtRecordError,
  DnsResponseStatusError,
} from '@ensdomains/ensjs'
import { describe, expect, it } from 'vitest'
import { deriveVerificationState, dnsErrorToKind } from './dnsImportStates'

const ADDRESS = '0x0b08dA7068b73A579Bd5E8a8290ff8afd37bc32A' as const
const OTHER = '0x5eb3Bc0a489C5A8288765d2336659EbCA68FCd00' as const

describe('dnsErrorToKind', () => {
  it('maps NXDOMAIN response status to noTxtRecord', () => {
    const error = new DnsResponseStatusError({ responseStatus: 'NXDOMAIN' })
    expect(dnsErrorToKind(error)).toBe('noTxtRecord')
  })

  it('maps non-NXDOMAIN response status to unknown', () => {
    const error = new DnsResponseStatusError({ responseStatus: 'SERVFAIL' })
    expect(dnsErrorToKind(error)).toBe('unknown')
  })

  it('maps missing TXT record to noTxtRecord', () => {
    expect(dnsErrorToKind(new DnsNoTxtRecordError())).toBe('noTxtRecord')
  })

  it('maps invalid TXT record to invalidTxtRecord', () => {
    expect(
      dnsErrorToKind(new DnsInvalidTxtRecordError({ record: 'a=nonsense' })),
    ).toBe('invalidTxtRecord')
  })

  it('maps checksum failure to invalidAddressChecksum', () => {
    expect(
      dnsErrorToKind(
        new DnsInvalidAddressChecksumError({ address: ADDRESS.toLowerCase() }),
      ),
    ).toBe('invalidAddressChecksum')
  })

  it('maps DNSSEC verification failure to dnssecFailure', () => {
    expect(
      dnsErrorToKind(new DnsDnssecVerificationFailedError({ record: 'a=0x' })),
    ).toBe('dnssecFailure')
  })

  it('maps wildcard expansion to wildcardExpansion', () => {
    expect(dnsErrorToKind(new DnsDnssecWildcardExpansionError())).toBe(
      'wildcardExpansion',
    )
  })

  it('maps unrelated errors to unknown', () => {
    expect(dnsErrorToKind(new Error('boom'))).toBe('unknown')
    expect(dnsErrorToKind(undefined)).toBe('unknown')
  })
})

describe('deriveVerificationState', () => {
  it('is none when the DNS side designates no address', () => {
    expect(
      deriveVerificationState({
        connectedAddress: ADDRESS,
        dnsAddress: null,
      }),
    ).toEqual({ kind: 'none' })
  })

  it('is verified when the record matches the connected address', () => {
    expect(
      deriveVerificationState({
        connectedAddress: ADDRESS,
        dnsAddress: ADDRESS,
      }),
    ).toEqual({ kind: 'verified' })
  })

  it('matches case-insensitively (checksum differences are not a mismatch)', () => {
    expect(
      deriveVerificationState({
        connectedAddress: ADDRESS,
        dnsAddress: ADDRESS.toLowerCase() as typeof ADDRESS,
      }),
    ).toEqual({ kind: 'verified' })
  })

  it('is mismatch with the found address when it differs', () => {
    expect(
      deriveVerificationState({
        connectedAddress: ADDRESS,
        dnsAddress: OTHER,
      }),
    ).toEqual({ kind: 'mismatch', foundAddress: OTHER })
  })

  it('is mismatch when no wallet is connected but a record exists', () => {
    expect(
      deriveVerificationState({
        connectedAddress: undefined,
        dnsAddress: OTHER,
      }),
    ).toEqual({ kind: 'mismatch', foundAddress: OTHER })
  })
})
