import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { coinIcons } from '@/assets/coins'

describe.each(['mainnet', 'sepolia'] as const)(
  'address presentation on %s',
  (network) => {
    beforeEach(() => {
      vi.resetModules()
      vi.doMock('@/config', () => ({ envConfig: { network } }))
    })
    afterEach(() => vi.doUnmock('@/config'))

    it('uses existing artwork aliases without changing coin types', async () => {
      const { getAddressPresentation } = await import('./address')
      const { getCoinTypeForReverseRegistrarChainId } = await import(
        '@ens-apps/l2-primary/v1'
      )
      const scrollCoinType = getCoinTypeForReverseRegistrarChainId(
        534352,
        network,
      )

      for (const [coinType, icon, label] of [
        [2147483704, coinIcons.bnb, 'BNB Smart Chain'],
        [2147526762, coinIcons.avax, 'Avalanche C-Chain'],
        [scrollCoinType, coinIcons.scroll, 'Scroll'],
      ] as const) {
        expect(icon).toBeDefined()
        expect(getAddressPresentation(coinType)).toMatchObject({
          coinType,
          label,
          icon,
        })
      }
    })

    it('keeps names for known networks without artwork and explains the default', async () => {
      const { getAddressPresentation } = await import('./address')
      expect(getAddressPresentation(2147488648)).toMatchObject({
        label: 'Mantle',
        icon: undefined,
      })
      expect(getAddressPresentation(2147483648)).toMatchObject({
        label: 'Any EVM chain',
        icon: undefined,
      })
    })

    it('labels unknown coin types and only interprets valid ENSIP-11 chain types', async () => {
      const { getAddressPresentation } = await import('./address')
      expect(getAddressPresentation(0x80000000 + 1234567).label).toBe(
        'EVM chain 1234567',
      )
      expect(getAddressPresentation(123456789).label).toBe(
        'Coin type 123456789',
      )
      expect(getAddressPresentation(0x100000000).label).toBe(
        'Coin type 4294967296',
      )
    })
  },
)
