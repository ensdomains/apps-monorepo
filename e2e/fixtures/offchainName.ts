/**
 * makeOffchainName — a V1 .eth name whose resolver answers only through
 * CCIP-Read, served by the local gateway in `helpers/ccip-gateway.ts`.
 *
 * This is the shape of a Namespace / Coinbase offchain name: the 2LD is
 * registered onchain and points at an ENSIP-10 resolver, and its subnames have
 * no registry entry at all — they resolve by wildcard through the parent's
 * resolver, so they have no owner anywhere (#1575).
 */
import {
  type Address,
  encodeFunctionData,
  type Hex,
  namehash,
  parseAbi,
} from 'viem'
import type { privateKeyToAccount } from 'viem/accounts'
import resolverArtifact from '../contracts/artifacts/TestOffchainResolver.json' with {
  type: 'json',
}
import {
  publicClient,
  testClient,
  walletClient,
} from '../helpers/anvil-client.js'
import { waitForBignameName } from '../helpers/bigname-sync.js'
import type { CcipGateway, OffchainRecords } from '../helpers/ccip-gateway.js'
import {
  createMakeV1Name,
  V1_ENS_REGISTRY,
  V1_NAME_WRAPPER,
  type V1NameType,
} from './makeV1Name.js'

const REGISTRY_ABI = parseAbi([
  'function setResolver(bytes32 node, address resolver)',
])

/** Records an offchain profile shows on both apps' profile pages. */
export const OFFCHAIN_RECORDS = {
  texts: {
    description: 'Resolved through CCIP-Read',
    url: 'https://offchain.example',
    'com.github': 'offchain-e2e',
    'com.twitter': 'offchain_e2e',
  },
  coins: {
    60: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  },
} as const satisfies OffchainRecords

export const OFFCHAIN_SUBNAME_RECORDS = {
  texts: {
    description: 'Wildcard subname with no registry entry',
    'com.github': 'offchain-subname-e2e',
  },
  coins: {
    60: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  },
} as const satisfies OffchainRecords

export type OffchainName = {
  /** The registered 2LD, owned by the fixture's account. */
  name: string
  /** `alice.<name>`: resolves by wildcard and has no owner. */
  subname: string
  resolver: Address
}

export type OffchainNameConfig = {
  label?: string
  /** V1 shape of the 2LD (default `unwrapped`); see `makeV1Name`. */
  type?: V1NameType
  records?: OffchainRecords
  subnameRecords?: OffchainRecords
}

export async function deployOffchainResolver(
  gatewayUrl: string,
  account: ReturnType<typeof privateKeyToAccount>,
): Promise<Address> {
  const hash = await walletClient.deployContract({
    abi: resolverArtifact.abi,
    bytecode: resolverArtifact.bytecode as Hex,
    args: [[gatewayUrl]],
    account,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success' || !receipt.contractAddress)
    throw new Error('[makeOffchainName] TestOffchainResolver deployment failed')
  return receipt.contractAddress
}

export function createMakeOffchainName({
  gateway,
  userAccount,
}: {
  gateway: Pick<CcipGateway, 'url' | 'setRecords'>
  userAccount: ReturnType<typeof privateKeyToAccount>
}) {
  const makeV1Name = createMakeV1Name({ userAccount })

  return async function makeOffchainName(
    config: OffchainNameConfig = {},
  ): Promise<OffchainName> {
    // Account 0 carries leftover contract code on the Sepolia fork, and a
    // sender with code is rejected (EIP-3607).
    await testClient.setCode({ address: userAccount.address, bytecode: '0x' })
    // Sequential: both send from userAccount, and parallel sends race the nonce.
    const name = await makeV1Name({
      label: config.label ?? 'offchain',
      type: config.type,
    })
    const resolver = await deployOffchainResolver(gateway.url, userAccount)
    // A wrapped name's registry owner is the NameWrapper, which sets the
    // resolver on the owner's behalf (same signature as the registry's).
    const wrapped = config.type === 'wrapped' || config.type === 'locked'
    const hash = await walletClient.sendTransaction({
      account: userAccount,
      to: wrapped ? V1_NAME_WRAPPER : V1_ENS_REGISTRY,
      data: encodeFunctionData({
        abi: REGISTRY_ABI,
        functionName: 'setResolver',
        args: [namehash(name), resolver],
      }),
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success')
      throw new Error(`[makeOffchainName] setResolver on ${name} reverted`)

    const subname = `alice.${name}`
    gateway.setRecords(name, config.records ?? OFFCHAIN_RECORDS)
    gateway.setRecords(
      subname,
      config.subnameRecords ?? OFFCHAIN_SUBNAME_RECORDS,
    )
    await waitForBignameName(name)
    console.log(
      `[makeOffchainName] ${name} → ${resolver} (gateway ${gateway.url})`,
    )
    return { name, subname, resolver }
  }
}
