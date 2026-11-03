import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { type Address, namehash } from 'viem'
import type { RpcSubnameInventory } from './readRpcSubnameInventory'

type InventorySource = {
  readonly chainId: number
  readonly registryAddress: Address
  readonly nameWrapperAddress: Address
}

export const getRpcSubnameInventoryCacheKey = (
  params: InventorySource & { readonly ownerAddress: string },
) =>
  qk('migration', 'rpc_subname_inventory', {
    ownerAddress: params.ownerAddress.toLowerCase(),
    chainId: params.chainId,
    registryAddress: params.registryAddress.toLowerCase(),
    nameWrapperAddress: params.nameWrapperAddress.toLowerCase(),
  })

export const getReusableRpcSubnameInventory = (
  params: InventorySource & {
    readonly inventory: RpcSubnameInventory | undefined
    readonly names: readonly string[]
  },
): RpcSubnameInventory | undefined => {
  const { inventory } = params
  if (
    !inventory ||
    inventory.chainId !== params.chainId ||
    inventory.registryAddress.toLowerCase() !==
      params.registryAddress.toLowerCase() ||
    inventory.nameWrapperAddress.toLowerCase() !==
      params.nameWrapperAddress.toLowerCase()
  )
    return undefined

  const rootNodes = new Set(inventory.roots.map(({ node }) => node))
  const sourceNodes = new Set(inventory.rootSources.map(({ node }) => node))
  const scannedNodes = new Set(inventory.scannedParentNodes)
  const hasRequestedRoots = params.names.every((name) => {
    const node = namehash(name.toLowerCase())
    return (
      rootNodes.has(node) && sourceNodes.has(node) && scannedNodes.has(node)
    )
  })
  return hasRequestedRoots ? inventory : undefined
}
