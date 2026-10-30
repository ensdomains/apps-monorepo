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
  ],
  [sepolia.id]: ['0x9BD8a88719068D09ecee662f36C0E3856708366a'],
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
