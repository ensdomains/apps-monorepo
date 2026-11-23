/** Print the v2 owner / resolver / subregistry for one or more labels. */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { getOwner } from '@ensdomains/ensjs/public/v2'
import {
  permissionedRegistryGetResolverSnippet,
  permissionedRegistryGetSubregistrySnippet,
} from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { publicClient } from '../helpers/anvil-client.js'

const REGISTRY = ensL1Contracts[supportedL1Chains.sepolia].ensRegistry.address

for (const label of process.argv.slice(2)) {
  const [owner, resolver, subregistry] = await Promise.all([
    getOwner(publicClient as never, { name: `${label}.eth` }),
    publicClient.readContract({
      address: REGISTRY,
      abi: permissionedRegistryGetResolverSnippet,
      functionName: 'getResolver',
      args: [label],
    }),
    publicClient.readContract({
      address: REGISTRY,
      abi: permissionedRegistryGetSubregistrySnippet,
      functionName: 'getSubregistry',
      args: [label],
    }),
  ])
  console.log(`${label}.eth`)
  console.log(`  owner       ${owner}`)
  console.log(`  resolver    ${resolver}`)
  console.log(`  subregistry ${subregistry}\n`)
}
