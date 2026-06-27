import {
  ENS_SEPOLIA_CONTRACTS,
  ETH_REGISTRAR_CONTROLLER_ABI,
  REFERER_ADDRESS,
} from '@ens-apps/transaction-manager'
import type { Address } from 'viem'
import { decodeFunctionData } from 'viem'
import { describe, expect, it } from 'vitest'
import type { RenewableGraceName } from './classifyNames'
import {
  buildLegacyGraceRenewalCall,
  estimateLegacyGraceRenewals,
  executeLegacyGraceRenewals,
} from './legacyGraceRenewal'
import type { V1Domain } from './v1SubgraphClient'

const OWNER: Address = '0x0000000000000000000000000000000000000001'

const graceName = {
  label: 'legacy',
  domain: {
    id: '0x01',
    name: 'legacy.eth',
    labelName: 'legacy',
  } as V1Domain,
  renewalMode: 'onchain',
  renewalDurationSeconds: 604_801,
  tokenHolder: OWNER,
} as RenewableGraceName

const localTestGraceName = {
  ...graceName,
  domain: {
    ...graceName.domain,
    id: '0x02',
    name: 'local.eth',
    labelName: 'local',
  } as V1Domain,
  label: 'local',
  renewalMode: 'local-test-noop',
} as RenewableGraceName

describe('buildLegacyGraceRenewalCall', () => {
  it('encodes legacy controller renew with the fixed duration and ETH value', () => {
    const call = buildLegacyGraceRenewalCall({
      name: graceName,
      price: 123n,
    })

    expect(call.to).toBe(ENS_SEPOLIA_CONTRACTS.ETHRegistrarController)
    expect(call.value).toBe(123n)
    expect(call.data.slice(0, 10)).toBe('0x18026ad1')
    expect(
      decodeFunctionData({
        abi: ETH_REGISTRAR_CONTROLLER_ABI,
        data: call.data,
      }),
    ).toEqual({
      functionName: 'renew',
      args: ['legacy', 604_801n, REFERER_ADDRESS],
    })
  })
})

describe('estimateLegacyGraceRenewals', () => {
  it('sums renewal value and estimated gas fee for selected names', async () => {
    const publicClient = {
      estimateFeesPerGas: async () => ({ maxFeePerGas: 2n }),
      estimateGas: async () => 50_000n,
      readContract: async () => ({ base: 100n, premium: 25n }),
    } as never

    await expect(
      estimateLegacyGraceRenewals({
        names: [graceName, graceName],
        accountAddress: OWNER,
        publicClient,
      }),
    ).resolves.toMatchObject({
      renewalCostWei: 250n,
      gasUnits: 100_000n,
      gasFeeWei: 200_000n,
      transactionCount: 2,
    })
  })

  it('uses fallback gas when RPC gas estimation fails locally', async () => {
    const publicClient = {
      estimateFeesPerGas: async () => ({ maxFeePerGas: 2n }),
      estimateGas: async () => {
        throw new Error('insufficient funds for gas')
      },
      readContract: async () => ({ base: 100n, premium: 25n }),
    } as never

    await expect(
      estimateLegacyGraceRenewals({
        names: [graceName],
        accountAddress: OWNER,
        publicClient,
      }),
    ).resolves.toMatchObject({
      renewalCostWei: 125n,
      gasUnits: 120_000n,
      gasFeeWei: 240_000n,
      transactionCount: 1,
    })
  })

  it('estimates renewal cost for local future-expiry test names', async () => {
    const publicClient = {
      estimateFeesPerGas: async () => ({ maxFeePerGas: 2n }),
      estimateGas: async () => 50_000n,
      readContract: async () => ({ base: 100n, premium: 25n }),
    } as never

    await expect(
      estimateLegacyGraceRenewals({
        names: [localTestGraceName],
        accountAddress: OWNER,
        publicClient,
      }),
    ).resolves.toMatchObject({
      renewalCostWei: 125n,
      gasUnits: 50_000n,
      gasFeeWei: 100_000n,
      transactionCount: 1,
    })
  })
})

describe('executeLegacyGraceRenewals', () => {
  it('marks local future-expiry test names as renewed without submitting a transaction', async () => {
    const progress: string[] = []

    await expect(
      executeLegacyGraceRenewals({
        names: [localTestGraceName],
        signer: {} as never,
        accountAddress: OWNER,
        publicClient: {} as never,
        onProgress: (event) => progress.push(event.description),
      }),
    ).resolves.toEqual({
      renewedNames: ['local.eth'],
      txHashes: [],
    })

    expect(progress).toEqual(['Renew local.eth', 'Renewed local.eth'])
  })
})
