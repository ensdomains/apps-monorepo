import {
  injectHeadlessWeb3Provider,
  Web3RequestKind,
} from '@ensdomains/headless-web3-provider'
import { expect, test } from '@playwright/test'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { preserveWalletRpcErrors } from '../../../helpers/headless-wallet-errors.js'

test('wallet rejection retains its real EIP-1193 code in the browser', async ({
  page,
}) => {
  const key = `0x${'0'.repeat(63)}1` as const
  const from = privateKeyToAccount(key).address
  const wallet = await injectHeadlessWeb3Provider({
    page,
    privateKeys: [key],
    chains: [sepolia],
    permitted: [],
  })
  preserveWalletRpcErrors(wallet)
  await page.goto('about:blank')
  const response = page.evaluate(async (address) => {
    try {
      const provider = (
        window as unknown as {
          ethereum: { request(args: unknown): Promise<unknown> }
        }
      ).ethereum
      await provider.request({
        method: 'eth_sendTransaction',
        params: [{ from: address, to: address, value: '0x0' }],
      })
      return { code: 0, message: 'Unexpected submission' }
    } catch (error) {
      const rejection = error as { code?: number; message?: string }
      return { code: rejection.code, message: rejection.message }
    }
  }, from)
  await expect
    .poll(() => wallet.getPendingRequestCount(Web3RequestKind.SendTransaction))
    .toBe(1)
  // Nothing is authorized or sent to a chain.
  await wallet.reject(Web3RequestKind.SendTransaction)
  expect(await response).toEqual({
    code: 4001,
    message: 'The user rejected the request.',
  })
  expect(wallet.getPendingRequestCount()).toBe(0)
})
