import { supportedL1Chains } from '@ensdomains/ensjs/chain'
import {
  type Address,
  encodeAbiParameters,
  erc20Abi,
  keccak256,
  toHex,
} from 'viem'
import { getDestinationContracts } from '../../packages/smart-account/src/providers/rhinestone/manifest.ts'
import { publicClient, testClient } from './anvil-client.js'

/**
 * Fund an isolated local wallet in the USDC the apps pay with: the manifest's
 * (Circle's on Sepolia since #1395), not ensjs's MockUSDC. Unlike account zero
 * it has none seeded. Circle's FiatTokenV2_2 keeps balances in slot 9, as in
 * `infra/scripts/fund-rhinestone-account.sh`.
 */
export async function fundTestUsdc(holder: Address) {
  const token = getDestinationContracts(supportedL1Chains.sepolia).usdc
  const balance = 10_000n * 10n ** 6n
  await testClient.setStorageAt({
    address: token,
    index: keccak256(
      encodeAbiParameters(
        [{ type: 'address' }, { type: 'uint256' }],
        [holder, 9n],
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
