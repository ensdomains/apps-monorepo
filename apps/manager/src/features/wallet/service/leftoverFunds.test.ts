import { verifyStandaloneHca } from '@ens-apps/smart-account'
import { sendTransaction, waitForTransactionReceipt } from '@wagmi/core'
import {
  type Address,
  decodeFunctionData,
  erc20Abi,
  type Hex,
  type PublicClient,
  parseAbi,
} from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config as WagmiConfig } from 'wagmi'
import { TOKENS } from '@/lib/tokens'
import {
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

const run = (account: {
  readonly code?: Hex
  readonly balances: Partial<Record<Address, bigint>>
}) =>
  withdrawLeftoverFunds({
    hca,
    owner,
    hcaClient: {} as never,
    publicClient: {
      getCode: async () => account.code ?? '0x6001',
      readContract: async ({ address }: { address: Address }) =>
        account.balances[address] ?? 0n,
    } as unknown as PublicClient,
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
  sendMock.mockResolvedValue(hash)
  receiptMock.mockResolvedValue({ status: 'success' } as Awaited<
    ReturnType<typeof waitForTransactionReceipt>
  >)
})

describe('withdrawLeftoverFunds', () => {
  it('sends every non-zero balance to the owner in one owner transaction', async () => {
    const result = await run({
      balances: { [TOKENS.USDC.address]: 2_713_400n, [TOKENS.DAI.address]: 0n },
    })

    expect(sendMock).toHaveBeenCalledOnce()
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
      deployed: false,
    })
  })

  it('deploys an undeployed account before withdrawing from it', async () => {
    const result = await run({
      code: '0x',
      balances: { [TOKENS.USDC.address]: 5n, [TOKENS.DAI.address]: 7n },
    })

    expect(sendMock.mock.calls.map(([, tx]) => tx.to)).toEqual([
      DEPLOYMENT.to,
      hca,
    ])
    expect(sentTransfers()?.map(({ call }) => call.args)).toEqual([
      [owner, 5n],
      [owner, 7n],
    ])
    expect(result.deployed).toBe(true)
  })

  it('sends nothing when the account holds nothing', async () => {
    await expect(run({ balances: {} })).resolves.toEqual({
      withdrawn: [],
      deployed: false,
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
    ).rejects.toThrow('reverted')
  })
})
