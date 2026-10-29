import { type Address, isAddressEqual } from 'viem'
import { mainnet } from 'viem/chains'

// UserRegistry implementations that allow an upgrade to other code and back,
// so a registry running one can't be verified (WEB-2028).
const UNTRUSTED_REGISTRY_IMPLEMENTATIONS: Readonly<
  Record<number, readonly Address[]>
> = {
  [mainnet.id]: [
    '0xFAA23592ACA10A6d8875b18eA86954e8EB6d8d72', // deployments/mainnet
    '0x75FF9AdBcFcE2469B097AC68f6Ae650EaE1351Bb', // deployments/mainnet-redeploy-20261026
  ],
}

export const isUntrustedRegistryImplementation = ({
  chainId,
  implementation,
}: {
  readonly chainId: number
  readonly implementation: Address | null
}): boolean =>
  implementation !== null &&
  (UNTRUSTED_REGISTRY_IMPLEMENTATIONS[chainId] ?? []).some((untrusted) =>
    isAddressEqual(untrusted, implementation),
  )
