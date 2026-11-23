import { userRegistryRenewSnippet } from '@ensdomains/ensjs-abi/v2/userRegistry'
import {
  type Address,
  createWalletClient,
  decodeFunctionData,
  type Hex,
  http,
  keccak256,
  labelhash,
  toFunctionSelector,
  toHex,
} from 'viem'
import { sepolia } from 'viem/chains'
import { expect, it } from 'vitest'
import { resourceIdFromChainValue } from '@/lib/resource/resourceId'
import { prepareExtendSubnameExpiryTransaction } from './extend-subname-expiry.helpers'

const OWNER: Address = '0x7Bc153b2a4C8a2f3428bd0da77a901b81c6dD809'
const REGISTRY: Address = '0x666b3d735e366bb8755b65cb5bf7a14c7f41eb23'

const walletClient = createWalletClient({
  account: OWNER,
  chain: sepolia,
  transport: http(),
})

it('renews the id the row carries to the new expiry, on the subregistry', () => {
  // A label written as `[<labelhash("vault")>]` was hashed as those characters (WEB-1458).
  const resourceId = resourceIdFromChainValue(
    keccak256(toHex(`[${labelhash('vault').slice(2)}]`)),
  )._unsafeUnwrap()
  const expires = 1_900_000_000n

  const { request } = prepareExtendSubnameExpiryTransaction({
    registryAddress: REGISTRY,
    resourceId,
    expires,
    walletClient,
    chainId: sepolia.id,
    subname: 'vault.parent.eth',
  })
  if (request.type !== 'eoa') throw new Error('expected an EOA request')
  const data = request.data as Hex

  expect(request.to).toBe(REGISTRY)
  expect(data.slice(0, 10)).toBe(toFunctionSelector('renew(uint256,uint64)'))
  expect(
    decodeFunctionData({ abi: userRegistryRenewSnippet, data }).args,
  ).toEqual([resourceId, expires])
})
