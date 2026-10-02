import type { V1Domain } from '@ens-apps/migration'
import { decodeFunctionData, erc20Abi, type PublicClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { estimateGraceRenewalGas } from './estimateGraceRenewalGas'
import {
  encodeGraceRenewal,
  GRACE_RENEWAL_ABI,
  type GraceRenewalQuote,
} from './graceRenewal'

const ownerAddress = '0x1111111111111111111111111111111111111111'
const paymentToken = '0x2222222222222222222222222222222222222222'
const renewerAddress = '0x3333333333333333333333333333333333333333'

const makeQuote = (
  durations: readonly bigint[] = [604_800n],
): GraceRenewalQuote => ({
  ownerAddress,
  paymentToken,
  renewerAddress,
  chainId: 11_155_111,
  items: durations.map((duration, index) => ({
    domain: {} as V1Domain,
    label: `name${index}`,
    registrationExpiry: 2_000_000_000n,
    duration,
    targetExpiry: 2_000_000_000n + duration,
    amount: duration > 0n ? 100n : 0n,
  })),
  totalAmount:
    BigInt(durations.filter((duration) => duration > 0n).length) * 100n,
  balance: 1_000n,
  expiresAt: 2_000_000_300n,
  quotedAtMs: 2_000_000_000_000,
})

const setup = (allowance = 0n) => {
  const readContract = vi.fn().mockResolvedValue(allowance)
  const estimateGas = vi.fn().mockResolvedValue(100_000n)
  const simulateCalls = vi.fn().mockResolvedValue({
    results: [
      { status: 'success', gasUsed: 45_000n },
      { status: 'success', gasUsed: 100_000n },
    ],
  })
  const publicClient = {
    chain: { id: 11_155_111 },
    readContract,
    estimateGas,
    simulateCalls,
  } as unknown as PublicClient
  return { publicClient, readContract, estimateGas, simulateCalls }
}

describe('estimateGraceRenewalGas', () => {
  it('simulates approval then renewal and counts both network fees', async () => {
    const { publicClient, readContract, estimateGas, simulateCalls } = setup()
    const quote = makeQuote([604_800n, 0n, 604_800n])

    const result = await estimateGraceRenewalGas({ quote, publicClient })

    expect(result).toEqual({
      gasUnits: 174_000n,
      transactionCount: 2,
      approvalRequired: true,
    })
    expect(readContract).toHaveBeenCalledWith({
      address: paymentToken,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [ownerAddress, renewerAddress],
    })
    expect(estimateGas).not.toHaveBeenCalled()
    const simulation = simulateCalls.mock.calls[0]?.[0]
    expect(simulation.account).toBe(ownerAddress)
    expect(simulation.validation).toBe(false)
    expect(simulation.calls.map((call: { to: string }) => call.to)).toEqual([
      paymentToken,
      renewerAddress,
    ])
    expect(
      decodeFunctionData({ abi: erc20Abi, data: simulation.calls[0].data }),
    ).toEqual({ functionName: 'approve', args: [renewerAddress, 200n] })
    const renewal = decodeFunctionData({
      abi: GRACE_RENEWAL_ABI,
      data: simulation.calls[1].data,
    })
    expect(renewal.functionName).toBe('renewBatch')
    if (renewal.functionName !== 'renewBatch')
      throw new Error('Expected renewal')
    expect(renewal.args[0].map(({ label }) => label)).toEqual([
      'name0',
      'name2',
    ])
  })

  it('uses ordinary renewal gas estimation when allowance is already sufficient', async () => {
    const { publicClient, estimateGas, simulateCalls } = setup(100n)
    const quote = makeQuote()

    const result = await estimateGraceRenewalGas({ quote, publicClient })

    expect(result).toEqual({
      gasUnits: 120_000n,
      transactionCount: 1,
      approvalRequired: false,
    })
    expect(estimateGas).toHaveBeenCalledWith({
      account: ownerAddress,
      to: renewerAddress,
      data: encodeGraceRenewal(quote),
    })
    expect(simulateCalls).not.toHaveBeenCalled()
  })

  it('does not charge gas for names that have already reached their renewal target', async () => {
    const { publicClient, readContract, estimateGas, simulateCalls } = setup()

    const result = await estimateGraceRenewalGas({
      quote: makeQuote([0n, 0n]),
      publicClient,
    })

    expect(result).toEqual({
      gasUnits: 0n,
      transactionCount: 0,
      approvalRequired: false,
    })
    expect(readContract).not.toHaveBeenCalled()
    expect(estimateGas).not.toHaveBeenCalled()
    expect(simulateCalls).not.toHaveBeenCalled()
  })

  it.each([
    0, 1,
  ])('rejects a failed simulation at call %s', async (failedIndex) => {
    const { publicClient, simulateCalls } = setup()
    const error = new Error('execution reverted')
    simulateCalls.mockResolvedValue({
      results: [0, 1].map((index) =>
        index === failedIndex
          ? { status: 'failure', error, gasUsed: 30_000n }
          : { status: 'success', gasUsed: 100_000n },
      ),
    })

    await expect(
      estimateGraceRenewalGas({ quote: makeQuote(), publicClient }),
    ).rejects.toBe(error)
  })

  it('rejects an incomplete simulation instead of showing a partial total', async () => {
    const { publicClient, simulateCalls } = setup()
    simulateCalls.mockResolvedValue({
      results: [{ status: 'success', gasUsed: 45_000n }],
    })

    await expect(
      estimateGraceRenewalGas({ quote: makeQuote(), publicClient }),
    ).rejects.toThrow('Could not estimate renewal network fees.')
  })

  it('propagates unavailable RPC simulation instead of inventing an estimate', async () => {
    const { publicClient, simulateCalls } = setup()
    const error = new Error('eth_simulateV1 unavailable')
    simulateCalls.mockRejectedValue(error)

    await expect(
      estimateGraceRenewalGas({ quote: makeQuote(), publicClient }),
    ).rejects.toBe(error)
  })

  it('does not estimate against a different chain', async () => {
    const { publicClient, readContract } = setup()

    await expect(
      estimateGraceRenewalGas({
        quote: { ...makeQuote(), chainId: 1 },
        publicClient,
      }),
    ).rejects.toThrow('Switch to the migration network and try again.')
    expect(readContract).not.toHaveBeenCalled()
  })

  it('stops before simulation if the caller aborts while allowance is loading', async () => {
    const { publicClient, readContract, simulateCalls } = setup()
    const controller = new AbortController()
    readContract.mockImplementation(async () => {
      controller.abort()
      return 0n
    })

    await expect(
      estimateGraceRenewalGas({
        quote: makeQuote(),
        publicClient,
        signal: controller.signal,
      }),
    ).rejects.toThrow()
    expect(simulateCalls).not.toHaveBeenCalled()
  })
})
