import {
  useWeb3Auth,
  useWeb3AuthConnect,
  useWeb3AuthDisconnect,
  useWeb3AuthUser,
} from '@web3auth/modal/react'
import { Copy, Unlink, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useAccountAbstraction } from '@/lib/web3Auth/useAccountAbstraction'
import { web3AuthService } from '@/lib/web3Auth/web3AuthService'
import { Balance } from './Balance'
import { SwitchChain } from './SwitchChain'

export const Web3AuthConnect = () => {
  const [address, setAddress] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [chainId, setChainId] = useState<string>('')
  const {
    connect,
    isConnected,
    loading: connectLoading,
    error: connectError,
  } = useWeb3AuthConnect()

  const {
    disconnect,
    loading: disconnectLoading,
    error: disconnectError,
  } = useWeb3AuthDisconnect()
  const { userInfo } = useWeb3AuthUser()
  const web3Auth = useWeb3Auth()

  const { smartAccountInfo, isUsingAA } = useAccountAbstraction()

  useEffect(() => {
    if (web3Auth?.web3Auth) {
      web3AuthService.setWeb3AuthModal(web3Auth.web3Auth)
    }
  }, [web3Auth])

  useEffect(() => {
    if (isConnected) {
      web3AuthService.updateProvider()
    }
  }, [isConnected])

  // Fetch address and chain ID when connected
  useEffect(() => {
    const fetchData = async () => {
      if (isConnected && web3AuthService.isReady) {
        try {
          const address = await web3AuthService.getAddress()
          setAddress(address)

          const chainId = await web3AuthService.getChainId()
          setChainId(chainId)
        } catch (error) {
          console.error('Failed to get data:', error)
        }
      } else {
        setAddress(null)
        setChainId('')
      }
    }
    fetchData()
  }, [isConnected]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const checkChainId = async () => {
      if (isConnected && web3AuthService.isReady) {
        try {
          const currentChainId = await web3AuthService.getChainId()
          if (currentChainId !== chainId) {
            setChainId(currentChainId)
          }
        } catch (error) {
          console.error('Failed to check chain ID:', error)
        }
      }
    }

    // Check chain ID periodically
    const interval = setInterval(checkChainId, 1000)
    return () => clearInterval(interval)
  }, [isConnected, chainId])

  const handleCopyAddress = async (addressToCopy: string) => {
    try {
      await navigator.clipboard.writeText(addressToCopy)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy address:', error)
    }
  }

  const getDisplayName = () => {
    if (userInfo?.email) {
      return userInfo.email
    }
    if (address) {
      return `${address.slice(0, 6)}...${address.slice(-4)}`
    }
    return 'Connected'
  }

  const getWalletType = () => {
    if (userInfo?.email) {
      return 'Email'
    }
    if (userInfo && 'typeOfLogin' in userInfo && userInfo.typeOfLogin) {
      const loginType = userInfo.typeOfLogin as string
      return loginType.charAt(0).toUpperCase() + loginType.slice(1)
    }
    return 'Wallet'
  }

  if (connectLoading || disconnectLoading) {
    return <Button disabled>Loading...</Button>
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md p-2 hover:bg-accent hover:text-accent-foreground"
            >
              <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                <User className="size-4 text-muted-foreground" />
              </div>
              <span className="font-medium text-sm">{getDisplayName()}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <div className="p-3">
              <div className="mb-3">
                <div className="font-medium text-sm">
                  {userInfo?.name ||
                    userInfo?.email ||
                    (address
                      ? `${address.slice(0, 6)}...${address.slice(-4)}`
                      : 'User')}
                </div>

                <div className="text-muted-foreground text-xs">
                  Connected via {getWalletType()}
                </div>
              </div>

              {address && (
                <div className="mb-3">
                  <div className="mb-1 font-medium text-muted-foreground text-xs">
                    Network
                  </div>
                  <SwitchChain />
                </div>
              )}

              {/* Smart Account Information */}
              {isUsingAA && smartAccountInfo && (
                <div className="mb-3">
                  <div className="mb-1 font-medium text-muted-foreground text-xs">
                    Smart Account Address
                  </div>
                  <div className="flex items-center gap-2 rounded bg-muted p-2 text-xs">
                    <span className="font-mono text-muted-foreground">
                      {`${smartAccountInfo.address.slice(0, 6)}...${smartAccountInfo.address.slice(-4)}`}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-background"
                      onClick={() =>
                        handleCopyAddress(smartAccountInfo.address)
                      }
                    >
                      <Copy className="size-3" />
                    </Button>
                  </div>
                  {copied && (
                    <div className="mt-1 text-green-600 text-xs dark:text-green-400">
                      Copied!
                    </div>
                  )}
                </div>
              )}

              <div className="mb-3">
                <Balance key={chainId} />
              </div>
            </div>

            <DropdownMenuSeparator />

            {/* Disconnect */}
            <DropdownMenuItem onClick={() => disconnect()}>
              <Unlink className="mr-2 size-4" />
              Disconnect
            </DropdownMenuItem>

            {/* Error Display */}
            {disconnectError && (
              <div className="p-3">
                <div className="text-destructive text-xs">
                  {disconnectError.message}
                </div>
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-2')}>
      <Button onClick={() => connect()}>Connect Wallet</Button>

      {/* Error Display */}
      {connectError && (
        <div className={cn('text-destructive text-xs')}>
          {connectError.message}
        </div>
      )}
    </div>
  )
}
