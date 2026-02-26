import { describe, expect, it, vi } from 'vitest'
import { SUPPORTED_TOKENS } from '../services/nameChainContractService'
import {
  handleStartRegistration,
  type StartRegistrationParams,
} from './RegistrationPage.handlers'

vi.mock('@ens-apps/transaction-manager', () => ({}))

const mockSend = vi.fn()
const mockActor = { send: mockSend }

const validAccount = {
  signer: {},
  accountAddress: '0x123',
  ownerAddress: '0xowner',
  type: 'zerodev' as const,
  config: {},
}

const baseParams: StartRegistrationParams = {
  name: 'test.eth',
  duration: 1,
  selectedToken: SUPPORTED_TOKENS.USDC,
  tokenPrice: 1000n,
}

const baseOptions = {
  publicClient: {} as never,
  fast: true,
}

describe('handleStartRegistration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns early and alerts when account has no signer', () => {
    const alertSpy = vi.spyOn(global, 'alert').mockImplementation(() => {})
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    handleStartRegistration(
      baseParams,
      { ...validAccount, signer: undefined },
      mockActor as never,
      baseOptions,
    )

    expect(mockSend).not.toHaveBeenCalled()
    expect(alertSpy).toHaveBeenCalledWith(
      'Account not ready. Please wait for wallet to connect.',
    )
    alertSpy.mockRestore()
    consoleSpy.mockRestore()
  })

  it('returns early when account has no accountAddress', () => {
    const alertSpy = vi.spyOn(global, 'alert').mockImplementation(() => {})

    handleStartRegistration(
      baseParams,
      { ...validAccount, accountAddress: undefined },
      mockActor as never,
      baseOptions,
    )

    expect(mockSend).not.toHaveBeenCalled()
    expect(alertSpy).toHaveBeenCalled()
    alertSpy.mockRestore()
  })

  it('sends START_REGISTRATION with USDC when selectedToken is USDC', () => {
    handleStartRegistration(
      baseParams,
      validAccount,
      mockActor as never,
      baseOptions,
    )

    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'START_REGISTRATION',
        name: 'test.eth',
        token: 'USDC',
        price: 1000n,
        ownerAddress: '0xowner',
      }),
    )
  })

  it('sends START_REGISTRATION with DAI when selectedToken is DAI', () => {
    handleStartRegistration(
      { ...baseParams, selectedToken: SUPPORTED_TOKENS.DAI },
      validAccount,
      mockActor as never,
      baseOptions,
    )

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'START_REGISTRATION',
        token: 'DAI',
      }),
    )
  })
})
