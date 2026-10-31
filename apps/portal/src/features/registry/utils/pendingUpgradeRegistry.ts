import { type Address, isAddressEqual } from 'viem'
import { mainnet, sepolia } from 'viem/chains'

// UserRegistry implementations that registries should move off before their root roles are given up.
const PENDING_UPGRADE_IMPLEMENTATIONS: Readonly<
  Record<number, readonly Address[]>
> = {
  [mainnet.id]: [
    '0x75FF9AdBcFcE2469B097AC68f6Ae650EaE1351Bb',
    '0xFAA23592ACA10A6d8875b18eA86954e8EB6d8d72',
    '0xC927bCaA77cd7bE283518760896Be0CF3Cfbe08d',
    '0x664814F5bD5E6E617742029fA781bbee6c230Dc0',
  ],
  [sepolia.id]: [
    '0x9BD8a88719068D09ecee662f36C0E3856708366a',
    '0x0F99e7Ea74903AfCB7224d0354fD7428A6f92917',
    '0x840Fa461059862Ea466A711E8C98c8dE732061C0',
    '0x624a25d67B59D587752EbEc8DdeD8827dAe52050',
    '0xA80338aAA8D23831cEa25E858D1774534aBb0263',
    '0xb146A81b83Ac63065aeAFA16F25971f70176143E',
    '0xEa93AFf7375E8176053ab6ab36B57cab53CbF702',
  ],
}

export const isPendingUpgradeImplementation = ({
  chainId,
  implementation,
}: {
  readonly chainId: number
  readonly implementation: Address | null
}): boolean =>
  implementation !== null &&
  (PENDING_UPGRADE_IMPLEMENTATIONS[chainId] ?? []).some((listed) =>
    isAddressEqual(listed, implementation),
  )

/** A pasted registry can't be used until it is confirmed not to be pending an upgrade. */
export const isPastedRegistryBlocked = ({
  isPasted,
  isPendingUpgrade,
}: {
  readonly isPasted: boolean
  readonly isPendingUpgrade: boolean | undefined
}): boolean => isPasted && isPendingUpgrade !== false
