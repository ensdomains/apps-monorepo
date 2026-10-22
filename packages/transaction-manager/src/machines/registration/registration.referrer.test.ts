import {
  buildRevealBatch,
  getDestinationContracts,
  readCommitment,
} from '@ens-apps/smart-account'
import { normalizeReferrer } from '@ens-apps/utils/referrer'
import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import {
  ethRegistrarRegisterSnippet,
  ethRegistrarRenewSnippet,
} from '@ensdomains/ensjs-abi/v2/ethRegistrar'
import { decodeFunctionData, type PublicClient, zeroHash } from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'
import {
  encodeRegisterCall,
  encodeRenewBatchData,
  encodeRenewData,
  generateCommitmentActor,
} from './registration.actors'

const reads = vi.hoisted(() => ({
  readContract: vi.fn().mockResolvedValue(`0x${'11'.repeat(32)}`),
}))
vi.mock('viem/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/actions')>()),
  readContract: reads.readContract,
}))
const owner = '0x1111111111111111111111111111111111111111'
const resolver = '0x2222222222222222222222222222222222222222'
const supplied = '0x1234567890123456789012345678901234567890'
const expected = `0x${'0'.repeat(24)}1234567890123456789012345678901234567890`
const duration = 31_536_000n
const chain = extendChainWithEns(sepolia)
const contracts = getDestinationContracts(sepolia.id)

describe('referrer validation', () => {
  it.each([
    undefined,
    null,
    123,
    '',
    '0x',
    '1234',
    '0xgg',
    `0x${'1'.repeat(65)}`,
    ['0x12'],
  ])('uses bytes32(0) for %j', (value) => {
    expect(normalizeReferrer(value)).toBe(zeroHash)
  })
  it('pads an address on the left and accepts full bytes32 and short hex values', () => {
    expect(normalizeReferrer(supplied)).toBe(expected)
    expect(normalizeReferrer(`0x${'AB'.repeat(32)}`)).toBe(
      `0x${'ab'.repeat(32)}`,
    )
    expect(normalizeReferrer('0x1')).toBe(`0x${'0'.repeat(63)}1`)
  })
})

describe('registration attribution', () => {
  it('uses the same bytes32 in the EOA commitment and register calldata', async () => {
    const result = await generateCommitmentActor({
      name: 'alice.eth',
      owner,
      duration,
      resolverAddress: resolver,
      selectedToken: 'USDC',
      publicClient: { chain } as PublicClient,
      referrer: supplied,
    })
    expect(result.isOk()).toBe(true)
    if (result.isErr()) throw result.error
    const commitmentArgs = reads.readContract.mock.calls.at(-1)?.[1].args
    const call = encodeRegisterCall({
      name: 'alice.eth',
      owner,
      secret: result.value.secret,
      duration,
      paymentToken: contracts.usdc,
      resolverAddress: resolver,
      registrarAddress: contracts.ethRegistrar,
      referrer: supplied,
    })
    const { args } = decodeFunctionData({
      abi: ethRegistrarRegisterSnippet,
      data: call.data,
    })
    expect(commitmentArgs.at(-1)).toBe(expected)
    expect(args?.[7]).toBe(expected)
    expect(args?.slice(0, 6)).toEqual(commitmentArgs.slice(0, 6))
  })

  it('uses the same bytes32 in the HCA commitment and reveal batch', async () => {
    const readContract = vi.fn().mockResolvedValue(zeroHash)
    const secret = zeroHash
    await readCommitment({
      publicClient: { readContract } as unknown as PublicClient,
      chainId: sepolia.id,
      label: 'alice',
      wallet: owner,
      secret,
      resolver,
      duration,
      referrer: supplied,
    })
    const calls = buildRevealBatch({
      chainId: sepolia.id,
      hca: resolver,
      resolver,
      resolverDeployed: true,
      label: 'alice',
      wallet: owner,
      secret,
      price: 1n,
      duration,
      referrer: supplied,
    })
    const call = calls.find((call) => call.to === contracts.ethRegistrar)
    expect(call).toBeDefined()
    if (!call) return
    const { args } = decodeFunctionData({
      abi: ethRegistrarRegisterSnippet,
      data: call.data,
    })
    const commitmentArgs = readContract.mock.calls[0][0].args
    expect(commitmentArgs.at(-1)).toBe(expected)
    expect(args?.[7]).toBe(expected)
    expect(args?.slice(0, 6)).toEqual(commitmentArgs.slice(0, 6))
  })
})

it('encodes supplied referrers for single and batch renewal', () => {
  const single = decodeFunctionData({
    abi: ethRegistrarRenewSnippet,
    data: encodeRenewData('alice', duration, contracts.usdc, supplied),
  })
  expect(single.args?.[0].referrer).toBe(expected)
  // A separate entry can still renew without attribution.
  const batch = encodeRenewBatchData(
    [
      { label: 'alice', duration, referrer: supplied },
      { label: 'bob', duration },
    ],
    contracts.usdc,
  )
  expect(batch).toContain(expected.slice(2))
})
