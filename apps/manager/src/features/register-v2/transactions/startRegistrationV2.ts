import type { Address, PublicClient } from 'viem'
import type { RegistrationV2UiActor } from '@/features/register-v2/machines/registrationV2UiMachine'
import type { SmartAccountState } from '@/lib/smart-account'
import { durationYearsToSeconds } from '@/features/register/components/Pricing/utils'
import { SUPPORTED_TOKENS } from '@/features/register/services/nameChainContractService'

export interface StartRegistrationV2Params {
  name: string
  durationYears: number
  selectedToken: Address
  tokenPrice: bigint
}

export interface StartRegistrationV2Options {
  publicClient: PublicClient
  fast?: boolean
}

export function startRegistrationV2(
  params: StartRegistrationV2Params,
  account: SmartAccountState,
  actor: RegistrationV2UiActor,
  options: StartRegistrationV2Options,
): void {
  const { name, durationYears, selectedToken, tokenPrice } = params
  const { publicClient, fast = true } = options

  if (!account.signer || !account.accountAddress) {
    throw new Error('Account not ready')
  }

  const ownerAddress = account.ownerAddress ?? account.accountAddress
  const token = selectedToken === SUPPORTED_TOKENS.DAI ? 'DAI' : 'USDC'

  actor.send({
    type: 'SUBMIT_REGISTRATION',
    startEvent: {
      type: 'START_REGISTRATION',
      name,
      duration: durationYearsToSeconds(durationYears),
      token,
      price: tokenPrice,
      signer: account.signer,
      accountAddress: account.accountAddress,
      ownerAddress,
      publicClient,
      useFastRegistrar: Boolean(fast),
      sponsored:
        import.meta.env.VITE_ENABLE_TX_SPONSORSHIP === undefined
          ? true
          : import.meta.env.VITE_ENABLE_TX_SPONSORSHIP === 'true',
    },
  })
}
