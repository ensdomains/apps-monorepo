import type Para from '@getpara/web-sdk'
import { Environment } from '@getpara/web-sdk'
import type { Address, EIP1193Provider } from 'viem'
import { mainnet } from 'viem/chains'
import { type CreateConnectorFn, createConnector } from 'wagmi'
import { viemNamechainChain } from '@/lib/chains'
import { getParaInstance } from '../../Para/paraService'

interface ParaConnectorOptions {
  apiKey: string
  environment?: Environment
  chains: readonly [
    typeof viemNamechainChain,
    ...(typeof viemNamechainChain)[],
    typeof mainnet,
  ]
}

interface ParaRequestParams {
  method: string
  params?: unknown[]
}

interface ParaWallet {
  type: string
  address: string
}

interface ParaWallets {
  [key: string]: ParaWallet
}

interface ParaSDK {
  ready(): Promise<void>
  isFullyLoggedIn(): Promise<boolean>
  getWallets(): ParaWallets
  logout(): void
  request(params: ParaRequestParams): Promise<unknown>
  on?(event: string, listener: (...args: unknown[]) => void): void
  removeListener?(event: string, listener: (...args: unknown[]) => void): void
}

class ParaProvider {
  private para: ParaSDK

  constructor(para: Para) {
    this.para = para as unknown as ParaSDK
  }

  async request({
    method,
    params,
  }: {
    method: string
    params?: unknown[]
  }): Promise<unknown> {
    console.log(`ParaProvider.request: ${method}`, params)

    try {
      switch (method) {
        case 'eth_accounts':
          return await this.getAccounts()

        case 'eth_requestAccounts':
          return await this.requestAccounts()

        case 'eth_chainId':
          return await this.getChainId()

        case 'personal_sign':
          return await this.personalSign(params ?? [])

        case 'eth_sendTransaction':
          return await this.sendTransaction(params ?? [])

        case 'wallet_switchEthereumChain':
          return await this.switchChain(params ?? [])

        default:
          return await this.para.request({ method, params })
      }
    } catch (error) {
      console.error(`Error in ParaProvider.request(${method}):`, error)
      throw error
    }
  }

  private async getAccounts(): Promise<string[]> {
    try {
      const isLoggedIn = await this.para.isFullyLoggedIn()
      if (!isLoggedIn) {
        return []
      }

      const wallets = this.para.getWallets()
      const evmWallets = Object.values(wallets).filter(
        (wallet: ParaWallet) => wallet.type === 'EVM',
      )

      return evmWallets.map((wallet: ParaWallet) => wallet.address)
    } catch (error) {
      console.error('Error getting accounts:', error)
      return []
    }
  }

  private async requestAccounts(): Promise<string[]> {
    const accounts = await this.getAccounts()
    if (accounts.length === 0) {
      throw new Error(
        'No accounts available. Please authenticate with Para first.',
      )
    }
    return accounts
  }

  private async getChainId(): Promise<string> {
    try {
      const chainId = await this.para.request({
        method: 'eth_chainId',
      })
      return chainId as string
    } catch (error) {
      console.error('Error getting chainId from Para:', error)
      return '0x1'
    }
  }

  private async personalSign(params: unknown[]): Promise<string> {
    if (!params || params.length < 2) {
      throw new Error('personal_sign requires message and account parameters')
    }

    return (await this.para.request({
      method: 'personal_sign',
      params,
    })) as string
  }

  private async sendTransaction(params: unknown[]): Promise<string> {
    if (!params || params.length === 0) {
      throw new Error('eth_sendTransaction requires transaction parameters')
    }

    return (await this.para.request({
      method: 'eth_sendTransaction',
      params,
    })) as string
  }

  private async switchChain(params: unknown[]): Promise<void> {
    if (!params || params.length === 0) {
      throw new Error('wallet_switchEthereumChain requires chainId parameter')
    }

    try {
      await this.para.request({
        method: 'wallet_switchEthereumChain',
        params,
      })
    } catch (error) {
      console.error('Error switching chain:', error)
    }
  }

  on(event: string, listener: (...args: unknown[]) => void): void {
    console.log(`Event listener added for: ${event}`)
    if (typeof this.para.on === 'function') {
      this.para.on(event, listener)
    }
  }

  removeListener(event: string, listener: (...args: unknown[]) => void): void {
    console.log(`Event listener removed for: ${event}`)
    if (typeof this.para.removeListener === 'function') {
      this.para.removeListener(event, listener)
    }
  }

  off(event: string, listener: (...args: unknown[]) => void): void {
    this.removeListener(event, listener)
  }
}

