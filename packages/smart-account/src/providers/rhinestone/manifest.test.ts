import { getAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  DESTINATION_CONTRACTS,
  SHARED_CONTRACTS,
  SOURCE_CONTRACTS,
} from './manifest'

/**
 * Guards against a mis-checksummed contract address reaching viem, which
 * rejects a mixed-case address whose EIP-55 checksum does not match with
 * `Address "0x…" is invalid` — at transaction-submission time, in the user's
 * wallet.
 *
 * Nothing else catches it: a wrong-case character type-checks, lints, and even
 * works under `cast`, which does not verify checksums. Addresses sourced from
 * ensjs are already canonical; the risk is entirely in the literals typed here
 * by hand from a deployment doc.
 */
const expectChecksummed = (label: string, address: string) => {
  expect(
    () => getAddress(address),
    `${label} is not a valid address`,
  ).not.toThrow()
  expect(getAddress(address), `${label} is not EIP-55 checksummed`).toBe(
    address,
  )
}

// Generic over the per-chain table type: the contract tables are interfaces,
// which have no index signature and so do not satisfy `Record<string, string>`.
const entriesOf = <T extends object>(table: Record<number, T>) =>
  Object.entries(table).flatMap(([chainId, contracts]) =>
    Object.entries(contracts as Record<string, string>).map(
      ([name, address]) => [`${chainId}.${name}`, address] as const,
    ),
  )

describe('contract manifest addresses', () => {
  it.each(
    entriesOf(DESTINATION_CONTRACTS),
  )('DESTINATION_CONTRACTS.%s is checksummed', (label, address) => {
    expectChecksummed(label, address)
  })

  it.each(
    entriesOf(SOURCE_CONTRACTS),
  )('SOURCE_CONTRACTS.%s is checksummed', (label, address) => {
    expectChecksummed(label, address)
  })

  it.each(
    Object.entries(SHARED_CONTRACTS),
  )('SHARED_CONTRACTS.%s is checksummed', (label, address) => {
    expectChecksummed(label, address)
  })
})
