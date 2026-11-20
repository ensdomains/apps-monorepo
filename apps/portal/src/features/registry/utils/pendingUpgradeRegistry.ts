import { match } from 'ts-pattern'
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
    '0x43d937F91eC7597c096A1e2e6B7cbd2ddcAEb23D',
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

/** Whether roles can change and subnames be created: only once the registry is confirmed not to be pending an upgrade. */
export type UpgradeGate = 'open' | 'checking' | 'needs-upgrade'

export const getUpgradeGate = (
  isPendingUpgrade: boolean | undefined,
): UpgradeGate =>
  match(isPendingUpgrade)
    .with(false, () => 'open' as const)
    .with(true, () => 'needs-upgrade' as const)
    .with(undefined, () => 'checking' as const)
    .exhaustive()

/** A query's answer a gate may use; a failed refresh can leave an earlier answer cached, so it counts as unknown. */
export const settledData = <T>({
  data,
  error,
}: {
  readonly data: T | undefined
  readonly error: unknown
}): T | undefined => (error ? undefined : data)

/** What a role admin may do on a registry behind `gate`: edit only when it is open, and see the upgrade note when it needs one. */
export const getRoleEditing = ({
  isAdmin,
  gate,
}: {
  readonly isAdmin: boolean
  readonly gate: UpgradeGate
}): { readonly canEdit: boolean; readonly showUpgradeNote: boolean } => ({
  canEdit: isAdmin && gate === 'open',
  showUpgradeNote: isAdmin && gate === 'needs-upgrade',
})
