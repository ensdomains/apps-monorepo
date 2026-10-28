import { verifyStandaloneHca } from '@ens-apps/smart-account'
import { sendTransaction, waitForTransactionReceipt } from '@wagmi/core'
import {
  type Address,
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeAbiParameters,
  erc20Abi,
  getAddress,
  type Hex,
  parseAbi,
} from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config as WagmiConfig } from 'wagmi'
import { TOKENS } from '@/lib/tokens'
import {
  LeftoverFundsWithdrawalError,
  WITHDRAW_LEFTOVER_FUNDS_GAS_LIMIT,
  withdrawLeftoverFunds,
} from './leftoverFunds'

const DEPLOYMENT = vi.hoisted(() => ({
  to: '0x0000000000000000000000000000000000000009' as const,
  value: 0n,
  data: '0xdeadbeef' as const,
}))

vi.mock('@wagmi/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wagmi/core')>()),
  sendTransaction: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
}))
vi.mock('@/lib/wallet/ensureWalletChain', () => ({
  ensureWalletChain: vi.fn(),
}))
vi.mock('@ens-apps/smart-account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ens-apps/smart-account')>()),
  buildHcaDeploymentCall: () => DEPLOYMENT,
  verifyStandaloneHca: vi.fn(),
}))

const owner: Address = '0x03Ba34f6Ea1496fa316873CF8350A3f7eaD317EF'
const hca: Address = '0x0000000000000000000000000000000000000003'
const hash: Hex = `0x${'a'.repeat(64)}`

const executeByOwnerAbi = parseAbi([
  'function executeByOwner((address target, uint256 value, bytes callData)[] executions) payable',
])

const sendMock = vi.mocked(sendTransaction)
const receiptMock = vi.mocked(waitForTransactionReceipt)

type FakeAccount = {
  readonly code?: Hex
  readonly balances: Partial<Record<Address, bigint>>
}

/** A real client over a node that only answers the account's code and balances. */
const fakePublicClient = (account: FakeAccount) =>
  createPublicClient({
    transport: custom({
      request: async ({ method, params }) => {
        if (method === 'eth_getCode') return account.code ?? '0x6001'
        if (method === 'eth_call') {
          const [{ to }] = params as [{ to: Address }]
          return encodeAbiParameters(
            [{ type: 'uint256' }],
            [account.balances[getAddress(to)] ?? 0n],
          )
        }
        throw new Error(`Unexpected RPC ${method}`)
      },
    }),
  })

const refreshAccount = vi.fn()
const findPendingRegistration = vi.fn()

const run = (account: FakeAccount) =>
  withdrawLeftoverFunds({
    hca,
    owner,
    refreshAccount,
    findPendingRegistration,
    // `buildHcaDeploymentCall` is mocked, so the client is never read.
    hcaClient: {
      getAddress: () => hca,
      getInitData: () => ({ factory: DEPLOYMENT.to, factoryData: '0x' }),
    },
    publicClient: fakePublicClient(account),
    wagmiConfig: {} as WagmiConfig,
  })

/** The transfers carried by the `executeByOwner` call sent to the HCA. */
const sentTransfers = () => {
  const call = sendMock.mock.calls.find(([, tx]) => tx.to === hca)?.[1]
  if (!call?.data) return undefined
  const { args } = decodeFunctionData({
    abi: executeByOwnerAbi,
    data: call.data,
  })
  return args[0].map(({ target, value, callData }) => ({
    target,
    value,
    call: decodeFunctionData({ abi: erc20Abi, data: callData }),
  }))
}

beforeEach(() => {
  vi.resetAllMocks()
  findPendingRegistration.mockResolvedValue(null)
  sendMock.mockResolvedValue(hash)
  receiptMock.mockResolvedValue({ status: 'success' } as Awaited<
    ReturnType<typeof waitForTransactionReceipt>
  >)
})

describe('withdrawLeftoverFunds', () => {
  it('sends the USDC balance to the owner in one owner transaction', async () => {
    const result = await run({
      balances: { [TOKENS.USDC.address]: 2_713_400n },
    })

    expect(sendMock).toHaveBeenCalledOnce()
    expect(refreshAccount).not.toHaveBeenCalled()
    expect(sendMock.mock.calls[0]?.[1]).toMatchObject({
      account: owner,
      to: hca,
      value: 0n,
      gas: WITHDRAW_LEFTOVER_FUNDS_GAS_LIMIT,
    })
    expect(sentTransfers()).toEqual([
      {
        target: TOKENS.USDC.address,
        value: 0n,
        call: { functionName: 'transfer', args: [owner, 2_713_400n] },
      },
    ])
    expect(result).toEqual({
      withdrawn: [
        {
          token: TOKENS.USDC.address,
          symbol: 'USDC',
          decimals: 6,
          amount: 2_713_400n,
        },
      ],
    })
  })

  it('deploys an undeployed account before withdrawing from it', async () => {
    await run({
      code: '0x',
      balances: { [TOKENS.USDC.address]: 5n },
    })

    expect(sendMock.mock.calls.map(([, tx]) => tx.to)).toEqual([
      DEPLOYMENT.to,
      hca,
    ])
    expect(sentTransfers()?.map(({ call }) => call.args)).toEqual([[owner, 5n]])
    expect(refreshAccount).toHaveBeenCalledOnce()
    expect(refreshAccount.mock.invocationCallOrder[0]).toBeLessThan(
      sendMock.mock.invocationCallOrder[1] ?? 0,
    )
  })

  it('refreshes the account once it is deployed, even if the withdrawal is then declined', async () => {
    sendMock
      .mockResolvedValueOnce(hash)
      .mockRejectedValueOnce(new Error('User rejected the request'))

    await expect(
      run({ code: '0x', balances: { [TOKENS.USDC.address]: 5n } }),
    ).rejects.toThrow('User rejected')
    expect(refreshAccount).toHaveBeenCalledOnce()
  })

  it('sends nothing, not even the deployment, while a registration needs the funds', async () => {
    findPendingRegistration.mockResolvedValue('leon.eth')

    await expect(
      run({ code: '0x', balances: { [TOKENS.USDC.address]: 5n } }),
    ).rejects.toMatchObject({
      _tag: 'FundsHeldForRegistrationError',
      registrationName: 'leon.eth',
    })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('sends nothing when the account holds nothing', async () => {
    await expect(run({ balances: {} })).resolves.toEqual({
      withdrawn: [],
    })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('refuses before the wallet opens when the wallet does not own the account', async () => {
    vi.mocked(verifyStandaloneHca).mockRejectedValue(new Error('not owner'))

    await expect(
      run({ balances: { [TOKENS.USDC.address]: 1n } }),
    ).rejects.toThrow('not owner')
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('fails when the withdrawal reverts', async () => {
    receiptMock.mockResolvedValue({ status: 'reverted' } as Awaited<
      ReturnType<typeof waitForTransactionReceipt>
    >)

    await expect(
      run({ balances: { [TOKENS.USDC.address]: 1n } }),
    ).rejects.toBeInstanceOf(LeftoverFundsWithdrawalError)
  })
})
