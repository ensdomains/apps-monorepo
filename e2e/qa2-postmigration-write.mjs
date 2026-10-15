/**
 * After a `Custom Res` name has migrated, can its owner still edit the records?
 *
 * The V2 name points at the V1 resolver, which authorises writes off V1
 * ownership — and migration hands the V1 token to the migration receiver. Pass a
 * migrated name: `node qa2-postmigration-write.mjs dev5073.eth`.
 */
import { encodeFunctionData, namehash, parseAbi } from 'viem'
import { client, rpc, WALLET } from './qa2-lib.mjs'

const NAME = process.argv[2]
if (!NAME) throw new Error('usage: node qa2-postmigration-write.mjs <name.eth>')

const CUSTOM_RESOLVER = '0xC0FFEe0000000000000000000000000000000001'
const V1_ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
const node = namehash(NAME)

const v1RegistryOwner = await client.readContract({
  address: V1_ENS_REGISTRY,
  abi: parseAbi(['function owner(bytes32) view returns (address)']),
  functionName: 'owner',
  args: [node],
})

const data = encodeFunctionData({
  abi: parseAbi(['function setText(bytes32 node, string key, string value)']),
  functionName: 'setText',
  args: [node, 'description', 'edited after migration'],
})

let setTextFromWallet
try {
  await rpc('eth_call', [{ from: WALLET, to: CUSTOM_RESOLVER, data }, 'latest'])
  setTextFromWallet = 'ACCEPTED'
} catch (e) {
  setTextFromWallet = `REVERTED: ${String(e.message).slice(0, 140)}`
}

console.log(
  JSON.stringify(
    { name: NAME, wallet: WALLET, v1RegistryOwner, setTextFromWallet },
    null,
    2,
  ),
)
