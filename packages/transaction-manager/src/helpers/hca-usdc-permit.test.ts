import { encodeErrorResult } from 'viem'
import { describe, expect, it } from 'vitest'
import { classifyHcaUsdcPermit } from './hca-usdc-permit'

// WEB-2070: exact reported permit and token snapshot at Ethereum block 26304672.
const evidence = {
  chainId: 1,
  token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  ownerCode: '0xef010069007702764179f14f51cdce752f4f775d74e139',
  domainSeparator:
    '0x06c37168a7db5138defc7866392bb87a741f9b3d104deb5094588ce041cae335',
  nonce: 7n,
  timestamp: 1793352479n,
  revertData: encodeErrorResult({
    abi: [
      {
        type: 'error',
        name: 'Error',
        inputs: [{ name: 'message', type: 'string' }],
      },
    ],
    errorName: 'Error',
    args: ['EIP2612: invalid signature'],
  }),
  permit: {
    owner: '0xFB21C293A49ee73b82aE9eD53BCc3670A5928412',
    spender: '0xE54C49AF9Cc9F541b889DD7d4D87b8B837372e71',
    value: 5459733n,
    deadline: 1793356073n,
    v: 28,
    r: '0x9bb352dce253673ddf5e54e0f1ccc52045de9dc9aede6e54be417c8ee08f4cdf',
    s: '0x6a520578e86b188963e339ee191227f039f0fa4dd61c7ada0d7c2158bacc9812',
  },
} as const

describe('classifyHcaUsdcPermit', () => {
  it('recognizes only the proven delegated raw-ECDSA incompatibility', async () => {
    const result = await classifyHcaUsdcPermit(evidence)
    expect(result.isOk() && result.value).toBe('approval-required')
  })

  it.each([
    { nonce: 8n },
    { permit: { ...evidence.permit, v: 29 } },
    {
      permit: {
        ...evidence.permit,
        v: 27,
        s: '0x95adfa871794e7769c1cc611e6edd80e80bde298d92c2561b2563d341569a92f' as const,
      },
    },
    { timestamp: evidence.permit.deadline + 1n },
    {
      domainSeparator:
        '0x1111111111111111111111111111111111111111111111111111111111111111' as const,
    },
    { permit: { ...evidence.permit, owner: evidence.permit.spender } },
    { ownerCode: '0x6000' },
    { ownerCode: `${evidence.ownerCode}00` },
    { chainId: 11155111 },
    { token: evidence.permit.spender },
    {
      revertData: encodeErrorResult({
        abi: [
          {
            type: 'error',
            name: 'Error',
            inputs: [{ name: 'message', type: 'string' }],
          },
        ],
        errorName: 'Error',
        args: ['unrelated revert'],
      }),
    },
    { revertData: undefined },
  ])('rejects insufficient or contradictory proof: %o', async (overrides) => {
    const result = await classifyHcaUsdcPermit({ ...evidence, ...overrides })
    expect(result.isErr()).toBe(true)
  })
})

import {
  ContractFunctionRevertedError,
  createPublicClient,
  custom,
  parseAbi,
} from 'viem'
import { mainnet } from 'viem/chains'
import { vi } from 'vitest'
import { validateHcaUsdcPermit } from './hca-usdc-permit'

const preflight = () => ({
  ...createPublicClient({
    chain: mainnet,
    transport: custom({ request: async () => undefined }),
  }),
  getBlockNumber: vi.fn().mockResolvedValue(26304672n),
  simulateContract: vi.fn().mockRejectedValue(
    new ContractFunctionRevertedError({
      abi: parseAbi(['error Error(string message)']),
      data: evidence.revertData,
      functionName: 'permit',
    }),
  ),
  getCode: vi.fn().mockResolvedValue(evidence.ownerCode),
  getBlock: vi.fn().mockResolvedValue({ timestamp: evidence.timestamp }),
  readContract: vi
    .fn()
    .mockImplementation(async ({ functionName }) =>
      functionName === 'nonces' ? evidence.nonce : evidence.domainSeparator,
    ),
})

it('preflights the exact permit and pins every proof read to that same block', async () => {
  const publicClient = preflight()
  const result = await validateHcaUsdcPermit({
    publicClient,
    chainId: 1,
    token: evidence.token,
    permit: evidence.permit,
  })
  expect(result.isOk() && result.value).toBe('approval-required')
  expect(publicClient.simulateContract).toHaveBeenCalledWith(
    expect.objectContaining({
      account: evidence.permit.spender,
      blockNumber: 26304672n,
      args: [
        evidence.permit.owner,
        evidence.permit.spender,
        evidence.permit.value,
        evidence.permit.deadline,
        evidence.permit.v,
        evidence.permit.r,
        evidence.permit.s,
      ],
    }),
  )
  for (const read of [
    publicClient.getCode,
    publicClient.getBlock,
    publicClient.readContract,
  ]) {
    for (const [parameters] of read.mock.calls)
      expect(parameters.blockNumber).toBe(26304672n)
  }
})

it('keeps the permit when the token actually accepts it without proof or approval reads', async () => {
  const publicClient = preflight()
  publicClient.simulateContract.mockResolvedValue({})
  const result = await validateHcaUsdcPermit({
    publicClient,
    chainId: 1,
    token: evidence.token,
    permit: evidence.permit,
  })
  expect(result.isOk() && result.value).toBe('permit')
  expect(publicClient.getCode).not.toHaveBeenCalled()
})

it.each(['simulation', 'proof'] as const)(
  'fails closed on %s RPC errors',
  async (failure) => {
    const publicClient = preflight()
    if (failure === 'simulation')
      publicClient.simulateContract.mockRejectedValue(
        new Error('EIP2612: invalid signature'),
      )
    else publicClient.getCode.mockRejectedValue(new Error('RPC down'))
    expect(
      (
        await validateHcaUsdcPermit({
          publicClient,
          chainId: 1,
          token: evidence.token,
          permit: evidence.permit,
        })
      ).isErr(),
    ).toBe(true)
  },
)
