import { encodeContentHash, getCoderFromCoin } from '@ensdomains/ensjs/utils'
import {
  type Address,
  bytesToHex,
  encodeFunctionData,
  type Hex,
  namehash,
  toHex,
  zeroAddress,
} from 'viem'
import type { PrivateKeyAccount } from 'viem/accounts'
import {
  V1_ENS_REGISTRY,
  V1_NAME_WRAPPER,
  V1_PUBLIC_RESOLVER,
} from '../../../fixtures/makeV1Name.js'
import {
  RESOLVER_ABI,
  setV1RecordsOn,
  type V1Records,
} from '../../../fixtures/v1-records.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import custom from '../artifacts/CustomLegacyResolver.json' with {
  type: 'json',
}
import wrapper from '../artifacts/CustomNameWrapperAwareResolver.json' with {
  type: 'json',
}
import legacy from '../artifacts/LegacyResolverV5.json' with { type: 'json' }
import owned from '../artifacts/OwnedResolver.json' with { type: 'json' }
export const encodeCoin = (coin: string, value: string) =>
  bytesToHex(getCoderFromCoin(coin).decode(value))
export const defaults = (address: Address): V1Records => ({
  texts: [
    { key: 'description', value: 'Hello2' },
    { key: 'url', value: 'https://twitter.com' },
    { key: 'email', value: 'fakeemail@fake.com' },
  ],
  addresses: [
    {
      coinType: 0,
      value: encodeCoin('btc', 'bc1qjqg9slurvjukfl92wp58y94480fvh4uc2pwa6n'),
    },
    { coinType: 61, value: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' },
    { coinType: 60, value: address },
  ],
  contenthash: encodeContentHash(
    'ipfs://bafybeico3uuyj3vphxpvbowchdwjlrlrh62awxscrnii7w7flu5z6fk77y',
  ) as Hex,
  abis: [{ contentType: 1, data: toHex('{"test":"test"}') }],
})
const singleCallResolvers = new Set<string>()
export async function profileResolver(
  kind: 'legacy' | 'custom' | 'wrapper' | 'public' | 'owned',
  account: PrivateKeyAccount,
) {
  if (kind === 'public') return V1_PUBLIC_RESOLVER
  const artifact =
    kind === 'owned'
      ? owned
      : kind === 'legacy'
        ? legacy
        : kind === 'custom'
          ? custom
          : wrapper
  // Trusted controller/reverse addresses are unnecessary for owner writes in these isolated custom fixtures.
  const args =
    kind === 'owned'
      ? []
      : kind === 'wrapper'
        ? [V1_ENS_REGISTRY, V1_NAME_WRAPPER, zeroAddress, zeroAddress]
        : [V1_ENS_REGISTRY]
  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode as Hex,
    args,
    account,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success' || !receipt.contractAddress)
    throw new Error('Legacy resolver deployment failed')
  if (!artifact.abi.some((x) => 'name' in x && x.name === 'multicall'))
    singleCallResolvers.add(receipt.contractAddress.toLowerCase())
  return receipt.contractAddress
}

export async function seedProfileRecords(
  name: string,
  account: PrivateKeyAccount,
  wrapped: boolean,
  records: V1Records,
  options?: { resolver?: Address },
) {
  if (
    !options?.resolver ||
    !singleCallResolvers.has(options.resolver.toLowerCase())
  )
    return setV1RecordsOn(name, account, wrapped, records, options)
  await setV1RecordsOn(name, account, wrapped, {}, options)
  const node = namehash(name),
    calls: Hex[] = []
  for (const t of records.texts ?? [])
    calls.push(
      encodeFunctionData({
        abi: RESOLVER_ABI,
        functionName: 'setText',
        args: [node, t.key, t.value],
      }),
    )
  for (const a of records.addresses ?? [])
    calls.push(
      encodeFunctionData({
        abi: RESOLVER_ABI,
        functionName: 'setAddr',
        args: [node, BigInt(a.coinType), a.value],
      }),
    )
  if (records.contenthash)
    calls.push(
      encodeFunctionData({
        abi: RESOLVER_ABI,
        functionName: 'setContenthash',
        args: [node, records.contenthash],
      }),
    )
  for (const a of records.abis ?? [])
    calls.push(
      encodeFunctionData({
        abi: RESOLVER_ABI,
        functionName: 'setABI',
        args: [node, BigInt(a.contentType), a.data],
      }),
    )
  for (const data of calls) {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: await walletClient.sendTransaction({
        account,
        to: options.resolver,
        data,
      }),
    })
    if (receipt.status !== 'success')
      throw new Error('Single-call legacy resolver fixture write failed')
  }
}
