/** Local-only manual fixture: preserve the legacy object payload without UI validation. */
import { mkdir, writeFile } from 'node:fs/promises'
import { bytesToHex, hexToString, namehash, toHex } from 'viem'
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts'
import { createMakeV1Name, V1_PUBLIC_RESOLVER } from '../fixtures/makeV1Name.js'
import { RESOLVER_ABI, setV1RecordsOn } from '../fixtures/v1-records.js'
import { publicClient } from '../helpers/anvil-client.js'

const hd = mnemonicToAccount(
  'test test test test test test test test test test test junk',
).getHdKey()
if (!hd.privateKey) throw new Error('Local test account unavailable')
const account = privateKeyToAccount(bytesToHex(hd.privateKey))
const chainId = await publicClient.getChainId()
if (chainId !== 11155111) throw new Error('Expected local Sepolia fork')
const name = await createMakeV1Name({ userAccount: account })({
  label: process.env.G21_LABEL ?? 'g21-json-object',
  type: 'unwrapped',
})
await setV1RecordsOn(name, account, false, {
  texts: [{ key: 'description', value: 'G21 manual ABI compatibility test' }],
  abis: [{ contentType: 1, data: toHex('{"test":"test"}') }],
})
const [contentType, data] = await publicClient.readContract({
  address: V1_PUBLIC_RESOLVER,
  abi: RESOLVER_ABI,
  functionName: 'ABI',
  args: [namehash(name), 1n],
})
if (contentType !== 1n || hexToString(data) !== '{"test":"test"}')
  throw new Error('ABI verification failed')
const manifest = {
  finding: 'G21',
  name,
  owner: account.address,
  resolver: V1_PUBLIC_RESOLVER,
  chainId,
  abi: hexToString(data),
  contentType: Number(contentType),
  explorer: `http://localhost:3011/${name}/records`,
  editor: `http://localhost:3011/${name}/edit-records`,
  note: 'Direct JSON object fixture on public resolver; isolates G21 from legacy resolver multicall issues. Original L026 used a URI-backed ABI before entering an updated JSON object.',
}
await mkdir(new URL('../test-results/', import.meta.url), { recursive: true })
await writeFile(
  new URL('../test-results/g21-manual-env.json', import.meta.url),
  JSON.stringify(manifest, null, 2) + '\n',
)
console.log(JSON.stringify(manifest, null, 2))
