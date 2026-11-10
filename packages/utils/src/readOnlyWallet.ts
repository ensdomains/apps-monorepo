import {
  type Address,
  getAddress,
  isAddress,
  numberToHex,
  ProviderRpcError,
  type PublicClient,
} from 'viem'
import { normalize } from 'viem/ens'

/**
 * Hands a fake, read-only EIP-6963 wallet to wagmi's normal injected-wallet
 * discovery. The provider only reports the chosen address and chain; every
 * other request fails, so it can never sign or send.
 */

export const READ_ONLY_WALLET_RDNS = 'io.ens.read-only-wallet'

const ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='6' fill='%23111827'/%3E%3Cpath d='M8 11V9a4 4 0 0 1 8 0v2' fill='none' stroke='white' stroke-width='2'/%3E%3Crect x='6' y='11' width='12' height='9' rx='2' fill='none' stroke='white' stroke-width='2'/%3E%3C/svg%3E"

export type ReadOnlyProvider = {
  request(args: {
    readonly method: string
    readonly params?: unknown
  }): Promise<unknown>
  on(): void
  removeListener(): void
}

const reject = (method: string) => {
  const message = `Read-only custom wallet cannot call ${method}`
  return new ProviderRpcError(new Error(message), {
    code: 4100,
    shortMessage: message,
  })
}

export const createReadOnlyProvider = ({
  address,
  chainId,
}: {
  readonly address: Address
  readonly chainId: number
}): ReadOnlyProvider => {
  return {
    async request({ method }) {
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
        return [address]
      }
      if (method === 'eth_chainId') return numberToHex(chainId)
      if (method === 'wallet_requestPermissions') {
        return [
          {
            parentCapability: 'eth_accounts',
            caveats: [{ type: 'restrictReturnedAccounts', value: [address] }],
          },
        ]
      }
      if (method === 'wallet_revokePermissions') return null
      throw reject(method)
    },
    // The address and chain never change for this provider, so no events fire.
    on: () => undefined,
    removeListener: () => undefined,
  }
}

const announced = new Set<string>()

export const announceReadOnlyWallet = ({
  address,
  chainId,
}: {
  readonly address: Address
  readonly chainId: number
}) => {
  const id = `${chainId}:${address.toLowerCase()}`
  if (announced.has(id)) return
  announced.add(id)

  const detail = Object.freeze({
    info: Object.freeze({
      uuid: id,
      name: `Read-only ${address.slice(0, 6)}…${address.slice(-4)}`,
      icon: ICON,
      rdns: `${READ_ONLY_WALLET_RDNS}.${chainId}.${address.slice(2).toLowerCase()}`,
    }),
    provider: createReadOnlyProvider({ address, chainId }),
  })

  const announce = () =>
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', { detail }),
    )
  announce()
  window.addEventListener('eip6963:requestProvider', announce)
}

export const isReadOnlyWalletConnector = (
  connector: { readonly id: string } | null | undefined,
): boolean => connector?.id.startsWith(READ_ONLY_WALLET_RDNS) ?? false

export const resolveReadOnlyAddress = async (
  input: string,
  client: Pick<PublicClient, 'getEnsAddress'> | undefined,
): Promise<Address | null> => {
  const value = input.trim()
  if (isAddress(value)) return getAddress(value)
  if (!value || !client) return null

  try {
    return await client.getEnsAddress({ name: normalize(value) })
  } catch {
    return null
  }
}
