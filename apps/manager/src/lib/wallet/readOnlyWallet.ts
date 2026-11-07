import { type Address, getAddress, isAddress, numberToHex } from 'viem'
import { createConnector } from 'wagmi'

/**
 * A hidden, read-only wallet for testing the app as any address.
 *
 * It is registered in the wagmi config so `C U S T O M` can connect it, but it
 * never appears in the wallet list. It only reports the chosen address and
 * chain; anything else is rejected, so it can never sign or send.
 */

export const READ_ONLY_WALLET_CONNECTOR_ID = 'readOnlyCustomWallet'

let readOnlyAddress: Address | null = null

export const parseReadOnlyWalletAddress = (input: string): Address | null => {
  const address = input.trim()
  return isAddress(address) ? getAddress(address) : null
}

export const setReadOnlyWalletAddress = (address: Address | null) => {
  readOnlyAddress = address
}

export const isReadOnlyWalletConnector = (
  connector: { readonly id: string } | null | undefined,
): boolean => connector?.id === READ_ONLY_WALLET_CONNECTOR_ID

export const createReadOnlyProvider = ({
  getAddress,
  getChainId,
}: {
  readonly getAddress: () => Address | null
  readonly getChainId: () => number
}) => ({
  async request({ method }: { readonly method: string }) {
    if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
      const address = getAddress()
      return address ? [address] : []
    }
    if (method === 'eth_chainId') return numberToHex(getChainId())
    throw Object.assign(
      new Error(`Read-only custom wallet cannot call ${method}`),
      { code: 4100 },
    )
  },
})

export const readOnlyWalletConnector = createConnector((config) => {
  let chainId = config.chains[0].id
  const provider = createReadOnlyProvider({
    getAddress: () => readOnlyAddress,
    getChainId: () => chainId,
  })

  return {
    id: READ_ONLY_WALLET_CONNECTOR_ID,
    name: 'Read-only custom wallet',
    type: 'custom',
    async connect<withCapabilities extends boolean = false>({
      chainId: nextChainId,
      withCapabilities,
    }: {
      chainId?: number
      withCapabilities?: withCapabilities | boolean
    } = {}) {
      if (!readOnlyAddress) {
        throw new Error('Read-only custom wallet has no address')
      }
      if (nextChainId) chainId = nextChainId
      return {
        // wagmi's connect action unwraps these objects again when needed.
        accounts: (withCapabilities
          ? [{ address: readOnlyAddress, capabilities: {} }]
          : [readOnlyAddress]) as never,
        chainId,
      }
    },
    async disconnect() {
      return
    },
    async getAccounts() {
      return readOnlyAddress ? [readOnlyAddress] : []
    },
    async getChainId() {
      return chainId
    },
    async isAuthorized() {
      return readOnlyAddress !== null
    },
    async getProvider() {
      return provider
    },
    onAccountsChanged: () => undefined,
    onChainChanged: () => undefined,
    onDisconnect: () => undefined,
  }
})
