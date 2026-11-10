import {
  announceReadOnlyWallet,
  toReadOnlyWalletAddress,
} from '@ens-apps/utils/readOnlyWallet'
import { useHotkeySequence } from '@tanstack/react-hotkeys'
import type { Address } from 'viem'
import { normalize } from 'viem/ens'
import { publicClient, wagmiConfig } from '@/lib/wagmi'

type ReadOnlyWalletTriggerProps = {
  readonly enabled: boolean
  /** Receives the validation error, or null once a wallet is announced. */
  readonly onError?: (message: string | null) => void
}

const resolveInput = async (input: string): Promise<Address | null> => {
  const address = toReadOnlyWalletAddress(input)
  if (address) return address

  const value = input.trim()
  if (!value) return null

  try {
    return await publicClient.getEnsAddress({ name: normalize(value) })
  } catch {
    return null
  }
}

/**
 * Invisible listener for the connect dialog. Typing C U S T O M opens a prompt
 * and, once it resolves, announces a read-only wallet so wagmi lists it.
 */
export const ReadOnlyWalletTrigger = ({
  enabled,
  onError,
}: ReadOnlyWalletTriggerProps) => {
  const connectCustomWallet = async () => {
    const input = window.prompt('Read-only wallet address or ENS name:')
    if (input === null) return

    const address = await resolveInput(input)
    if (!address) {
      onError?.('Enter a valid Ethereum address or ENS name')
      return
    }
    onError?.(null)
    announceReadOnlyWallet({ address, chainId: wagmiConfig.chains[0].id })
  }

  useHotkeySequence(
    ['C', 'U', 'S', 'T', 'O', 'M'],
    () => void connectCustomWallet(),
    {
      enabled,
      ignoreInputs: true,
      preventDefault: false,
      stopPropagation: false,
      timeout: 1000,
    },
  )

  return null
}
