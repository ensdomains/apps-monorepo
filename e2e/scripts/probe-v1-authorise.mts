import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { encodeFunctionData, parseAbi, zeroAddress, zeroHash } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { publicClient, testClient, walletClient } from '../helpers/anvil-client.js'

const c = ensL1Contracts[supportedL1Chains.sepolia] as Record<string, { address: `0x${string}` }>
const CTRL = c.ensEthRegistrarController.address
const BASE = c.ensBaseRegistrarImplementation.address
const WRAPPER = c.ensNameWrapper.address

const OWNABLE = parseAbi([
  'function owner() view returns (address)',
  'function controllers(address) view returns (bool)',
  'function addController(address controller)',
])
const ABI = parseAbi([
  'function makeCommitment((string,address,uint256,bytes32,address,bytes[],uint8,bytes32)) pure returns (bytes32)',
  'function commit(bytes32 commitment)',
  'function register((string,address,uint256,bytes32,address,bytes[],uint8,bytes32)) payable',
  'function rentPrice(string name, uint256 duration) view returns (uint256 base, uint256 premium)',
])
const acct = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')
const get = async (a: `0x${string}`, fn: string, args: unknown[] = []) => {
  try { return await publicClient.readContract({ address: a, abi: OWNABLE, functionName: fn as never, args: args as never }) }
  catch (e) { return `ERR ${String((e as Error).message).split('\n')[0].slice(0, 48)}` }
}

console.log('=== before ===')
console.log('base.owner()                =', await get(BASE, 'owner'))
console.log('base.controllers(ctrl)      =', await get(BASE, 'controllers', [CTRL]))
console.log('base.controllers(wrapper)   =', await get(BASE, 'controllers', [WRAPPER]))
console.log('wrapper.owner()             =', await get(WRAPPER, 'owner'))
console.log('wrapper.controllers(ctrl)   =', await get(WRAPPER, 'controllers', [CTRL]))

// Authorise the controller on both, impersonating each contract's owner.
for (const [what, target] of [['base', BASE], ['wrapper', WRAPPER]] as const) {
  const owner = (await get(target, 'owner')) as `0x${string}`
  if (typeof owner !== 'string' || !owner.startsWith('0x')) { console.log(`skip ${what}: no owner()`); continue }
  try {
    await testClient.setBalance({ address: owner, value: 10n ** 18n })
    await testClient.impersonateAccount({ address: owner })
    const tx = await walletClient.sendTransaction({ account: owner, to: target, data: encodeFunctionData({ abi: OWNABLE, functionName: 'addController', args: [CTRL] }) })
    await publicClient.waitForTransactionReceipt({ hash: tx })
    console.log(`addController on ${what}: OK`)
  } catch (e) { console.log(`addController on ${what}: ERR ${String((e as Error).message).split('\n')[0].slice(0, 90)}`) }
  finally { await testClient.stopImpersonatingAccount({ address: owner }) }
}

console.log('\n=== after ===')
console.log('base.controllers(ctrl)      =', await get(BASE, 'controllers', [CTRL]))
console.log('wrapper.controllers(ctrl)   =', await get(WRAPPER, 'controllers', [CTRL]))

const label = `probe-auth-${await publicClient.getBlockNumber()}`
const reg = [label, acct.address, 31536000n, zeroHash, zeroAddress, [], 0, zeroHash] as const
const commitment = await publicClient.readContract({ address: CTRL, abi: ABI, functionName: 'makeCommitment', args: [reg as never] })
const tx = await walletClient.sendTransaction({ account: acct, to: CTRL, data: encodeFunctionData({ abi: ABI, functionName: 'commit', args: [commitment] }) })
await publicClient.waitForTransactionReceipt({ hash: tx })
await testClient.increaseTime({ seconds: 61 }); await testClient.mine({ blocks: 1 })
const [b, p] = await publicClient.readContract({ address: CTRL, abi: ABI, functionName: 'rentPrice', args: [label, 31536000n] })
try {
  await publicClient.simulateContract({ address: CTRL, abi: ABI, functionName: 'register', args: [reg as never], value: ((b + p) * 110n) / 100n, account: acct })
  console.log(`\nregister on the ensjs controller: SIMULATION OK  (${label})`)
} catch (e) {
  const err = e as { shortMessage?: string; cause?: { reason?: string } }
  console.log(`\nregister still reverts: ${err.shortMessage} · ${err.cause?.reason ?? '—'}`)
}
