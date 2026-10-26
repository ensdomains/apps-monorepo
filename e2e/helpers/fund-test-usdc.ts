import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import {
  type Address,
  encodeAbiParameters,
  erc20Abi,
  keccak256,
  toHex,
} from 'viem'
import { publicClient, testClient } from './anvil-client.js'

/** Fund an isolated local wallet; unlike account zero it has no seeded USDC. */
export async function fundTestUsdc(holder: Address) {
  const token = ensL1Contracts[supportedL1Chains.sepolia].usdc.address
  const balance = 10_000n * 10n ** 6n
  await testClient.setStorageAt({
    address: token,
    index: keccak256(
      encodeAbiParameters(
        [{ type: 'address' }, { type: 'uint256' }],
        [holder, 0n],
      ),
    ),
    value: toHex(balance, { size: 32 }),
  })
  const actual = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [holder],
  })
  if (actual !== balance) throw new Error('Isolated wallet USDC funding failed')
}
