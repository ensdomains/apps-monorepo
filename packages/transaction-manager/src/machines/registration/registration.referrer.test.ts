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
import { decodeFunctionData, type PublicClient, parseAbi, zeroHash } from 'viem'
import { sepolia } from 'viem/chains'
import { assert, describe, expect, it, vi } from 'vitest'
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
const OWNER = '0x1111111111111111111111111111111111111111'
const RESOLVER = '0x2222222222222222222222222222222222222222'
const SUPPLIED_REFERRER = '0x1234567890123456789012345678901234567890'
const EXPECTED_REFERRER = `0x${'0'.repeat(24)}1234567890123456789012345678901234567890`
const FALLBACK_REFERRER = `0x${'ef'.repeat(32)}` as const
const DURATION = 31_536_000n
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
    expect(normalizeReferrer(SUPPLIED_REFERRER)).toBe(EXPECTED_REFERRER)
    expect(normalizeReferrer(`0x${'AB'.repeat(32)}`)).toBe(
      `0x${'ab'.repeat(32)}`,
    )
    expect(normalizeReferrer('0x1')).toBe(`0x${'0'.repeat(63)}1`)
  })
  it.each([undefined, '0xgg', '0x0', zeroHash])(
    'uses the caller fallback for %j',
    (value) => {
      expect(normalizeReferrer(value, FALLBACK_REFERRER)).toBe(
        FALLBACK_REFERRER,
      )
    },
  )
  it('prefers a supplied referrer over the caller fallback', () => {
    expect(normalizeReferrer(SUPPLIED_REFERRER, FALLBACK_REFERRER)).toBe(
      EXPECTED_REFERRER,
    )
  })
})

describe('registration attribution', () => {
  it('uses the same bytes32 in the EOA commitment and register calldata', async () => {
    const result = await generateCommitmentActor({
      name: 'alice.eth',
      owner: OWNER,
      duration: DURATION,
      resolverAddress: RESOLVER,
      selectedToken: 'USDC',
      publicClient: { chain } as PublicClient,
      referrer: SUPPLIED_REFERRER,
    })
    assert(result.isOk())
    const commitmentArgs = reads.readContract.mock.calls.at(-1)?.[1].args
    const call = encodeRegisterCall({
      name: 'alice.eth',
      owner: OWNER,
      secret: result.value.secret,
      duration: DURATION,
      paymentToken: contracts.usdc,
      resolverAddress: RESOLVER,
      registrarAddress: contracts.ethRegistrar,
      referrer: SUPPLIED_REFERRER,
    })
    const { args } = decodeFunctionData({
      abi: ethRegistrarRegisterSnippet,
      data: call.data,
    })
    expect(commitmentArgs.at(-1)).toBe(EXPECTED_REFERRER)
    expect(args?.[7]).toBe(EXPECTED_REFERRER)
    expect(args?.slice(0, 6)).toEqual(commitmentArgs.slice(0, 6))
  })

  it('uses the same bytes32 in the HCA commitment and reveal batch', async () => {
    const readContract = vi.fn().mockResolvedValue(zeroHash)
    const secret = zeroHash
    await readCommitment({
      publicClient: { readContract } as unknown as PublicClient,
      chainId: sepolia.id,
      label: 'alice',
      wallet: OWNER,
      secret,
      resolver: RESOLVER,
      duration: DURATION,
      referrer: SUPPLIED_REFERRER,
    })
    const calls = buildRevealBatch({
      chainId: sepolia.id,
      hca: RESOLVER,
      resolver: RESOLVER,
      resolverDeployed: true,
      label: 'alice',
      wallet: OWNER,
      secret,
      price: 1n,
      duration: DURATION,
      referrer: SUPPLIED_REFERRER,
    })
    const call = calls.find((call) => call.to === contracts.ethRegistrar)
    assert(call)
    const { args } = decodeFunctionData({
      abi: ethRegistrarRegisterSnippet,
      data: call.data,
    })
    const commitmentArgs = readContract.mock.calls[0][0].args
    expect(commitmentArgs.at(-1)).toBe(EXPECTED_REFERRER)
    expect(args?.[7]).toBe(EXPECTED_REFERRER)
    expect(args?.slice(0, 6)).toEqual(commitmentArgs.slice(0, 6))
  })
})

it('encodes supplied referrers for single and batch renewal', () => {
  const single = decodeFunctionData({
    abi: ethRegistrarRenewSnippet,
    data: encodeRenewData('alice', DURATION, contracts.usdc, SUPPLIED_REFERRER),
  })
  expect(single.args?.[0].referrer).toBe(EXPECTED_REFERRER)
  // A separate entry can still renew without attribution.
  const batch = encodeRenewBatchData(
    [
      { label: 'alice', duration: DURATION, referrer: SUPPLIED_REFERRER },
      { label: 'bob', duration: DURATION },
    ],
    contracts.usdc,
  )
  const decoded = decodeFunctionData({
    abi: parseAbi([
      'function renewBatch((string label, uint64 duration, bytes32 referrer)[] entries, address paymentToken)',
    ]),
    data: batch,
  })
  expect(decoded.args[0]).toEqual([
    { label: 'alice', duration: DURATION, referrer: EXPECTED_REFERRER },
    { label: 'bob', duration: DURATION, referrer: zeroHash },
  ])
})
