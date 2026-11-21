/**
 * Makes a `VerifiableFactory` deploy look like it was carried by another
 * contract that announced a proxy of its own first (WEB-2200).
 *
 * A Safe execution (or any call) can be relayed by an arbitrary wrapper, and
 * that wrapper can emit a `ProxyDeployed` with the same signature before the
 * factory's. The app sends its deploys straight from the wallet, so the fork
 * never produces such a receipt by itself. This route copies the factory's
 * real `ProxyDeployed` log in every receipt the page reads, re-emits the copy
 * from `wrapper` with `decoy` as the proxy, and puts it first. The transaction,
 * the factory's own log and the chain are untouched.
 */

import { ensL1Contracts } from '@ensdomains/ensjs/chain'
import { proxyDeployedEventSnippet } from '@ensdomains/ensjs-abi/v2/verifiableFactory'
import type { Page } from '@playwright/test'
import {
  type Address,
  type Hash,
  isAddressEqual,
  pad,
  parseEventLogs,
  toEventSelector,
} from 'viem'
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { publicClient } from './anvil-client.js'

export const VERIFIABLE_FACTORY =
  ensL1Contracts[sepolia.id].ensVerifiableFactory.address

const PROXY_DEPLOYED_TOPIC = toEventSelector(
  'ProxyDeployed(address,address,uint256,address)',
)

type RpcRequest = { readonly id: number; readonly method: string }
type ReceiptLog = {
  readonly address: Address
  readonly topics: readonly Hash[]
  readonly data: Hash
}
type RpcEntry = {
  readonly id: number
  readonly result?: {
    readonly transactionHash: Hash
    readonly logs: readonly ReceiptLog[]
  } | null
}

const isFactoryProxyDeployed = (log: ReceiptLog) =>
  log.address.toLowerCase() === VERIFIABLE_FACTORY.toLowerCase() &&
  log.topics[0] === PROXY_DEPLOYED_TOPIC

/**
 * Routes the page's `/rpc` so every receipt holding the factory's
 * `ProxyDeployed` gets a decoy one from another contract in front of it.
 *
 * Returns the decoy proxy, the contract posing as the wrapper, and the hashes
 * of every receipt that was wrapped: the evidence that the app really read a
 * wrapped receipt, so a test cannot pass on a page that never got one.
 */
export async function wrapFactoryReceipts(page: Page) {
  // Fresh per test, with no code: a run that adopted it is unambiguous, and
  // nothing else on the fork can be holding it.
  const decoy = privateKeyToAddress(generatePrivateKey())
  const wrapper = privateKeyToAddress(generatePrivateKey())
  const wrapped = new Set<Hash>()

  const wrap = (entry: RpcEntry): RpcEntry => {
    const receipt = entry.result
    const factoryLog = receipt?.logs.find(isFactoryProxyDeployed)
    if (!receipt || !factoryLog) return entry
    wrapped.add(receipt.transactionHash)
    const [topic, sender] = factoryLog.topics
    const decoyLog: ReceiptLog = {
      ...factoryLog,
      address: wrapper,
      topics: [topic, sender, pad(decoy)],
    }
    return {
      ...entry,
      result: { ...receipt, logs: [decoyLog, ...receipt.logs] },
    }
  }

  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON() as RpcRequest | RpcRequest[]
    const receiptIds = new Set(
      (Array.isArray(body) ? body : [body])
        .filter((request) => request.method === 'eth_getTransactionReceipt')
        .map((request) => request.id),
    )
    if (receiptIds.size === 0) return route.continue()
    const response = await route.fetch()
    const json = (await response.json()) as RpcEntry | RpcEntry[]
    const entries = (Array.isArray(json) ? json : [json]).map((entry) =>
      receiptIds.has(entry.id) ? wrap(entry) : entry,
    )
    return route.fulfill({
      response,
      json: Array.isArray(json) ? entries : entries[0],
    })
  })

  return { decoy, wrapper, wrapped }
}

/**
 * The one proxy the factory deployed among `hashes`, read from the receipts on
 * the fork (not through the page, so no decoy), with the deploy's hash.
 */
export async function factoryDeployment(hashes: Iterable<Hash>) {
  const deployments: { hash: Hash; proxy: Address }[] = []
  for (const hash of hashes) {
    const receipt = await publicClient.getTransactionReceipt({ hash })
    for (const event of parseEventLogs({
      abi: proxyDeployedEventSnippet,
      eventName: 'ProxyDeployed',
      logs: receipt.logs,
    })) {
      if (isAddressEqual(event.address, VERIFIABLE_FACTORY)) {
        deployments.push({ hash, proxy: event.args.proxyAddress })
      }
    }
  }
  if (deployments.length !== 1) {
    throw new Error(
      `Expected one factory deployment among the wrapped receipts, found ${deployments.length}`,
    )
  }
  return deployments[0]
}
