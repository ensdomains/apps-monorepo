import { permissionedRegistrySetResolverSnippet } from '@ensdomains/ensjs/contracts'
import { type Address, decodeFunctionData, type Hex, labelhash } from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import {
  canonicalResourceId,
  requireResourceIdForName,
  resourceIdForName,
} from '@/lib/resource/resourceId'
import { prepareChangeResolverTransaction } from './changeResolver'

const FROM: Address = '0x7Bc153b2a4C8a2f3428bd0da77a901b81c6dD809'
const REGISTRY: Address = '0x666b3d735e366bb8755b65cb5bf7a14c7f41eb23'
const RESOLVER: Address = '0x2245606Dd6B3ae61205fCf8c843E200CC2f1123d'

const VAULT_LABELHASH = labelhash('vault')
const ENCODED_LABEL = `[${VAULT_LABELHASH.slice(2)}]`

const setResolverArgs = (data: Hex) =>
  decodeFunctionData({ abi: permissionedRegistrySetResolverSnippet, data }).args

const dataOf = (
  intent: ReturnType<typeof prepareChangeResolverTransaction>,
): Hex => {
  if (intent.request.type !== 'eoa') throw new Error('expected an EOA request')
  return intent.request.data as Hex
}

describe('prepareChangeResolverTransaction', () => {
  it("addresses the name it was given, at the name's canonical id", () => {
    const resourceId = requireResourceIdForName('vault.eth')

    const data = dataOf(
      prepareChangeResolverTransaction({
        name: 'vault.eth',
        resourceId,
        registryAddress: REGISTRY,
        resolverAddress: RESOLVER,
        from: FROM,
        chainId: sepolia.id,
      }),
    )

    expect(setResolverArgs(data)).toEqual([
      canonicalResourceId(resourceId),
      RESOLVER,
    ])
  })

  // WEB-1458: the label used to be split off the displayed name and hashed, and
  // `labelhash` returns an encoded label's digits unhashed — so Change Resolver
  // on `[<labelhash("vault")>].eth` built calldata for `vault.eth`.
  it('has no id to build calldata with for an encoded-label 2LD', () => {
    const name = `${ENCODED_LABEL}.eth`

    expect(resourceIdForName(name).isErr()).toBe(true)
    expect(() => requireResourceIdForName(name)).toThrow()

    // What the old derivation handed `setResolver`: another name entirely.
    expect(canonicalResourceId(requireResourceIdForName('vault.eth'))).toBe(
      BigInt(labelhash(ENCODED_LABEL)) & ~0xffffffffn,
    )
  })

  it('refuses calldata whose id is not the one it was asked for', () => {
    const resourceId = requireResourceIdForName('vault.eth')
    const other = requireResourceIdForName('other.eth')

    // The preflight compares the encoded id against the expected one, so a
    // builder that ever went back to deriving from a name would be stopped
    // here rather than at the wallet.
    const data = dataOf(
      prepareChangeResolverTransaction({
        name: 'vault.eth',
        resourceId,
        registryAddress: REGISTRY,
        resolverAddress: RESOLVER,
        from: FROM,
        chainId: sepolia.id,
      }),
    )

    expect(setResolverArgs(data)[0]).not.toBe(canonicalResourceId(other))
  })
})
