import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { encodeFunctionData, parseAbi, zeroAddress, zeroHash } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { publicClient, testClient, walletClient } from '../helpers/anvil-client.js'

const c = ensL1Contracts[supportedL1Chains.sepolia] as Record<string, { address: `0x${string}` }>
const CTRLS = {
  fixture: '0xF42dF26c1b222bee5a6B78cBB8bbfaa0Ba07786a' as const,
  ensjs: c.ensEthRegistrarController.address,
}
const ABI = parseAbi([
  'function makeCommitment((string,address,uint256,bytes32,address,bytes[],uint8,bytes32)) pure returns (bytes32)',
  'function commit(bytes32 commitment)',
  'function register((string,address,uint256,bytes32,address,bytes[],uint8,bytes32)) payable',
  'function rentPrice(string name, uint256 duration) view returns (uint256 base, uint256 premium)',
])
const acct = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')

for (const [name, ctrl] of Object.entries(CTRLS)) {
  const label = `probe-${name}-${Math.floor(Number(await publicClient.getBlockNumber()))}`
  const reg = [label, acct.address, 31536000n, zeroHash, zeroAddress, [], 0, zeroHash] as const
  console.log(`\n=== ${name} · ${ctrl} · ${label} ===`)
  try {
    const commitment = await publicClient.readContract({ address: ctrl, abi: ABI, functionName: 'makeCommitment', args: [reg as never] })
    const tx = await walletClient.sendTransaction({ account: acct, to: ctrl, data: encodeFunctionData({ abi: ABI, functionName: 'commit', args: [commitment] }) })
    await publicClient.waitForTransactionReceipt({ hash: tx })
    await testClient.increaseTime({ seconds: 61 }); await testClient.mine({ blocks: 1 })
    const [base, premium] = await publicClient.readContract({ address: ctrl, abi: ABI, functionName: 'rentPrice', args: [label, 31536000n] })
    const value = ((base + premium) * 110n) / 100n
    console.log(`  committed ok · price base=${base} premium=${premium} · sending value=${value}`)
    await publicClient.simulateContract({ address: ctrl, abi: ABI, functionName: 'register', args: [reg as never], value, account: acct })
    console.log('  register SIMULATION OK')
  } catch (e) {
    const err = e as { shortMessage?: string; metaMessages?: string[]; cause?: { data?: unknown; reason?: string; errorName?: string; shortMessage?: string } }
    console.log('  shortMessage :', err.shortMessage)
    console.log('  cause.reason :', err.cause?.reason ?? '—')
    console.log('  cause.errName:', err.cause?.errorName ?? '—')
    console.log('  cause.data   :', JSON.stringify(err.cause?.data ?? '—').slice(0, 200))
    if (err.metaMessages?.length) console.log('  meta         :', err.metaMessages.slice(0, 4).join(' | ').slice(0, 260))
  }
}
