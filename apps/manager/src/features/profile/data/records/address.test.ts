import { coinTypeToNameMap } from '@ensdomains/address-encoder'
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
        [
          scrollCoinType,
          coinIcons.scroll,
          network === 'sepolia' ? 'Scroll Sepolia' : 'Scroll',
        ],
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
      expect(getAddressPresentation(2147483817)).toMatchObject({
        label: 'Manta Pacific',
        icon: undefined,
      })
      expect(getAddressPresentation(2147483648)).toMatchObject({
        label: 'Any EVM chain',
        icon: undefined,
      })
    })

    it('preserves every encoder name regardless of the deployment network', async () => {
      const { getAddressPresentation } = await import('./address')
      for (const coinType of Object.keys(coinTypeToNameMap).map(Number)) {
        expect(getAddressPresentation(coinType).label).not.toMatch(
          /^(EVM chain|Coin type) /,
        )
      }
    })

    it('recognizes canonical and Sepolia L2s while only offering deployment coin types', async () => {
      const { addressRecords, getAddressPresentation } = await import(
        './address'
      )
      const { getCoinTypeForReverseRegistrarChainId } = await import(
        '@ens-apps/l2-primary/v1'
      )
      for (const [chainId, name, icon] of [
        [10, 'Optimism', coinIcons.op],
        [42161, 'Arbitrum One', coinIcons.arb1],
        [8453, 'Base', coinIcons.base],
        [59144, 'Linea', coinIcons.linea],
        [534352, 'Scroll', coinIcons.scroll],
      ] as const) {
        const canonicalCoinType = getCoinTypeForReverseRegistrarChainId(
          chainId,
          'mainnet',
        )
        const sepoliaCoinType = getCoinTypeForReverseRegistrarChainId(
          chainId,
          'sepolia',
        )
        expect(icon).toBeDefined()
        expect(getAddressPresentation(canonicalCoinType)).toMatchObject({
          coinType: canonicalCoinType,
          label: name,
          icon,
        })
        expect(getAddressPresentation(sepoliaCoinType)).toMatchObject({
          coinType: sepoliaCoinType,
          label: `${name} Sepolia`,
          icon,
        })
        const offeredCoinTypes = addressRecords.map(({ coinType }) => coinType)
        expect(offeredCoinTypes).toContain(
          network === 'mainnet' ? canonicalCoinType : sepoliaCoinType,
        )
        expect(offeredCoinTypes).not.toContain(
          network === 'mainnet' ? sepoliaCoinType : canonicalCoinType,
        )
      }
    })

    it('reuses available legacy artwork without losing legacy record identity', async () => {
      const { getAddressPresentation } = await import('./address')
      for (const [coinType, [notation, name]] of Object.entries(
        coinTypeToNameMap,
      )) {
        if (!notation.endsWith('Legacy')) continue
        const icon = coinIcons[notation.replace(/Legacy$/, '')]
        if (!icon) continue
        expect(getAddressPresentation(Number(coinType))).toMatchObject({
          coinType: Number(coinType),
          label: name,
          icon,
        })
      }
    })

    it('supplies Explorer Mantle artwork and local brand components for additional coins', async () => {
      const { getAddressPresentation } = await import('./address')
      expect(coinIcons.mantle).toBeDefined()
      expect(getAddressPresentation(2147488648)).toMatchObject({
        label: 'Mantle',
        icon: coinIcons.mantle,
      })
      for (const coinType of [236, 784, 8444]) {
        expect(getAddressPresentation(coinType).icon).toBeTypeOf('function')
      }
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
