import { getDestinationContracts } from '@ens-apps/smart-account'
import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import type { Address, Hash, Hex, PublicClient, WalletClient } from 'viem'
import { decodeFunctionData, erc20Abi, getChainContractAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EOASigner } from '../../types/signer.types'
import {
  authorizedPaymentAmount,
  submitEoaSetupBundleActor,
} from './registration.actors'

const mocks = vi.hoisted(() => ({
  startTransaction: vi.fn(() => 'tx-setup'),
  multicall: vi.fn(),
}))

vi.mock('../../providers/transactionManager', () => ({
  transactionManager: { startTransaction: mocks.startTransaction },
}))

vi.mock('viem/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/actions')>()),
  multicall: mocks.multicall,
}))

const WALLET = '0x1111111111111111111111111111111111111111' as Address
const chain = extendChainWithEns(sepolia)
const registrar = getChainContractAddress({
  chain,
  contract: 'ensEthRegistrar',
})
const factory = getChainContractAddress({
  chain,
  contract: 'ensVerifiableFactory',
})
const signer = {
  type: 'eoa',
  walletClient: { account: { address: WALLET } } as WalletClient,
} satisfies EOASigner
const COMMITMENT = {
  commitment: `0x${'44'.repeat(32)}` as Hash,
  secret: `0x${'55'.repeat(32)}` as Hex,
}

const submit = (shouldDeployResolver: boolean, paymentTokenAddress?: Address) =>
  submitEoaSetupBundleActor({
    paymentTokenAddress,
    name: 'myname',
    commitment: COMMITMENT,
    resolverOwner: WALLET,
    shouldDeployResolver,
    owner: WALLET,
    duration: 31_536_000n,
    selectedToken: 'USDC',
    tokenPrice: 5_000_000n,
    signer,
    publicClient: { chain } as unknown as PublicClient,
    id: 'tx-reg-setup-bundle',
  })

const submittedRequest = () =>
  (
    mocks.startTransaction.mock.calls[0] as unknown as [
      { request: Record<string, unknown> },
    ]
  )[0].request

beforeEach(() => {
  vi.clearAllMocks()
})

describe('submitEoaSetupBundleActor', () => {
  it('bundles the deploy, the commit and an approval of the live price', async () => {
    // allowance 0, live price base 6 + premium 1
    mocks.multicall.mockResolvedValueOnce([0n, [6_000_000n, 1_000_000n]])

    const result = await submit(true)

    expect(result._unsafeUnwrap()).toEqual({
      txId: 'tx-setup',
      approvedPrice: 7_000_000n,
    })
    const request = submittedRequest() as {
      type: string
      calls: { to: Address; data: Hex }[]
    }
    expect(request.type).toBe('eoa-batch')
    expect(request.calls.map(({ to }) => to)).toEqual([
      factory,
      registrar,
      expect.any(String),
    ])
    const approve = request.calls[2]
    expect(approve).toBeDefined()
    expect(
      decodeFunctionData({ abi: erc20Abi, data: approve?.data ?? '0x' }).args,
    ).toEqual([registrar, authorizedPaymentAmount(7_000_000n)])
  })

  it('sends a lone commit as a plain transaction', async () => {
    mocks.multicall.mockResolvedValueOnce([10_000_000n, [6_000_000n, 0n]])

    const result = await submit(false)

    expect(result._unsafeUnwrap().approvedPrice).toBeNull()
    expect(submittedRequest()).toMatchObject({ type: 'eoa', to: registrar })
  })

  it('approves the quoted price when the live price cannot be read', async () => {
    mocks.multicall.mockRejectedValueOnce(new Error('rpc down'))

    const result = await submit(false)

    expect(result._unsafeUnwrap().approvedPrice).toBe(5_000_000n)
    expect(submittedRequest()).toMatchObject({ type: 'eoa-batch' })
  })

  it.each([
    [
      'the token the caller showed (MockUSDC)',
      getChainContractAddress({ chain, contract: 'usdc' }),
      getChainContractAddress({ chain, contract: 'usdc' }),
    ],
    [
      "the manifest's USDC when none is given",
      undefined,
      getDestinationContracts(sepolia.id).usdc,
    ],
  ] as const)('approves %s', async (_, paymentTokenAddress, expected) => {
    mocks.multicall.mockResolvedValueOnce([0n, [6_000_000n, 0n]])

    await submit(false, paymentTokenAddress)

    const request = submittedRequest() as { calls: { to: Address }[] }
    expect(request.calls.at(-1)?.to).toBe(expected)
  })
})
