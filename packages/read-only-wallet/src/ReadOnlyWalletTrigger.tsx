import { useEffect } from 'react'
import type { PublicClient } from 'viem'
import {
  announceReadOnlyWallet,
  resolveReadOnlyAddress,
} from './readOnlyWallet'

const SECRET = 'custom'
const RESET_MS = 1000

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
  useEffect(() => {
    if (!enabled) return

    let typed = ''
    let resetTimer: ReturnType<typeof setTimeout> | undefined

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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const key = event.key.toLowerCase()
      if (!/^[a-z]$/.test(key)) return

      typed = `${typed}${key}`.slice(-SECRET.length)
      if (resetTimer) clearTimeout(resetTimer)
      resetTimer = setTimeout(() => {
        typed = ''
      }, RESET_MS)

      if (typed !== SECRET) return
      typed = ''
      void connectCustomWallet()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (resetTimer) clearTimeout(resetTimer)
    }
  }, [chainId, client, enabled, onError])

  return null
}
