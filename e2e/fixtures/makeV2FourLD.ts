import { getResolver } from '@ensdomains/ensjs/public'
import { getOwner } from '@ensdomains/ensjs/public/v2'
import { setRecords, setResolver } from '@ensdomains/ensjs/wallet/v2'
import {
  type Address,
  createWalletClient,
  http,
  type PrivateKeyAccount,
} from 'viem'
import { publicClient } from '../helpers/anvil-client.js'
import {
  waitForBignameBlock,
  waitForBignameNames,
} from '../helpers/bigname-sync.js'
import { expectRecordsResolve } from '../helpers/resolve-records.js'
import { createMakeSubname } from './makeSubname.js'
import { createMakeV2Name } from './makeV2Name.js'

/** Native V2 tree. Every name is independently read back before a UI test starts. */
export async function makeV2FourLD(
  account: PrivateKeyAccount,
  options: { leafLifetimeSeconds?: number } = {},
) {
  const root = await createMakeV2Name({ userAccount: account })({
    label: 'native-fourld',
    duration: 2 * 365 * 24 * 60 * 60,
  })
  const tree = await createMakeSubname({ account })({
    parent: root,
    levels: [
      { label: 'middle' },
      {
        label: 'leaf',
        expires:
          options.leafLifetimeSeconds === undefined
            ? undefined
            : (await publicClient.getBlock()).timestamp +
              BigInt(options.leafLifetimeSeconds),
      },
    ],
  })
  const [parent, leaf] = tree.levels
  if (!parent?.subregistryAddress || !leaf)
    throw new Error('Native 4LD requires two nested registries')
  if (parent.subregistryAddress !== leaf.registryAddress)
    throw new Error('4LD must be registered in the immediate parent registry')
  const resolver = await getResolver(publicClient, { name: root })
  if (!resolver) throw new Error('Fixture resolver missing')
  const client = createWalletClient({
    account,
    chain: publicClient.chain,
    transport: http(process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'),
  })
  // Reuse the fixture's writable resolver, with records scoped to the leaf node.
  const resolverHash = await setResolver(client, {
    registryAddress: leaf.registryAddress,
    label: leaf.label,
    resolverAddress: resolver,
  })
  await publicClient.waitForTransactionReceipt({ hash: resolverHash })
  const records = {
    texts: [{ key: 'description', value: 'native V2 fourth level' }],
    addresses: [{ coinType: 60, value: account.address }],
  }
  const hash = await setRecords(client, {
    name: tree.name,
    resolverAddress: resolver,
    texts: records.texts,
    coins: [{ coin: 60, value: account.address }],
  })
  await publicClient.waitForTransactionReceipt({ hash })
  for (const name of [root, parent.name, leaf.name]) {
    const owner = (await getOwner(publicClient, { name })) as Address | null
    if (owner?.toLowerCase() !== account.address.toLowerCase())
      throw new Error(`Wrong owner for ${name}: ${owner}`)
  }
  await expectRecordsResolve(tree.name, records)
  await waitForBignameNames([root, parent.name, leaf.name])
  // Transfer also reads resolver/registry permissions written after registration.
  await waitForBignameBlock()
  return { root, parent, leaf, name: tree.name, resolver, records }
}
