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

type GetLogsArgs = Parameters<PublicClient['getLogs']>[0]
const mockPublicClient = (getLogsImpl: (args?: GetLogsArgs) => unknown) =>
  ({
    getLogs: vi.fn(getLogsImpl),
  }) as unknown as PublicClient

const makeDecodedLog = (args: {
  sender: Address
  proxyAddress: Address
  salt: bigint
  implementation: Address
}) => ({ args })

const proxyDeployedEvent = parseAbiItem(
  'event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)',
)

const makeRawReceiptLog = (args: {
  sender: Address
  proxyAddress: Address
  salt: bigint
  implementation: Address
}): { topics: readonly Hex[]; data: Hex } => {
  const topics = encodeEventTopics({
    abi: [proxyDeployedEvent],
    eventName: 'ProxyDeployed',
    args: { sender: args.sender, proxyAddress: args.proxyAddress },
  }) as readonly Hex[]
  const data = encodeAbiParameters(
    [
      { name: 'salt', type: 'uint256' },
      { name: 'implementation', type: 'address' },
    ],
    [args.salt, args.implementation],
  )
  return { topics, data }
}

beforeEach(() => {
  writeContractMock.mockReset()
  waitForTransactionReceiptMock.mockReset()
})

describe('findExistingPermRes', () => {
  it('returns null when no logs are returned', async () => {
    const publicClient = mockPublicClient(() => [])
    const result = await findExistingPermRes({ eoa: EOA, publicClient })
    expect(result).toBeNull()
  })

  it('returns null when implementation does not match the expected PermissionedResolverImpl', async () => {
    const publicClient = mockPublicClient(() => [
      makeDecodedLog({
        sender: EOA,
        proxyAddress: PROXY_A,
        salt: computeOwnedResolverSalt(EOA, 0n),
        implementation: UNKNOWN_IMPL,
      }),
    ])
    const result = await findExistingPermRes({ eoa: EOA, publicClient })
    expect(result).toBeNull()
  })

  it('returns null when salt does not match the computed expected salt', async () => {
    const publicClient = mockPublicClient(() => [
      makeDecodedLog({
        sender: EOA,
        proxyAddress: PROXY_A,
        salt: 0xdeadbeefn,
        implementation: V2_CONTRACTS.PermissionedResolverImpl,
      }),
    ])
    const result = await findExistingPermRes({ eoa: EOA, publicClient })
    expect(result).toBeNull()
  })

  it('returns the proxy address when both salt and implementation match', async () => {
    const publicClient = mockPublicClient(() => [
      makeDecodedLog({
        sender: EOA,
        proxyAddress: PROXY_A,
        salt: computeOwnedResolverSalt(EOA, 0n),
        implementation: V2_CONTRACTS.PermissionedResolverImpl,
      }),
    ])
    const result = await findExistingPermRes({ eoa: EOA, publicClient })
    expect(result?.toLowerCase()).toBe(PROXY_A.toLowerCase())
  })

  it('iterates in reverse and returns the most recent matching deployment', async () => {
    const salt = computeOwnedResolverSalt(EOA, 0n)
    const publicClient = mockPublicClient(() => [
      makeDecodedLog({
        sender: EOA,
        proxyAddress: PROXY_A,
        salt,
        implementation: V2_CONTRACTS.PermissionedResolverImpl,
      }),
      makeDecodedLog({
        sender: EOA,
        proxyAddress: PROXY_B,
        salt,
        implementation: V2_CONTRACTS.PermissionedResolverImpl,
      }),
    ])
    const result = await findExistingPermRes({ eoa: EOA, publicClient })
    expect(result?.toLowerCase()).toBe(PROXY_B.toLowerCase())
  })

  it('scopes the getLogs query to the deployed factory address and sender filter', async () => {
    const getLogsSpy = vi.fn(() => [])
    const publicClient = {
      getLogs: getLogsSpy,
    } as unknown as PublicClient
    await findExistingPermRes({ eoa: EOA, publicClient })
    expect(getLogsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        address: V2_CONTRACTS.VerifiableFactory,
        args: { sender: EOA },
      }),
    )
  })
})

describe('ensureOwnedPermRes', () => {
  it('short-circuits and returns the existing proxy when found, without calling writeContract', async () => {
    const publicClient = mockPublicClient(() => [
      makeDecodedLog({
        sender: EOA,
        proxyAddress: PROXY_A,
        salt: computeOwnedResolverSalt(EOA, 0n),
        implementation: V2_CONTRACTS.PermissionedResolverImpl,
      }),
    ])

    const result = await ensureOwnedPermRes({
      eoa: EOA,
      wagmiConfig,
      publicClient,
    })

    expect(result.toLowerCase()).toBe(PROXY_A.toLowerCase())
    expect(writeContractMock).not.toHaveBeenCalled()
    expect(waitForTransactionReceiptMock).not.toHaveBeenCalled()
  })

  it('deploys when no existing proxy, parses the ProxyDeployed log and returns the new address', async () => {
    const publicClient = mockPublicClient(() => [])
    const hash = ('0x' + 'ab'.repeat(32)) as Hex
    writeContractMock.mockResolvedValueOnce(hash)
    waitForTransactionReceiptMock.mockResolvedValueOnce({
      status: 'success',
      logs: [
        makeRawReceiptLog({
          sender: EOA,
          proxyAddress: PROXY_B,
          salt: computeOwnedResolverSalt(EOA, 0n),
          implementation: V2_CONTRACTS.PermissionedResolverImpl,
        }),
      ],
    } as never)

    const result = await ensureOwnedPermRes({
      eoa: EOA,
      wagmiConfig,
      publicClient,
    })

    expect(result.toLowerCase()).toBe(PROXY_B.toLowerCase())
    expect(writeContractMock).toHaveBeenCalledTimes(1)
  })

  it('wraps a writeContract rejection in OwnedResolverDeployError', async () => {
    const publicClient = mockPublicClient(() => [])
    writeContractMock.mockRejectedValueOnce(new Error('user rejected signing'))
    await expect(
      ensureOwnedPermRes({ eoa: EOA, wagmiConfig, publicClient }),
    ).rejects.toBeInstanceOf(OwnedResolverDeployError)
  })

  it('throws OwnedResolverDeployError when the receipt status is not success', async () => {
    const publicClient = mockPublicClient(() => [])
    writeContractMock.mockResolvedValueOnce('0xfeed' as Hex)
    waitForTransactionReceiptMock.mockResolvedValueOnce({
      status: 'reverted',
      logs: [],
    } as never)

    await expect(
      ensureOwnedPermRes({ eoa: EOA, wagmiConfig, publicClient }),
    ).rejects.toBeInstanceOf(OwnedResolverDeployError)
  })

  it('throws OwnedResolverDeployError when the receipt has no ProxyDeployed log', async () => {
    const publicClient = mockPublicClient(() => [])
    writeContractMock.mockResolvedValueOnce('0xfeed' as Hex)
    waitForTransactionReceiptMock.mockResolvedValueOnce({
      status: 'success',
      logs: [{ topics: [toEventSelector('event Unrelated()')], data: '0x' }],
    } as never)

    await expect(
      ensureOwnedPermRes({ eoa: EOA, wagmiConfig, publicClient }),
    ).rejects.toBeInstanceOf(OwnedResolverDeployError)
  })
})
