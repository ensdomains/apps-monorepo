import { beforeEach, describe, expect, it, vi } from 'vitest'

const LEGACY_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
const NAME_WRAPPER = '0x0635513f179D50A207757E05759CbD106d7dFcE8'
const CONTROLLER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

const readContractMock = vi.fn()

vi.mock('viem/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/utils')>()),
  getAction: () => readContractMock,
}))
vi.mock('@ensdomains/ensjs/chain', () => ({
  getChainContractAddress: ({ contract }: { contract: string }) => {
    if (contract === 'ensLegacyRegistry') return LEGACY_REGISTRY
    if (contract === 'ensNameWrapper') return NAME_WRAPPER
    throw new Error(`unexpected contract ${contract}`)
  },
}))
vi.mock('@/lib/wagmi/helpers', async () => {
  const { ok } = await import('neverthrow')
  return {
    safeGetClient: () => ok({ chain: { id: 11155111 } }),
  }
})

const { getV1NameManager } = await import('./getV1NameManager')

describe('getV1NameManager', () => {
  beforeEach(() => {
    readContractMock.mockReset()
  })

  it('reads the legacy registry owner of an unwrapped name', async () => {
    readContractMock.mockResolvedValue(CONTROLLER)

    const result = await getV1NameManager({ name: 'legacy.eth' })

    expect(result._unsafeUnwrap()).toBe(CONTROLLER)
    expect(readContractMock).toHaveBeenCalledWith(
      expect.objectContaining({
        address: LEGACY_REGISTRY,
        functionName: 'owner',
      }),
    )
  })

  // The wrapper holds the slot of every wrapped name; its owner is the Owner
  // row's account, not a manager of its own (WEB-1514).
  it('is null for a wrapped name', async () => {
    readContractMock.mockResolvedValue(NAME_WRAPPER.toLowerCase())

    const result = await getV1NameManager({ name: 'wrapped.eth' })

    expect(result._unsafeUnwrap()).toBeNull()
  })
})
