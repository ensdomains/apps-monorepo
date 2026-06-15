import type { Config as WagmiConfig } from '@wagmi/core'
import { readContracts } from '@wagmi/core'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkHelperApprovals } from './checkHelperApprovals'

vi.mock('@wagmi/core', () => ({
  readContracts: vi.fn(),
}))

const readContractsMock = vi.mocked(readContracts)

const EOA: Address = '0x0000000000000000000000000000000000000001'
const HELPER: Address = '0x0000000000000000000000000000000000000002'
const WAGMI = {} as WagmiConfig

beforeEach(() => {
  readContractsMock.mockReset()
})

describe('checkHelperApprovals', () => {
  it('skips approval reads when neither token contract is needed', async () => {
    await expect(
      checkHelperApprovals({
        eoa: EOA,
        helperAddress: HELPER,
        needs: { hasUnwrapped: false, hasWrapped: false },
        wagmiConfig: WAGMI,
      }),
    ).resolves.toEqual({
      baseRegistrarApproved: true,
      nameWrapperApproved: true,
    })
    expect(readContractsMock).not.toHaveBeenCalled()
  })

  it('batches BaseRegistrar and NameWrapper approval reads together', async () => {
    readContractsMock.mockResolvedValueOnce([false, true] as never)

    await expect(
      checkHelperApprovals({
        eoa: EOA,
        helperAddress: HELPER,
        needs: { hasUnwrapped: true, hasWrapped: true },
        wagmiConfig: WAGMI,
      }),
    ).resolves.toEqual({
      baseRegistrarApproved: false,
      nameWrapperApproved: true,
    })

    expect(readContractsMock).toHaveBeenCalledTimes(1)
    const options = readContractsMock.mock.calls[0]?.[1] as unknown as {
      allowFailure: boolean
      batchSize: number
      contracts: readonly { functionName: string }[]
    }
    expect(options).toMatchObject({
      allowFailure: false,
      batchSize: 0,
    })
    expect(options.contracts.map((contract) => contract.functionName)).toEqual([
      'isApprovedForAll',
      'isApprovedForAll',
    ])
  })

  it('keeps unrelated approval status true when only one contract is needed', async () => {
    readContractsMock.mockResolvedValueOnce([false] as never)

    await expect(
      checkHelperApprovals({
        eoa: EOA,
        helperAddress: HELPER,
        needs: { hasUnwrapped: false, hasWrapped: true },
        wagmiConfig: WAGMI,
      }),
    ).resolves.toEqual({
      baseRegistrarApproved: true,
      nameWrapperApproved: false,
    })

    const options = readContractsMock.mock.calls[0]?.[1] as unknown as {
      contracts: readonly unknown[]
    }
    expect(options.contracts).toHaveLength(1)
  })
})
