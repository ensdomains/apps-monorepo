'use client'

import { transactionManager } from '@ens-apps/transaction-manager'
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  type Address,
  createWalletClient,
  custom,
  type WalletClient,
} from 'viem'
import { backendAuthStore } from '@/utils/backend-client'
import { setParaConnectionCookie } from './para'
import { customSepolia } from './wagmi'

type EthereumProvider = Parameters<typeof custom>[0] & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void
  removeListener?: (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => void
  request?: (args: {
    method: string
    params?: unknown[] | object
  }) => Promise<unknown>
}

interface DirectMetaMaskContextValue {
  readonly address: Address | null
  readonly walletClient: WalletClient | null
  readonly isConnected: boolean
  readonly isConnecting: boolean
  readonly isActive: boolean
  readonly connect: () => Promise<void>
  readonly disconnect: () => Promise<void>
}

const DirectMetaMaskContext = createContext<DirectMetaMaskContextValue | null>(
  null,
)

const createClientForAddress = (
  provider: EthereumProvider,
  address: Address,
): WalletClient =>
  createWalletClient({
    account: address,
    chain: customSepolia,
    transport: custom(provider),
  })

function getEthereumProvider(): EthereumProvider {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('MetaMask provider not found on window.ethereum')
  }

  return window.ethereum as EthereumProvider
}

export const DirectMetaMaskProvider = ({
  children,
}: {
  children: ReactNode
}) => {
  const [address, setAddress] = useState<Address | null>(null)
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const lastKnownAddressRef = useRef<Address | null>(null)
  const emptyAccountsTimeoutRef = useRef<number | null>(null)

  const resetConnection = async () => {
    if (emptyAccountsTimeoutRef.current !== null) {
      window.clearTimeout(emptyAccountsTimeoutRef.current)
      emptyAccountsTimeoutRef.current = null
    }
    setAddress(null)
    setWalletClient(null)
    setIsActive(false)
    lastKnownAddressRef.current = null
    await setParaConnectionCookie(null)
    transactionManager.clearAllAndPersistence()
    backendAuthStore.trigger.signOut()
  }

  const connect = async () => {
    setIsConnecting(true)
    setIsActive(true)

    try {
      const provider = getEthereumProvider()
      const tempClient = createWalletClient({
        chain: customSepolia,
        transport: custom(provider),
      })

      const [nextAddress] = await tempClient.requestAddresses()
      if (!nextAddress) {
        throw new Error('MetaMask returned no account address')
      }

      setAddress(nextAddress)
      setWalletClient(createClientForAddress(provider, nextAddress))
      lastKnownAddressRef.current = nextAddress
      await setParaConnectionCookie(nextAddress)
    } catch (error) {
      setIsActive(false)
      throw error
    } finally {
      setIsConnecting(false)
    }
  }

  const disconnect = async () => {
    await resetConnection()
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return

    const provider = window.ethereum as EthereumProvider

    const handleAccountsChanged = (accounts: unknown) => {
      if (!Array.isArray(accounts) || accounts.length === 0) {
        if (!lastKnownAddressRef.current) {
          void resetConnection()
          return
        }

        // MetaMask can emit a transient empty accounts update while other wallet
        // layers query `eth_accounts`. Re-check once before treating it as a real disconnect.
        if (emptyAccountsTimeoutRef.current !== null) {
          window.clearTimeout(emptyAccountsTimeoutRef.current)
        }

        emptyAccountsTimeoutRef.current = window.setTimeout(async () => {
          try {
            const result = await provider.request?.({ method: 'eth_accounts' })
            const nextAccounts = Array.isArray(result) ? result : []
            const nextAddress = nextAccounts[0]

            if (typeof nextAddress === 'string') {
              const normalizedAddress = nextAddress as Address
              setAddress(normalizedAddress)
              setWalletClient(
                createClientForAddress(provider, normalizedAddress),
              )
              lastKnownAddressRef.current = normalizedAddress
              await setParaConnectionCookie(normalizedAddress)
              return
            }
          } catch (error) {
            console.warn(
              '[DirectMetaMask] Failed to confirm empty accounts state',
              error,
            )
          }

          await resetConnection()
        }, 400)
        return
      }

      if (emptyAccountsTimeoutRef.current !== null) {
        window.clearTimeout(emptyAccountsTimeoutRef.current)
        emptyAccountsTimeoutRef.current = null
      }

      const nextAddress = accounts[0]
      if (typeof nextAddress !== 'string') {
        return
      }

      const normalizedAddress = nextAddress as Address
      setAddress(normalizedAddress)
      setWalletClient(createClientForAddress(provider, normalizedAddress))
      lastKnownAddressRef.current = normalizedAddress
      void setParaConnectionCookie(normalizedAddress)
    }

    const handleDisconnect = () => {
      if (!lastKnownAddressRef.current) {
        void resetConnection()
      }
    }

    provider.on?.('accountsChanged', handleAccountsChanged)
    provider.on?.('disconnect', handleDisconnect)

    return () => {
      if (emptyAccountsTimeoutRef.current !== null) {
        window.clearTimeout(emptyAccountsTimeoutRef.current)
      }
      provider.removeListener?.('accountsChanged', handleAccountsChanged)
      provider.removeListener?.('disconnect', handleDisconnect)
    }
  }, [])

  const value = useMemo<DirectMetaMaskContextValue>(
    () => ({
      address,
      walletClient,
      isConnected: !!address && !!walletClient,
      isConnecting,
      isActive,
      connect,
      disconnect,
    }),
    [address, walletClient, isConnecting, isActive],
  )

  return (
    <DirectMetaMaskContext.Provider value={value}>
      {children}
    </DirectMetaMaskContext.Provider>
  )
}

export const useDirectMetaMask = (): DirectMetaMaskContextValue => {
  const context = useContext(DirectMetaMaskContext)

  if (!context) {
    throw new Error(
      'useDirectMetaMask must be used within a DirectMetaMaskProvider',
    )
  }

  return context
}
