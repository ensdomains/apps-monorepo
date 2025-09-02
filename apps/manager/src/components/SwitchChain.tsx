import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { type ChainConfig, chains } from '@/lib/chains'
import { web3AuthService } from '@/lib/web3Auth/web3AuthService'

export function SwitchChain() {
  const [currentChainId, setCurrentChainId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [currentChain, setCurrentChain] = useState<ChainConfig | undefined>()

  useEffect(() => {
    const loadChainId = async () => {
      try {
        if (web3AuthService.isConnected) {
          const chainId = await web3AuthService.getChainId()
          setCurrentChainId(chainId)

          // Find the current chain config
          const chain = Object.values(chains).find(
            (chain) => chain.chainId === chainId,
          )
          setCurrentChain(chain)
        }
      } catch (error) {
        console.error('Error loading chain ID:', error)
      }
    }

    loadChainId()
  }, [])

  const handleSwitchChain = async (targetChain: ChainConfig) => {
    try {
      setIsLoading(true)
      await web3AuthService.switchChain(targetChain)

      // Update the current chain state after switching
      const newChainId = await web3AuthService.getChainId()
      setCurrentChainId(newChainId)
      setCurrentChain(targetChain)
    } catch (error) {
      console.error('Error switching chain:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (!web3AuthService.isConnected) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={isLoading}
        >
          <div className="h-2 w-2 rounded-full bg-green-500" />
          {currentChain?.displayName || 'Unknown'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {Object.values(chains).map((chain) => (
          <DropdownMenuItem
            key={chain.chainId}
            onClick={() => handleSwitchChain(chain)}
            className="flex items-center gap-2"
          >
            <div
              className={`h-2 w-2 rounded-full ${
                currentChainId === chain.chainId
                  ? 'bg-green-500'
                  : 'bg-gray-300'
              }`}
            />
            {chain.displayName}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
