/**
 * Seeds an ENSv2 name and subnames on a CCIP-Read resolver for MANUAL QA, and
 * serves their gateway until interrupted.
 *
 *   pnpm --filter @ens-apps/e2e seed:offchain-v2
 *
 * - `<label>.eth`: a V2 registration owned by `user`, with its resolver set to
 *   a fresh `TestOffchainResolver` in the .eth registry.
 * - `bob.<name>`: registered in the name's UserRegistry, with the same
 *   resolver set on its own registry entry.
 * - `alice.<name>`: no registry entry at all; resolves through the parent's
 *   resolver (resolver inheritance).
 *
 *   PORT=8789   gateway port (the resolver's URL is fixed to it)
 *   NAME=<name> serve a name seeded earlier instead of registering one
 */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { setResolver } from '@ensdomains/ensjs/wallet/v2'
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createMakeSubname } from '../fixtures/makeSubname.js'
import { createMakeV2Name } from '../fixtures/makeV2Name.js'
import {
  deployOffchainResolver,
  OFFCHAIN_RECORDS,
  OFFCHAIN_SUBNAME_RECORDS,
} from '../fixtures/offchainName.js'
import { createAccounts } from '../fixtures/playwright.manager.fixture.js'
import { publicClient, testClient } from '../helpers/anvil-client.js'
import { startCcipGateway } from '../helpers/ccip-gateway.js'

const ETH_REGISTRY =
  ensL1Contracts[supportedL1Chains.sepolia].ensRegistry.address
const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'

const BOB_RECORDS = {
  texts: { description: 'V2 subname with its own registry entry' },
  coins: { 60: '0x90F79bf6EB2c4f870365E785982E1f101E93b906' },
} as const

async function main() {
  const gateway = await startCcipGateway(Number(process.env.PORT ?? 8789))
  const owner = privateKeyToAccount(createAccounts().getPrivateKey('user'))
  const wallet = createWalletClient({
    account: owner,
    chain: publicClient.chain,
    transport: http(process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'),
  })

  let name = process.env.NAME
  if (!name) {
    await testClient.setCode({ address: owner.address, bytecode: '0x' })
    name = await createMakeV2Name({ userAccount: owner })({
      label: 'offchain-v2',
    })
    const label = name.replace(/\.eth$/, '')
    const resolver = await deployOffchainResolver(gateway.url, owner)
    await publicClient.waitForTransactionReceipt({
      hash: await setResolver(wallet, {
        registryAddress: ETH_REGISTRY,
        label,
        resolverAddress: resolver,
      }),
    })
    const tree = await createMakeSubname({ account: owner })({
      parent: name,
      levels: [{ label: 'bob' }],
    })
    const bob = tree.levels[0]
    await publicClient.waitForTransactionReceipt({
      hash: await setResolver(wallet, {
        registryAddress: bob.registryAddress,
        label: 'bob',
        resolverAddress: resolver,
      }),
    })
    console.log(`resolver ${resolver}, bob's registry ${bob.registryAddress}`)
  }

  gateway.setRecords(name, OFFCHAIN_RECORDS)
  gateway.setRecords(`bob.${name}`, BOB_RECORDS)
  gateway.setRecords(`alice.${name}`, OFFCHAIN_SUBNAME_RECORDS)

  console.log(`
Gateway: ${gateway.url}
  ${name}
    manager  ${MANAGER_APP_URL}/${name}
    explorer ${PORTAL_APP_URL}/${name}
  bob.${name} (registered subname)
    manager  ${MANAGER_APP_URL}/bob.${name}
    explorer ${PORTAL_APP_URL}/bob.${name}
  alice.${name} (no registry entry)
    manager  ${MANAGER_APP_URL}/alice.${name}
    explorer ${PORTAL_APP_URL}/alice.${name}
Serving until Ctrl-C.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
