/**
 * Transfer an ENSv2 .eth name on chain, the way the explorer's transfer flow
 * does it: optionally detach the resolver (`setResolver(id, 0)`), then
 * `safeTransferFrom` the token. For tests that need the *result* of a
 * transfer and then observe it elsewhere (the manager, the other party), not
 * tests of the transfer UI itself (`projects/portal/tests/transfer.spec.ts`).
 *
 * The well-known Anvil accounts all carry EIP-7702 delegations on Sepolia
 * (someone set them on the real chain), and the delegate refuses ERC-1155
 * tokens, so a safe transfer to them reverts. The recipient's code is cleared
 * first, as the manager fixture does for `user`.
 */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import {
  type Address,
  encodeFunctionData,
  labelhash,
  parseAbi,
  zeroAddress,
} from 'viem'
import type { privateKeyToAccount } from 'viem/accounts'

import { publicClient, testClient, walletClient } from './anvil-client.js'

const ETH_REGISTRY = ensL1Contracts[supportedL1Chains.sepolia].ensRegistry
  .address as Address

const ABI = parseAbi([
  'function getTokenId(uint256 anyId) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function roles(uint256 anyId, address account) view returns (uint256)',
  'function getResolver(string label) view returns (address)',
  'function setResolver(uint256 anyId, address resolver)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
])

type Signer = ReturnType<typeof privateKeyToAccount>

const tokenIdOf = (label: string) =>
  publicClient.readContract({
    address: ETH_REGISTRY,
    abi: ABI,
    functionName: 'getTokenId',
    args: [BigInt(labelhash(label))],
  })

async function send(from: Signer, data: `0x${string}`, what: string) {
  const hash = await walletClient.sendTransaction({
    account: from,
    to: ETH_REGISTRY,
    data,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success')
    throw new Error(`[v2-transfer] ${what} reverted (tx ${hash})`)
}

export async function transferV2Name(config: {
  /** The 2LD label, without `.eth`. */
  readonly label: string
  readonly from: Signer
  readonly to: Address
  readonly detachResolver: boolean
}): Promise<void> {
  const { label, from, to, detachResolver } = config
  await testClient.setCode({ address: to, bytecode: '0x' })
  if (detachResolver)
    await send(
      from,
      encodeFunctionData({
        abi: ABI,
        functionName: 'setResolver',
        args: [await tokenIdOf(label), zeroAddress],
      }),
      `setResolver(${label}.eth, 0)`,
    )
  await send(
    from,
    encodeFunctionData({
      abi: ABI,
      functionName: 'safeTransferFrom',
      args: [from.address, to, await tokenIdOf(label), 1n, '0x'],
    }),
    `safeTransferFrom(${label}.eth → ${to})`,
  )
  console.log(
    `[v2-transfer] ${label}.eth → ${to}${detachResolver ? ' (resolver detached)' : ''}`,
  )
}

/** The token's current holder and the registry roles `account` holds on it. */
export async function readV2Holding(
  label: string,
  account: Address,
): Promise<{ owner: Address; roles: bigint; resolver: Address }> {
  const tokenId = await tokenIdOf(label)
  const [owner, roles, resolver] = await Promise.all([
    publicClient.readContract({
      address: ETH_REGISTRY,
      abi: ABI,
      functionName: 'ownerOf',
      args: [tokenId],
    }),
    publicClient.readContract({
      address: ETH_REGISTRY,
      abi: ABI,
      functionName: 'roles',
      args: [tokenId, account],
    }),
    publicClient.readContract({
      address: ETH_REGISTRY,
      abi: ABI,
      functionName: 'getResolver',
      args: [label],
    }),
  ])
  return { owner, roles, resolver }
}
