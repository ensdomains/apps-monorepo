import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { encodeAbiParameters, keccak256, labelhash } from 'viem'
import { mnemonicToAccount } from 'viem/accounts'
import { getDestinationContracts } from '../../packages/smart-account/src/providers/rhinestone/manifest.js'
import { computeVerifiableProxyAddress } from '../../packages/smart-account/src/verifiable-factory.js'
import { testClient } from '../helpers/anvil-client.js'
import { fundTestUsdc } from '../helpers/fund-test-usdc.js'

// Use the app's current manifest, not an HCA address left by an earlier run.
const contracts = getDestinationContracts(11155111)
for (let index = 0; index < 4; index++) {
  const owner = mnemonicToAccount(
    'test test test test test test test test test test test junk',
    { addressIndex: index },
  ).address
  const salt = BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: 'uint256' }, { type: 'address' }, { type: 'address' }],
        [0n, owner, contracts.standaloneHcaImplementation],
      ),
    ),
  )
  const hca = computeVerifiableProxyAddress({
    factory: contracts.verifiableFactory,
    proxyLogic: contracts.verifiableFactoryProxyLogic,
    deployer: contracts.standaloneHcaFactory,
    salt,
  })
  await testClient.setCode({ address: owner, bytecode: '0x' })
  for (const holder of [owner, hca]) {
    await testClient.setBalance({
      address: holder,
      value: 10_000n * 10n ** 18n,
    })
    await fundTestUsdc(holder)
  }
}
console.log(
  'Funded all four fixture wallets and their current counterfactual HCAs',
)

if (process.env.REPLACEMENT_RESULTS)
  writeFileSync(
    resolve(process.env.REPLACEMENT_RESULTS, 'chain-config.json'),
    JSON.stringify({
      rootRegistry: contracts.rootRegistry,
      rootEntryKey: `0x${(BigInt(labelhash('eth')) & ~0xffffffffn).toString(16).padStart(64, '0')}`,
    }),
  )
