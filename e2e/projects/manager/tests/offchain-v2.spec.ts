/**
 * ENSv2 names on a CCIP-Read resolver in the manager.
 *
 * The manager offers the editor only when a dry run of the profile's ETH
 * address write succeeds against the name's resolver
 * (`canWriteEthAddressRecord`). A CCIP-Read resolver has no setters, so its
 * owner sees the records read-only.
 *
 * A wildcard subname has no entry in its parent's subregistry, so the registry
 * reports expiry 0; the profile should show no expiry rather than 1970.
 */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { setResolver } from '@ensdomains/ensjs/wallet/v2'
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createMakeSubname } from '../../../fixtures/makeSubname.js'
import {
  deployOffchainResolver,
  OFFCHAIN_RECORDS,
  OFFCHAIN_SUBNAME_RECORDS,
} from '../../../fixtures/offchainName.js'
import { expect, test } from '../../../fixtures/playwright.manager.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const ETH_REGISTRY =
  ensL1Contracts[supportedL1Chains.sepolia].ensRegistry.address

test.describe('ENSv2 name on an offchain resolver', () => {
  test('its owner loses the profile editor once the name points at a CCIP-Read resolver, and still sees its records', {
    tag: ['@scenario:H20'],
  }, async ({
    profileConnectedPage: page,
    makeV2Name,
    accounts,
    ccipGateway,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const name = await makeV2Name({
      label: 'h20-offchain-edit',
      records: [{ key: 'description', value: 'Onchain before the switch' }],
    })
    const editProfile = page.getByRole('button', { name: 'Edit Profile' })

    // Control: on its own resolver the owner can edit.
    await page.goto(`${MANAGER_APP_URL}/${name}`)
    await expect(page.getByText('Onchain before the switch')).toBeVisible({
      timeout: 60_000,
    })
    await expect(editProfile).toBeVisible({ timeout: 30_000 })

    const resolver = await deployOffchainResolver(ccipGateway.url, owner)
    ccipGateway.setRecords(name, OFFCHAIN_RECORDS)
    const wallet = createWalletClient({
      account: owner,
      chain: publicClient.chain,
      transport: http(process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'),
    })
    await publicClient.waitForTransactionReceipt({
      hash: await setResolver(wallet, {
        registryAddress: ETH_REGISTRY,
        label: name.replace(/\.eth$/, ''),
        resolverAddress: resolver,
      }),
    })

    await page.goto(`${MANAGER_APP_URL}/${name}`)
    await expect(
      page.getByText(OFFCHAIN_RECORDS.texts.description),
    ).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('Onchain before the switch')).toHaveCount(0)
    await expect(editProfile).toHaveCount(0)
  })

  test('a wildcard subname under a parent with a subregistry shows no expiry, not 1970', {
    tag: ['@scenario:H21'],
  }, async ({
    profileConnectedPage: page,
    makeV2Name,
    accounts,
    ccipGateway,
  }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const name = await makeV2Name({ label: 'h21-wildcard-expiry' })
    const resolver = await deployOffchainResolver(ccipGateway.url, owner)
    const wallet = createWalletClient({
      account: owner,
      chain: publicClient.chain,
      transport: http(process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'),
    })
    await publicClient.waitForTransactionReceipt({
      hash: await setResolver(wallet, {
        registryAddress: ETH_REGISTRY,
        label: name.replace(/\.eth$/, ''),
        resolverAddress: resolver,
      }),
    })
    // A registered sibling gives the parent a subregistry, which `alice` is
    // then looked up in and missing from.
    await createMakeSubname({ account: owner })({
      parent: name,
      levels: [{ label: 'bob' }],
    })
    ccipGateway.setRecords(`alice.${name}`, OFFCHAIN_SUBNAME_RECORDS)

    await page.goto(`${MANAGER_APP_URL}/alice.${name}`)
    await expect(
      page.getByText(OFFCHAIN_SUBNAME_RECORDS.texts.description),
    ).toBeVisible({ timeout: 60_000 })
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/1970/)).toHaveCount(0)
    await expect(page.getByText('Expires', { exact: true })).toHaveCount(0)
  })
})
