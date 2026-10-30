import { transactionManager } from '@ens-apps/transaction-manager'
import {
  proxyDeployedEventSnippet,
  verifiableFactoryDeployProxySnippet,
} from '@ensdomains/ensjs-abi/v2/verifiableFactory'
import {
  type Address,
  createWalletClient,
  custom,
  decodeFunctionData,
  encodeAbiParameters,
  type Hash,
  type Log,
  type PublicClient,
  pad,
  toEventSelector,
  toHex,
  type WalletClient,
} from 'viem'
import { sepolia } from 'viem/chains'
import { afterEach, describe, expect, it } from 'vitest'
import {
  deploySubregistry,
  generateSubregistrySalt,
  prepareDeploySubregistryTransaction,
} from './deploySubregistry'

const factoryAddress = '0x1111111111111111111111111111111111111111' as Address
const implAddress = '0x3333333333333333333333333333333333333333' as Address
const from = '0x2222222222222222222222222222222222222222' as Address
const walletClient = {
  account: { address: from },
  chain: { id: 11155111 },
} as unknown as WalletClient

const deployArgs = (salt: bigint) => {
  const { request } = prepareDeploySubregistryTransaction({
    factoryAddress,
    implAddress,
    salt,
    walletClient,
    chainId: 11155111,
  })
  if (request.type !== 'eoa' || !request.data)
    throw new Error('expected an EOA request with calldata')
  return decodeFunctionData({
    abi: verifiableFactoryDeployProxySnippet,
    data: request.data,
  }).args
}

describe('prepareDeploySubregistryTransaction', () => {
  it('deploys the registry implementation under the salt it is given', () => {
    // Not ensjs's default: that one is fixed per page load, and the factory
    // binds the proxy address to (sender, salt), so a wallet's second deploy
    // would revert.
    const salt = generateSubregistrySalt()
    const [impl, encodedSalt] = deployArgs(salt)

    expect(impl).toBe(implAddress)
    expect(encodedSalt).toBe(salt)
  })
})

describe('generateSubregistrySalt', () => {
  it('draws a fresh 256-bit salt every call', () => {
    const salts = Array.from({ length: 32 }, generateSubregistrySalt)

    expect(new Set(salts).size).toBe(salts.length)
    for (const salt of salts) {
      expect(salt).toBeGreaterThanOrEqual(0n)
      expect(salt).toBeLessThan(2n ** 256n)
    }
  })
})

describe('deploySubregistry', () => {
  const proxy = '0x4444444444444444444444444444444444444444' as Address
  const txHash = `0x${'ef'.repeat(32)}` as Hash

  type ReceiptLog = Pick<Log, 'address' | 'topics' | 'data'>

  const proxyLog: ReceiptLog = {
    address: proxy,
    topics: [toEventSelector('Initialized(uint64)')],
    data: '0x',
  }
  const proxyDeployedLog: ReceiptLog = {
    address: factoryAddress,
    topics: [
      toEventSelector(proxyDeployedEventSnippet[0]),
      pad(from),
      pad(proxy),
    ],
    data: encodeAbiParameters(
      [{ type: 'uint256' }, { type: 'address' }],
      [1n, implAddress],
    ),
  }
  const safeLog = (event: string): ReceiptLog => ({
    address: from,
    topics: [toEventSelector(event)],
    data: '0x',
  })

  afterEach(() => {
    transactionManager.clear()
  })

  it.each<[string, readonly ReceiptLog[]]>([
    ["an EOA's", [proxyLog, proxyDeployedLog]],
    [
      // A Safe logs its own execution around the call it carries.
      "a Safe's",
      [
        safeLog(
          'SafeMultiSigTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes,bytes)',
        ),
        proxyLog,
        proxyDeployedLog,
        safeLog('ExecutionSuccess(bytes32,uint256)'),
      ],
    ],
  ])(
    'reads the new registry from the factory in %s receipt',
    async (_, logs) => {
      const sender = createWalletClient({
        account: from,
        chain: sepolia,
        transport: custom({
          request: async ({ method }) => {
            if (method === 'eth_chainId') return toHex(sepolia.id)
            if (method === 'eth_sendTransaction') return txHash
            throw new Error(`unexpected RPC call: ${method}`)
          },
        }),
      })
      // Only the receipt wait runs for a wallet that isn't a Safe{Wallet}.
      const publicClient = {
        waitForTransactionReceipt: async () => ({
          status: 'success',
          transactionHash: txHash,
          blockNumber: 1n,
          contractAddress: null,
          logs,
        }),
      } as unknown as PublicClient

      const { deployedAddress } = await deploySubregistry({
        factoryAddress,
        implAddress,
        salt: 1n,
        walletClient: sender,
        publicClient,
        signer: { type: 'eoa', walletClient: sender },
        chainId: sepolia.id,
        id: 'tx-deploy-subregistry',
      })

      expect(deployedAddress).toBe(proxy)
    },
  )
})
