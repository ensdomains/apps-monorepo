import type { SUPPORTED_TOKEN } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import type { PublicClient } from 'viem'
import type { RegistrationV2UiActor } from '@/features/register-v2/machines/registrationV2UiMachine'
import type { SmartAccountState } from '@/lib/smart-account'
import { publicClient as defaultPublicClient } from '@/lib/wagmi'

export interface StartRegistrationV2Params {
  name: string
  duration: number
  selectedToken: SUPPORTED_TOKEN
  tokenPrice: bigint
}

export interface StartRegistrationV2Options {
  publicClient?: PublicClient
  fast?: boolean
}

export function startRegistrationV2(
  params: StartRegistrationV2Params,
  account: SmartAccountState,
  actor: RegistrationV2UiActor,
  options: StartRegistrationV2Options,
): void {
  const { name, duration, selectedToken, tokenPrice } = params
  const { publicClient = defaultPublicClient, fast = true } = options

  if (!account.signer || !account.accountAddress) {
    throw new Error('Account not ready')
  }

  const ownerAddress = account.ownerAddress ?? account.accountAddress

  actor.send({
    type: 'registration.submit',
    startEvent: {
      type: 'START_REGISTRATION',
      name,
      duration: BigInt(duration),
      token: selectedToken,
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
