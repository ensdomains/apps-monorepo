/**
 * @vitest-environment happy-dom
 */
import type { Address, Hex } from 'viem'
import { describe, expect, it } from 'vitest'
import { LEGACY_REFUND_CAPS, sizeRefundCaps } from './refund-caps'
import { getSession, saveSession } from './session-storage'
import {
  buildHcaSessionEnablePayload,
  type RhinestoneStoredSession,
  serializeRefundCaps,
  storedRefundCaps,
} from './types'

const HCA: Address = '0xaAaA000000000000000000000000000000000001'

/** A record as written before caps were stored: no `refundCaps`. */
const legacyRecord: RhinestoneStoredSession = {
  id: 'legacy',
  provider: 'rhinestone',
  sessionKeyAddress: '0x9999999999999999999999999999999999999999',
  smartAccountAddress: HCA,
  ownerAddress: '0x1111111111111111111111111111111111111111',
  createdAt: 0,
  chainId: 11155111,
  validUntil: 1_800_000_000,
  sessionPrivateKey: `0x${'1'.repeat(64)}` as Hex,
  permissionId: `0x${'2'.repeat(64)}` as Hex,
  resolver: '0x3333333333333333333333333333333333333333',
  hcaSessionNonce: '0',
  authorization: `0x${'4'.repeat(130)}` as Hex,
  hashesAndChainIds: [
    { chainId: '11155111', sessionDigest: `0x${'5'.repeat(64)}` as Hex },
  ],
  sessionToEnableIndex: 0,
}

const quotedCaps = sizeRefundCaps(2_972_344n)

describe('storedRefundCaps', () => {
  it('reads a record without caps as the legacy caps it was signed with', () => {
    expect(storedRefundCaps(legacyRecord)).toEqual(LEGACY_REFUND_CAPS)
  })

  it('reads back the caps a record stores, through localStorage', () => {
    saveSession({
      ...legacyRecord,
      refundCaps: serializeRefundCaps(quotedCaps),
    })
    const stored = getSession(HCA)
    expect(stored && storedRefundCaps(stored)).toEqual(quotedCaps)
  })
})

describe('buildHcaSessionEnablePayload', () => {
  it('rebuilds the proof with the caps the session was signed with', () => {
    expect(
      buildHcaSessionEnablePayload(legacyRecord).enableData.hcaSessionConfig
        .maxRefundGasOverhead,
    ).toBe(Number(LEGACY_REFUND_CAPS.maxRefundGasOverhead))
    expect(
      buildHcaSessionEnablePayload({
        ...legacyRecord,
        refundCaps: serializeRefundCaps(quotedCaps),
      }).enableData.hcaSessionConfig.maxRefundGasOverhead,
    ).toBe(Number(quotedCaps.maxRefundGasOverhead))
  })
})
