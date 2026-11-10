/**
 * Clears a name's **own** resolver slot, on demand.
 *
 *   NAME=sub.foo-123.eth pnpm --filter @ens-apps/e2e clear-own-resolver
 *
 * Exists for one job: manufacturing the race behind **E2E-010** by hand. The
 * transfer form reads the name's own resolver when it renders and decides the
 * plan from it; `useTransferName` then re-reads it at execution time to catch
 * the state having changed in between. Run this while the form is open and
 * before pressing Start, and you are standing in that gap.
 *
 * Writes to the registry that holds the name's **leaf label** — `registries[1]`
 * from `getNameRegistries`, which for a subname is the parent's subregistry and
 * for a 2LD is the `.eth` registry. That is the same slot the portal's
 * `getOwnResolver` reads and the same one `detachNameResolver` writes, so
 * "cleared" here means exactly what the app means by it.
 *
 * Signs as the `user` account (Anvil #0) unless SIGNER names another slot. The
 * caller needs `ROLE_SET_RESOLVER` on the label, which the account that
 * registered it holds by default.
 */

import { getNameRegistries } from '@ensdomains/ensjs/public/v2'
import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import {
  type Address,
  createWalletClient,
  encodeFunctionData,
  http,
  parseAbi,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { normalize } from 'viem/ens'
import { createAccounts } from '../fixtures/playwright.portal.fixture.js'
import { publicClient } from '../helpers/anvil-client.js'

const ANVIL_RPC_URL = process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'

const REGISTRY_ABI = parseAbi([
  'function getResolver(string label) view returns (address)',
  'function setResolver(uint256 tokenId, address resolver)',
])

async function main() {
  const name = process.env.NAME
  if (!name) {
    console.error('NAME is required, e.g. NAME=sub.foo-123.eth')
    process.exit(1)
  }

  const normalized = normalize(name)
  const [label] = normalized.split('.')
  if (!label) {
    console.error(`could not read a leaf label from ${name}`)
    process.exit(1)
  }

  const registries = await getNameRegistries(
    publicClient as never,
    {
      name: normalized,
    } as never,
  )
  const registryAddress = (registries as (Address | null)[])[1]
  if (!registryAddress || registryAddress === zeroAddress) {
    console.error(`no V2 registry holds ${name}`)
    process.exit(1)
  }

  const before = await publicClient.readContract({
    address: registryAddress,
    abi: REGISTRY_ABI,
    functionName: 'getResolver',
    args: [label],
  })
  if (before === zeroAddress) {
    console.log(`${name} already has no resolver of its own — nothing to do.`)
    console.log(`  registry: ${registryAddress}`)
    return
  }

  const accounts = createAccounts()
  const signer = privateKeyToAccount(
    accounts.getPrivateKey((process.env.SIGNER ?? 'user') as never),
  )
  const wallet = createWalletClient({
    account: signer,
    chain: publicClient.chain,
    transport: http(ANVIL_RPC_URL),
  })

  const hash = await wallet.sendTransaction({
    to: registryAddress,
    data: encodeFunctionData({
      abi: REGISTRY_ABI,
      functionName: 'setResolver',
      args: [labelToCanonicalId(label), zeroAddress],
    }),
  })
  await publicClient.waitForTransactionReceipt({ hash })

  const after = await publicClient.readContract({
    address: registryAddress,
    abi: REGISTRY_ABI,
    functionName: 'getResolver',
    args: [label],
  })

  console.log(`cleared the own resolver for ${name}`)
  console.log(`  registry: ${registryAddress}`)
  console.log(`  before:   ${before}`)
  console.log(`  after:    ${after}`)
  console.log(
    '\nThe browser still holds the old value: the app caches it for an hour' +
      '\n(utils/queryClient.ts staleTime), which is E2E-010. Do NOT reload —' +
      '\na reload would re-read the chain and rebuild the plan correctly.',
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
