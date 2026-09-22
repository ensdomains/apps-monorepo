import { describe, expect, it } from 'vitest'
import { computeDisplayNameState } from './computeDisplayNameState'

describe('computeDisplayNameState', () => {
  describe('L1 (Ethereum mainnet, chainId 60)', () => {
    it('should show name with forward match as primary', () => {
      const result = computeDisplayNameState({
        name: 'vitalik.eth',
        defaultName: null,
        forwardMatch: true,
        defaultForwardMatch: false,
        reverseRegistrarChainId: 60,
      })

      expect(result).toEqual({
        displayName: 'vitalik.eth',
        isInheritingDefault: false,
        isPrimaryName: true,
        isForwardRecordMissing: false,
        isUnverifiedDefault: false,
      })
    })

    it('should show name without forward match as non-primary', () => {
      const result = computeDisplayNameState({
        name: 'vitalik.eth',
        defaultName: null,
        forwardMatch: false,
        defaultForwardMatch: false,
        reverseRegistrarChainId: 60,
      })

      expect(result).toEqual({
        displayName: 'vitalik.eth',
        isInheritingDefault: false,
        isPrimaryName: false,
        isForwardRecordMissing: true,
        isUnverifiedDefault: false,
      })
    })

    it('should not show defaultName on L1', () => {
      const result = computeDisplayNameState({
        name: null,
        defaultName: 'default.eth',
        forwardMatch: false,
        defaultForwardMatch: true,
        reverseRegistrarChainId: 60,
      })

      expect(result).toEqual({
        displayName: undefined,
        isInheritingDefault: false,
        isPrimaryName: false,
        isForwardRecordMissing: false,
        isUnverifiedDefault: false,
      })
    })

    it('should handle no name set', () => {
      const result = computeDisplayNameState({
        name: null,
        defaultName: null,
        forwardMatch: false,
        defaultForwardMatch: false,
        reverseRegistrarChainId: 60,
      })

      expect(result).toEqual({
        displayName: undefined,
        isInheritingDefault: false,
        isPrimaryName: false,
        isForwardRecordMissing: false,
        isUnverifiedDefault: false,
      })
    })
  })

  describe('L2 (Optimism, chainId 10)', () => {
    it('should use name when set and allow completing the forward record', () => {
      const result = computeDisplayNameState({
        name: 'alice.eth',
        defaultName: 'default.eth',
        forwardMatch: false,
        defaultForwardMatch: true,
        reverseRegistrarChainId: 10,
      })

      // A reverse name set on the L2 registrar without a matching forward
      // `addr(node, l2CoinType)` record is only half of an ENSIP-19 primary —
      // the forward record can be written (on L1) to complete it.
      expect(result).toEqual({
        displayName: 'alice.eth',
        isInheritingDefault: false,
        isPrimaryName: false,
        isForwardRecordMissing: true,
        isUnverifiedDefault: false,
      })
    })

    it('should inherit defaultName when no name is set', () => {
      const result = computeDisplayNameState({
        name: null,
        defaultName: 'vitalik.eth',
        forwardMatch: false,
        defaultForwardMatch: true,
        reverseRegistrarChainId: 10,
      })

      expect(result).toEqual({
        displayName: 'vitalik.eth',
        isInheritingDefault: true,
        isPrimaryName: true,
        isForwardRecordMissing: false,
        isUnverifiedDefault: false,
      })
    })

    it('should handle no name and no defaultName', () => {
      const result = computeDisplayNameState({
        name: null,
        defaultName: null,
        forwardMatch: false,
        defaultForwardMatch: false,
        reverseRegistrarChainId: 10,
      })

      expect(result).toEqual({
        displayName: undefined,
        isInheritingDefault: false,
        isPrimaryName: false,
        isForwardRecordMissing: false,
        isUnverifiedDefault: false,
      })
    })

    it('should handle name with forward match', () => {
      const result = computeDisplayNameState({
        name: 'alice.eth',
        defaultName: null,
        forwardMatch: true,
        defaultForwardMatch: false,
        reverseRegistrarChainId: 10,
      })

      expect(result).toEqual({
        displayName: 'alice.eth',
        isInheritingDefault: false,
        isPrimaryName: true,
        isForwardRecordMissing: false,
        isUnverifiedDefault: false,
      })
    })
  })

  // WEB-1428. `default.reverse` is writable by anyone for any name, so an
  // inherited name only counts once its forward `addr` record points back at
  // the address. Before this, inheritance alone made the row report a verified
  // primary name.
  describe('unverified default (WEB-1428)', () => {
    it('does not report an inherited default as primary when it does not forward-match', () => {
      const result = computeDisplayNameState({
        name: null,
        defaultName: 'someone-elses.eth',
        forwardMatch: false,
        defaultForwardMatch: false,
        reverseRegistrarChainId: 10,
      })

      expect(result).toEqual({
        displayName: 'someone-elses.eth',
        isInheritingDefault: true,
        isPrimaryName: false,
        // Nothing to complete from this row: the name has no record on this
        // chain's registrar, and its forward record is the owner's to set.
        isForwardRecordMissing: false,
        isUnverifiedDefault: true,
      })
    })

    it("keeps this chain's own verified record primary regardless of the default", () => {
      const result = computeDisplayNameState({
        name: 'alice.eth',
        defaultName: 'someone-elses.eth',
        forwardMatch: true,
        defaultForwardMatch: false,
        reverseRegistrarChainId: 10,
      })

      expect(result.isPrimaryName).toBe(true)
      expect(result.isUnverifiedDefault).toBe(false)
    })
  })

  describe('Edge cases', () => {
    it('should prioritize name over defaultName on L2', () => {
      const result = computeDisplayNameState({
        name: 'custom.eth',
        defaultName: 'default.eth',
        forwardMatch: false,
        defaultForwardMatch: true,
        reverseRegistrarChainId: 10,
      })

      expect(result.displayName).toBe('custom.eth')
      expect(result.isInheritingDefault).toBe(false)
    })
  })
})
