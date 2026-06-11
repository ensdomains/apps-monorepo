import type { Config as WagmiConfig } from '@wagmi/core'
import { waitForTransactionReceipt, writeContract } from '@wagmi/core'
import {
  type Address,
  encodeAbiParameters,
  encodeEventTopics,
  type Hex,
  type PublicClient,
  parseAbiItem,
  toEventSelector,
} from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { V2_CONTRACTS } from '../contracts/addresses'
import { computeOwnedResolverSalt } from '../contracts/permissionedResolverAddress'
import {
  ensureOwnedPermRes,
  findExistingPermRes,
  OwnedResolverDeployError,
  predictOwnedPermResAddress,
} from './ensureOwnedPermRes'

vi.mock('@wagmi/core', () => ({
  writeContract: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
}))

const writeContractMock = vi.mocked(writeContract)
const waitForTransactionReceiptMock = vi.mocked(waitForTransactionReceipt)

const EOA: Address = '0x0000000000000000000000000000000000000001'
const PROXY_A: Address = '0x00000000000000000000000000000000000000aa'
const PROXY_B: Address = '0x00000000000000000000000000000000000000bb'
const UNKNOWN_IMPL: Address = '0x00000000000000000000000000000000000000ff'
const wagmiConfig = {} as WagmiConfig

const mockClient = (
  getLogsImpl: (args?: Parameters<PublicClient['getLogs']>[0]) => unknown,
): PublicClient => ({ getLogs: vi.fn(getLogsImpl) }) as unknown as PublicClient

type LogArgs = {
  sender: Address
  proxyAddress: Address
  salt: bigint
  implementation: Address
}

const decodedLog = (args: LogArgs) => ({ args })

const proxyDeployedEvent = parseAbiItem(
  'event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)',
)

const rawLog = (args: LogArgs): { topics: readonly Hex[]; data: Hex } => ({
  topics: encodeEventTopics({
    abi: [proxyDeployedEvent],
    eventName: 'ProxyDeployed',
    args: { sender: args.sender, proxyAddress: args.proxyAddress },
  }) as readonly Hex[],
  data: encodeAbiParameters(
    [
      { name: 'salt', type: 'uint256' },
      { name: 'implementation', type: 'address' },
    ],
    [args.salt, args.implementation],
  ),
})

const matchingLog = (proxy: Address): LogArgs => ({
  sender: EOA,
  proxyAddress: proxy,
  salt: computeOwnedResolverSalt(EOA, 0n),
  implementation: V2_CONTRACTS.PermissionedResolverImpl,
})

beforeEach(() => {
  writeContractMock.mockReset()
  waitForTransactionReceiptMock.mockReset()
})

describe('findExistingPermRes', () => {
  it.each([
    ['no logs', []],
    [
      'implementation mismatch',
      [decodedLog({ ...matchingLog(PROXY_A), implementation: UNKNOWN_IMPL })],
    ],
    [
      'salt mismatch',
      [decodedLog({ ...matchingLog(PROXY_A), salt: 0xdeadbeefn })],
    ],
  ] as const)('returns null on %s', async (_, logs) => {
    const result = await findExistingPermRes({
      eoa: EOA,
      publicClient: mockClient(() => logs),
    })
    expect(result).toBeNull()
  })

  it('returns the proxy address when both salt and implementation match', async () => {
    const result = await findExistingPermRes({
      eoa: EOA,
      publicClient: mockClient(() => [decodedLog(matchingLog(PROXY_A))]),
    })
    expect(result?.toLowerCase()).toBe(PROXY_A.toLowerCase())
  })

  it('iterates in reverse and returns the most recent matching deployment', async () => {
    const result = await findExistingPermRes({
      eoa: EOA,
      publicClient: mockClient(() => [
        decodedLog(matchingLog(PROXY_A)),
        decodedLog(matchingLog(PROXY_B)),
      ]),
    })
    expect(result?.toLowerCase()).toBe(PROXY_B.toLowerCase())
  })

  it('scopes getLogs to the factory address with sender filter', async () => {
    const getLogsSpy = vi.fn(() => [])
    await findExistingPermRes({
      eoa: EOA,
      publicClient: { getLogs: getLogsSpy } as unknown as PublicClient,
    })
    expect(getLogsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        address: V2_CONTRACTS.VerifiableFactory,
        args: { sender: EOA },
      }),
    )
  })
})

describe('predictOwnedPermResAddress', () => {
  it('skips the existing resolver log lookup when preflight already checked it', async () => {
    const getLogs = vi.fn()
    const simulateContract = vi.fn().mockResolvedValueOnce({ result: PROXY_A })
    const result = await predictOwnedPermResAddress({
      eoa: EOA,
      publicClient: {
        getLogs,
        simulateContract,
      } as unknown as PublicClient,
      skipExistingCheck: true,
    })

    expect(result).toBe(PROXY_A)
    expect(getLogs).not.toHaveBeenCalled()
    expect(simulateContract).toHaveBeenCalledTimes(1)
  })
})

describe('ensureOwnedPermRes', () => {
  it('returns the existing proxy and skips deploy when one is found', async () => {
    const publicClient = mockClient(() => [decodedLog(matchingLog(PROXY_A))])
    const result = await ensureOwnedPermRes({
      eoa: EOA,
      wagmiConfig,
      publicClient,
    })
    expect(result.toLowerCase()).toBe(PROXY_A.toLowerCase())
    expect(writeContractMock).not.toHaveBeenCalled()
    expect(waitForTransactionReceiptMock).not.toHaveBeenCalled()
  })

  it('deploys, parses the ProxyDeployed log, and returns the new address', async () => {
    const publicClient = mockClient(() => [])
    writeContractMock.mockResolvedValueOnce(`0x${'ab'.repeat(32)}` as Hex)
    waitForTransactionReceiptMock.mockResolvedValueOnce({
      status: 'success',
      logs: [rawLog(matchingLog(PROXY_B))],
    } as never)

    const result = await ensureOwnedPermRes({
      eoa: EOA,
      wagmiConfig,
      publicClient,
    })
    expect(result.toLowerCase()).toBe(PROXY_B.toLowerCase())
    expect(writeContractMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    [
      'writeContract rejection',
      () => {
        writeContractMock.mockRejectedValueOnce(new Error('user rejected'))
      },
    ],
    [
      'receipt status is not success',
      () => {
        writeContractMock.mockResolvedValueOnce('0xfeed' as Hex)
        waitForTransactionReceiptMock.mockResolvedValueOnce({
          status: 'reverted',
          logs: [],
        } as never)
      },
    ],
    [
      'receipt has no ProxyDeployed log',
      () => {
        writeContractMock.mockResolvedValueOnce('0xfeed' as Hex)
        waitForTransactionReceiptMock.mockResolvedValueOnce({
          status: 'success',
          logs: [
            { topics: [toEventSelector('event Unrelated()')], data: '0x' },
          ],
        } as never)
      },
    ],
  ])('wraps %s in OwnedResolverDeployError', async (_, setup) => {
    setup()
    await expect(
      ensureOwnedPermRes({
        eoa: EOA,
        wagmiConfig,
        publicClient: mockClient(() => []),
      }),
    ).rejects.toBeInstanceOf(OwnedResolverDeployError)
  })
})
