import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { WalletClient, PublicClient } from 'viem'
import type { RhinestoneConfig } from '../types/transaction.types'
import { initializeRhinestoneAccount } from '../helpers/rhinestone-account.helpers'

interface AccountContextValue {
  // Wallet connection (from Wagmi)
  address?: string
  isConnected: boolean
  walletClient?: WalletClient
  publicClient?: PublicClient

  // Rhinestone smart account
  rhinestoneAccount?: any
  isInitializingAccount: boolean
  accountError?: Error

  // Methods
  initializeRhinestone: (walletClient: WalletClient, config: RhinestoneConfig) => Promise<void>
  clearAccount: () => void
}

const AccountContext = createContext<AccountContextValue | null>(null)

interface AccountProviderProps {
  children: ReactNode
  walletClient?: WalletClient
  publicClient?: PublicClient
  address?: string
  isConnected: boolean
}

/**
 * Account Provider
 *
 * Manages wallet connection state and Rhinestone smart account initialization.
 * This is a simple React Context (not a state machine) that wraps Wagmi state.
 */
export function AccountProvider({
  children,
  walletClient,
  publicClient,
  address,
  isConnected
}: AccountProviderProps) {
  const [rhinestoneAccount, setRhinestoneAccount] = useState<any>(undefined)
  const [isInitializingAccount, setIsInitializingAccount] = useState(false)
  const [accountError, setAccountError] = useState<Error | undefined>(undefined)

  // Clear account when wallet disconnects
  useEffect(() => {
    if (!isConnected) {
      setRhinestoneAccount(undefined)
      setAccountError(undefined)
    }
  }, [isConnected])

  const initializeRhinestone = async (walletClient: WalletClient, config: RhinestoneConfig) => {
    if (rhinestoneAccount) {
      console.log('🔐 [ACCOUNT] Rhinestone account already initialized')
      return
    }

    setIsInitializingAccount(true)
    setAccountError(undefined)

    console.log('🔐 [ACCOUNT] Initializing Rhinestone account...')

    const result = await initializeRhinestoneAccount(walletClient, config)

    if (result.isErr()) {
      console.error('❌ [ACCOUNT] Failed to initialize Rhinestone account:', result.error)
      setAccountError(result.error)
      setIsInitializingAccount(false)
      return
    }

    console.log('✅ [ACCOUNT] Rhinestone account initialized:', {
      address: result.value?.getAddress?.()
    })

    setRhinestoneAccount(result.value)
    setIsInitializingAccount(false)
  }

  const clearAccount = () => {
    console.log('🧹 [ACCOUNT] Clearing Rhinestone account')
    setRhinestoneAccount(undefined)
    setAccountError(undefined)
  }

  const contextValue: AccountContextValue = {
    address,
    isConnected,
    walletClient,
    publicClient,
    rhinestoneAccount,
    isInitializingAccount,
    accountError,
    initializeRhinestone,
    clearAccount,
  }

  return (
    <AccountContext.Provider value={contextValue}>
      {children}
    </AccountContext.Provider>
  )
}

/**
 * Hook to access account context
 */
export function useAccount(): AccountContextValue {
  const context = useContext(AccountContext)
  if (!context) {
    throw new Error('useAccount must be used within AccountProvider')
  }
  return context
}
