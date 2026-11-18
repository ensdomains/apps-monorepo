import {
  type Address,
  getAddress,
  isAddress,
  numberToHex,
  ProviderRpcError,
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

export const toReadOnlyWalletAddress = (input: string): Address | null => {
  const value = input.trim()
  return isAddress(value, { strict: false }) ? getAddress(value) : null
}

type ResolveName = (name: string) => Promise<Address | null>

type ReadOnlyWalletResolution =
  | { readonly kind: 'address'; readonly address: Address }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'unresolved' }
  | { readonly kind: 'failed'; readonly cause: unknown }

const normalizeWalletName = (input: string): string | null => {
  const value = input.trim()
  if (value === '') return null

  try {
    return normalize(value)
  } catch {
    return null
  }
}

const resolveReadOnlyWalletInput = async (
  input: string,
  resolveName: ResolveName,
): Promise<ReadOnlyWalletResolution> => {
  const address = toReadOnlyWalletAddress(input)
  if (address) return { kind: 'address', address }

  const name = normalizeWalletName(input)
  if (name === null) return { kind: 'invalid' }

  try {
    const resolvedAddress = await resolveName(name)
    return resolvedAddress
      ? { kind: 'address', address: resolvedAddress }
      : { kind: 'unresolved' }
  } catch (cause) {
    return { kind: 'failed', cause }
  }
}

const READ_ONLY_WALLET_ERRORS = {
  invalid: 'Enter a valid Ethereum address or ENS name',
  unresolved: 'No Ethereum address found for this ENS name',
  failed: 'Could not look up this ENS name. Try again.',
}

export const promptForReadOnlyWallet = async ({
  resolveName,
  chainId,
  signal,
  onError,
}: {
  readonly resolveName: ResolveName
  readonly chainId: number
  readonly signal: AbortSignal
  readonly onError?: (message: string | null) => void
}): Promise<void> => {
  if (signal.aborted) return
  const input = window.prompt('Read-only wallet address or ENS name:')
  if (input === null) return

  const result = await resolveReadOnlyWalletInput(input, resolveName)
  if (signal.aborted) return

  if (result.kind === 'address') {
    onError?.(null)
    announceReadOnlyWallet({ address: result.address, chainId })
    return
  }

  if (result.kind === 'failed') {
    console.warn('Read-only wallet ENS lookup failed', result.cause)
  }
  onError?.(READ_ONLY_WALLET_ERRORS[result.kind])
}