export function paraConnectorCore(
  options: ParaConnectorOptions,
): CreateConnectorFn {
  let para: ParaSDK | null = null
  let provider: ParaProvider | null = null

  return createConnector((config) => ({
    id: 'para',
    name: 'Para Wallet',
    type: 'para' as const,

    async setup(): Promise<void> {
      console.log('ParaConnector: Setting up...')

      if (!para) {
        const paraInstance = getParaInstance()
        para = paraInstance as unknown as ParaSDK

        try {
          await para.ready()
          provider = new ParaProvider(paraInstance)
          console.log('ParaConnector: Setup complete')
        } catch (error) {
          console.error('ParaConnector: Failed to initialize Para:', error)
          throw error
        }
      }
    },

    async connect({ chainId } = {}): Promise<{
      accounts: Address[]
      chainId: number
    }> {
      console.log('ParaConnector: Connecting...', { chainId })

      const provider = await this.getProvider()

      try {
        const accounts = (await provider.request({
          method: 'eth_requestAccounts',
        })) as string[]

        console.log('ParaConnector: Got accounts:', accounts)

        if (accounts.length === 0) {
          throw new Error('No accounts available')
        }

        const currentChainId = chainId || options.chains[0].id

        const result = {
          accounts: accounts as Address[],
          chainId: currentChainId,
        }

        console.log('ParaConnector: Connected successfully:', result)
        return result
      } catch (error) {
        console.error('ParaConnector: Failed to connect:', error)
        throw error
      }
    },

    async disconnect() {
      console.log('ParaConnector: Disconnecting...')

      if (para) {
        para.logout()
      }

      config.emitter.emit('disconnect')
    },

    async getAccounts() {
      if (!provider) {
        console.log('ParaConnector: No provider for getAccounts')
        return []
      }

      try {
        const accounts = (await provider.request({
          method: 'eth_accounts',
        })) as string[]

        console.log('ParaConnector: getAccounts result:', accounts)
        return accounts as Address[]
      } catch (error) {
        console.error('ParaConnector: Failed to get accounts:', error)
        return []
      }
    },

    async getChainId() {
      if (!provider) {
        console.log('ParaConnector: No provider for getChainId, using default')
        return options.chains[0].id
      }

      try {
        const chainId = (await provider.request({
          method: 'eth_chainId',
        })) as string

        const numericChainId = Number(chainId)
        console.log('ParaConnector: getChainId result:', numericChainId)
        return numericChainId
      } catch (error) {
        console.error('ParaConnector: Failed to get chain ID:', error)
        return options.chains[0].id
      }
    },

    async getProvider() {
      if (!provider) {
        console.log('ParaConnector: Provider not ready, setting up...')
        await this.setup()
      }
      return provider as unknown as EIP1193Provider
    },

    async isAuthorized() {
      if (!para) {
        console.log('ParaConnector: Para not initialized for isAuthorized')
        return false
      }

      try {
        const authorized = await para.isFullyLoggedIn()
        console.log('ParaConnector: isAuthorized result:', authorized)
        return authorized
      } catch (error) {
        console.error('ParaConnector: Error checking authorization:', error)
        return false
      }
    },

    async switchChain({ chainId }) {
      console.log('ParaConnector: Switching chain to:', chainId)

      const provider = await this.getProvider()

      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${chainId.toString(16)}` }],
        })

        const targetChain = options.chains.find((chain) => chain.id === chainId)
        const resultChain = targetChain || options.chains[0]

        console.log(
          'ParaConnector: Chain switched successfully to:',
          resultChain.name,
        )

        config.emitter.emit('change', { chainId })

        return resultChain
      } catch (error) {
        console.error('ParaConnector: Failed to switch chain:', error)
        throw error
      }
    },

    onAccountsChanged(accounts) {
      console.log('ParaConnector: Accounts changed:', accounts)

      if (accounts.length === 0) {
        config.emitter.emit('disconnect')
      } else {
        config.emitter.emit('change', {
          accounts: accounts as Address[],
        })
      }
    },

    onChainChanged(chainId) {
      console.log('ParaConnector: Chain changed:', chainId)

      const id = Number(chainId)
      config.emitter.emit('change', { chainId: id })
    },

    onDisconnect(error) {
      console.log('ParaConnector: Disconnected:', error)
      config.emitter.emit('disconnect')
    },
  }))
}

export default paraConnectorCore

export const paraConnector = paraConnectorCore({
  apiKey: import.meta.env.VITE_PARA_API_KEY || '',
  environment: Environment.BETA,
  chains: [viemNamechainChain, mainnet],
})
