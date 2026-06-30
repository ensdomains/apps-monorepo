import { useEffect, useRef, useState } from 'react'
import { type Address, isAddress } from 'viem'
import { resolveAddressOrName } from '@/features/roles/helpers/addUser.handlers'
import { wagmiConfig } from '@/lib/wagmi'
import { isNameOrAddress } from '@/utils/token/isNameOrAddress'

// Module-level client for resolution — matches RegistryAddUserSheet, which
// resolves outside any hook against the same wagmi config client.
const client = wagmiConfig.getClient()
const DEBOUNCE_MS = 500

export type RecipientResolution = {
  /** Resolved recipient address, or null while empty / invalid / unresolved. */
  readonly address: Address | null
  readonly isResolving: boolean
  readonly error: string | null
}

/**
 * Resolve a recipient input (an ENS name or a 0x address) to an address.
 * Addresses resolve immediately; names are debounced and resolved via the
 * universal resolver (falling back to the ENS owner if no address record).
 */
export const useRecipientResolution = (input: string): RecipientResolution => {
  const [address, setAddress] = useState<Address | null>(null)
  const [isResolving, setIsResolving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const trimmed = input.trim()
    setError(null)

    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    if (!trimmed) {
      setAddress(null)
      setIsResolving(false)
      return
    }

    if (!isNameOrAddress(trimmed)) {
      setAddress(null)
      setIsResolving(false)
      setError('Enter a valid ENS name or address')
      return
    }

    setIsResolving(true)
    let cancelled = false

    const run = async () => {
      const resolved = await resolveAddressOrName({
        client,
        nameOrAddress: trimmed,
      })
      if (cancelled) return
      setAddress(resolved)
      setIsResolving(false)
      if (!resolved) setError('Could not resolve a name or address')
    }

    // Addresses don't need debouncing; names do.
    timeoutRef.current = setTimeout(
      run,
      isAddress(trimmed, { strict: false }) ? 0 : DEBOUNCE_MS,
    )

    return () => {
      cancelled = true
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [input])

  return { address, isResolving, error }
}
