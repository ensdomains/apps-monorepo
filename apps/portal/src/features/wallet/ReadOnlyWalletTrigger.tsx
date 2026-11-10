import {
  announceReadOnlyWallet,
  resolveReadOnlyAddress,
} from '@ens-apps/utils/readOnlyWallet'
import { useHotkeySequence } from '@tanstack/react-hotkeys'
import type { PublicClient } from 'viem'

type ReadOnlyWalletTriggerProps = {
  readonly enabled: boolean
  readonly chainId: number
  readonly client?: Pick<PublicClient, 'getEnsAddress'> | undefined
  /** Receives the validation error, or null once a wallet is announced. */
  readonly onError?: (message: string | null) => void
}

/**
 * Invisible listener for the connect dialog. Typing C U S T O M opens a prompt
 * and, once it resolves, announces a read-only wallet so wagmi lists it.
 */
export const ReadOnlyWalletTrigger = ({
  enabled,
  chainId,
  client,
  onError,
}: ReadOnlyWalletTriggerProps) => {
  const connectCustomWallet = async () => {
    const input = window.prompt('Read-only wallet address or ENS name:')
    if (input === null) return

    const address = await resolveReadOnlyAddress(input, client)
    if (!address) {
      onError?.('Enter a valid Ethereum address or ENS name')
      return
    }
    onError?.(null)
    announceReadOnlyWallet({ address, chainId })
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
