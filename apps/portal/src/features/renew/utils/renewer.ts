import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import type { Address } from 'viem'
import { sepoliaWithEns } from '@/lib/wagmi'

// ENSv2-native renewer for legacy (ENSv1) names that have NOT yet been migrated.
// ENS revoked all legacy `ETHRegistrarController`s at the v2 migration cutover,
// so v1 names can no longer be renewed through them — `ETHRenewerV1` is the
// contract that renews an unmigrated v1 name (ERC-20) and syncs the underlying
// BaseRegistrar. Verified on-chain: implements `IETHRenewer`, authorized on the
// v1 BaseRegistrar (0x57f1…), GRACE_PERIOD = 90d.
//
// NOTE: not exposed by ensjs chain config — confirm this address with the
// contracts team before mainnet.
const ETH_RENEWER_V1_ADDRESS: Address =
  '0x1be516ae1b72765ae55bd5e9ca628c9058a1c622'

const ethRegistrar = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensEthRegistrar',
})

/**
 * The renewer contract to call for a name: the v2 `ETHRegistrar` for migrated /
 * v2-native names, or `ETHRenewerV1` for unmigrated v1 names. Both expose the
 * same `getRenewPrice` / `renew(label,duration,token,referrer)` ERC-20 interface
 * and are the ERC-20 spender for the approval step.
 */
export const getRenewerAddress = (isV2: boolean): Address =>
  isV2 ? ethRegistrar : ETH_RENEWER_V1_ADDRESS
