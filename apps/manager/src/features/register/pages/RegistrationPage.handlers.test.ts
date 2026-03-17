import type { registrationMachine } from '@ens-apps/transaction-manager'
import type { PublicClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActorRefFrom } from 'xstate'
import type { SmartAccountState } from '@/lib/smart-account'
import { SUPPORTED_TOKENS } from '../services/nameChainContractService'
import {
  handleStartRegistration,
  type StartRegistrationParams,
} from './RegistrationPage.handlers'

vi.mock('@ens-apps/transaction-manager', () => ({}))

const mockSend = vi.fn()
const mockActor = { send: mockSend } as unknown as ActorRefFrom<
  typeof registrationMachine
>

const validAccount = {
  signer: {},
  accountAddress: '0x123',
  ownerAddress: '0xowner',
  type: 'zerodev' as const,
  config: {},
} as unknown as SmartAccountState

const baseParams: StartRegistrationParams = {
  name: 'test.eth',
  duration: 1,
  selectedToken: SUPPORTED_TOKENS.USDC,
  tokenPrice: 1000n,
}

const baseOptions = {
  publicClient: {} as unknown as PublicClient,
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
      { ...validAccount, signer: undefined } as unknown as SmartAccountState,
      mockActor,
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
      {
        ...validAccount,
        accountAddress: undefined,
      } as unknown as SmartAccountState,
      mockActor,
      baseOptions,
    )

    expect(mockSend).not.toHaveBeenCalled()
    expect(alertSpy).toHaveBeenCalled()
    alertSpy.mockRestore()
  })

  it('sends START_REGISTRATION with USDC when selectedToken is USDC', () => {
    handleStartRegistration(baseParams, validAccount, mockActor, baseOptions)

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
      mockActor,
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
