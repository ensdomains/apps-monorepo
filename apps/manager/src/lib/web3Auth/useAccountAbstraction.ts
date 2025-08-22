import { useCallback, useEffect, useState } from 'react'
import { aaService, type StablecoinBalance } from './accountAbstractionService'
import { web3AuthService } from './web3AuthService'

export interface SmartAccountInfo {
  address: `0x${string}`
  isDeployed: boolean
  isConnected: boolean
  balance: string
  stablecoinBalances: StablecoinBalance[]
}

export function useAccountAbstraction() {
  const [aaInfrastructureReady, setAAInfrastructureReady] = useState(false)
  const [smartAccountInfo, setSmartAccountInfo] =
    useState<SmartAccountInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const checkInfrastructure = useCallback(async () => {
    if (web3AuthService.isReady) {
      setIsLoading(true)
      try {
        const ready = await aaService.checkInfrastructure()
        setAAInfrastructureReady(ready)
      } finally {
        setIsLoading(false)
      }
    }
  }, [])

  const getSmartAccountInfo = useCallback(async () => {
    if (aaInfrastructureReady && web3AuthService.isConnected) {
      setIsLoading(true)
      try {
        const smartAccount = await aaService.createSmartAccount(web3AuthService)
        const info = await aaService.getSmartAccountInfo(smartAccount.address)
        console.log('info', info)
        console.log('smartAccount', smartAccount)

        setSmartAccountInfo({
          address: info.address as `0x${string}`,
          isDeployed: info.isDeployed,
          isConnected: web3AuthService.isConnected,
          balance: (Number(info.balance) / 1e18).toFixed(4),
          stablecoinBalances: info.stablecoinBalances,
        })
      } catch {
        setSmartAccountInfo(null)
      } finally {
        setIsLoading(false)
      }
    } else {
      setSmartAccountInfo(null)
    }
  }, [aaInfrastructureReady])

  // Check AA infrastructure when Web3Auth is ready
  useEffect(() => {
    checkInfrastructure()
  }, [checkInfrastructure])

  // Get smart account info when infrastructure is ready and connected
  useEffect(() => {
    getSmartAccountInfo()
  }, [getSmartAccountInfo])

  const refreshSmartAccountInfo = useCallback(async () => {
    await getSmartAccountInfo()
  }, [getSmartAccountInfo])

  return {
    aaInfrastructureReady,
    smartAccountInfo,
    isLoading,
    isUsingAA: aaInfrastructureReady && !!smartAccountInfo,
    refreshSmartAccountInfo,
    isReady: !isLoading && !!smartAccountInfo,
  }
}

// New hook that ensures data is ready
export function useAccountAbstractionWhenReady() {
  const { smartAccountInfo, isLoading, isReady, ...rest } =
    useAccountAbstraction()

  return {
    smartAccountInfo: isReady ? smartAccountInfo : null,
    isLoading,
    isReady,
    ...rest,
  }
}
