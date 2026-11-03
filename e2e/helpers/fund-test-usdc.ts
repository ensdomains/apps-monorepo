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

const paymentUsdc = () =>
  getDestinationContracts(supportedL1Chains.sepolia).usdc

/** The holder's balance of the USDC the apps pay with, in base units. */
export const readTestUsdc = (holder: Address) =>
  publicClient.readContract({
    address: paymentUsdc(),
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [holder],
  })

/**
 * Fund an isolated local wallet in the USDC the apps pay with: the manifest's
 * (Circle's on Sepolia since #1395), not ensjs's MockUSDC. Unlike account zero
 * it has none seeded. Circle's FiatTokenV2_2 keeps balances in slot 9, as in
 * `infra/scripts/fund-rhinestone-account.sh`. `balance` is in base units
 * (6 decimals); pass 0n to empty the holder.
 */
export async function fundTestUsdc(
  holder: Address,
  balance: bigint = 10_000n * 10n ** 6n,
) {
  await testClient.setStorageAt({
    address: paymentUsdc(),
    index: keccak256(
      encodeAbiParameters(
        [{ type: 'address' }, { type: 'uint256' }],
        [holder, 9n],
      ),
    ),
    value: toHex(balance, { size: 32 }),
  })
  if ((await readTestUsdc(holder)) !== balance)
    throw new Error('USDC funding failed')
}
