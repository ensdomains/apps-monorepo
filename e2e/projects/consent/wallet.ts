import {
  injectHeadlessWeb3Provider,
  type Web3ProviderBackend,
} from '@ensdomains/headless-web3-provider'
import type { Page } from '@playwright/test'
import { bytesToHex, type Hash } from 'viem'
import { mnemonicToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'

const TEST_MNEMONIC =
  'test test test test test test test test test test test junk'

/** Deterministic e2e address; account 0 is 0xf39F…2266. */
export const testPrivateKey = (index = 0): Hash => {
  const { getHdKey } = mnemonicToAccount(TEST_MNEMONIC, {
    addressIndex: index,
  })
  return bytesToHex(getHdKey().privateKey as Uint8Array) as Hash
}

export const testAddress = (index = 0): `0x${string}` =>
  mnemonicToAccount(TEST_MNEMONIC, { addressIndex: index }).address

/**
 * Inject the headless wallet before navigation. Connecting (permissions +
 * accounts) is local; no chain node is needed for the consent walks.
 */
export const injectTestWallet = async (
  page: Page,
): Promise<{ wallet: Web3ProviderBackend; address: `0x${string}` }> => {
  const wallet = await injectHeadlessWeb3Provider({
    page,
    privateKeys: [testPrivateKey()],
    chains: [sepolia],
  })
  return { wallet, address: testAddress() }
}
