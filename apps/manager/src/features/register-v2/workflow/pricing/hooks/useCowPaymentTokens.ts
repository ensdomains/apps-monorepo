import { getDestinationContracts } from '@ens-apps/smart-account'
import { type CowSellToken, NATIVE_ETH } from '@ens-apps/transaction-manager'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import {
  type Address,
  erc20Abi,
  getAddress,
  isAddress,
  isAddressEqual,
} from 'viem'
import { chain } from '@/config'
import { publicClient } from '@/lib/wagmi'

const MAINNET_LIST = 'https://files.cow.fi/tokens/CowSwap.json'

type TokenListEntry = {
  chainId: number
  address: string
  symbol: string
  name?: string
  decimals: number
  logoURI?: string
}

type TokenList = { tokens?: TokenListEntry[] }

export type CowPaymentToken = CowSellToken &
  Readonly<{
    balance: bigint
    name?: string
    logoURI?: string
  }>

/** CoW's maintained Sepolia list, vendored because it is intentionally tiny. */
const SEPOLIA_TOKENS: readonly TokenListEntry[] = [
  {
    chainId: 11155111,
    address: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
  },
  {
    chainId: 11155111,
    address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    symbol: 'UNI',
    decimals: 18,
  },
  {
    chainId: 11155111,
    address: '0xd3f3d46FeBCD4CdAa2B83799b7A5CdcB69d135De',
    symbol: 'GNO',
    decimals: 18,
  },
  {
    chainId: 11155111,
    address: '0xB4F1737Af37711e9A5890D9510c9bB60e170CB0D',
    symbol: 'DAI',
    decimals: 18,
  },
  {
    chainId: 11155111,
    address: '0x0625aFB445C3B6B7B929342a04A22599fd5dBB59',
    symbol: 'COW',
    decimals: 18,
  },
  {
    chainId: 11155111,
    address: '0x58eb19ef91e8a6327fed391b51ae1887b833cc91',
    symbol: 'USDT',
    decimals: 6,
  },
]

/** Safe fallback when the remote mainnet list is temporarily unavailable. */
const MAINNET_FALLBACK: readonly TokenListEntry[] = [
  {
    chainId: 1,
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
  },
  {
    chainId: 1,
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
  },
  {
    chainId: 1,
    address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    symbol: 'DAI',
    name: 'Dai',
    decimals: 18,
  },
  {
    chainId: 1,
    address: '0xDef1CA1fb7FBcDC777520aa7f396b4E015F497aB',
    symbol: 'COW',
    name: 'CoW Protocol Token',
    decimals: 18,
  },
  {
    chainId: 1,
    address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    symbol: 'LINK',
    name: 'Chainlink',
    decimals: 18,
  },
]

const loadTokenList = async (): Promise<readonly TokenListEntry[]> => {
  if (Number(chain.id) !== 1) return SEPOLIA_TOKENS
  try {
    const response = await fetch(MAINNET_LIST)
    if (!response.ok) throw new Error(`Token list returned ${response.status}`)
    const body = (await response.json()) as TokenList
    const tokens = body.tokens?.filter((token) => token.chainId === chain.id)
    return tokens?.length ? tokens : MAINNET_FALLBACK
  } catch {
    return MAINNET_FALLBACK
  }
}

const normalizeToken = (token: TokenListEntry): CowSellToken | undefined => {
  if (
    !isAddress(token.address) ||
    !token.symbol ||
    !Number.isInteger(token.decimals) ||
    token.decimals < 0 ||
    token.decimals > 255
  ) {
    return undefined
  }
  return {
    address: getAddress(token.address),
    symbol: token.symbol,
    decimals: token.decimals,
    isNative: false,
  }
}

const preferred = new Map(
  ['ETH', 'USDT', 'DAI', 'WETH', 'COW', 'LINK'].map((symbol, index) => [
    symbol,
    index,
  ]),
)

const byPreferredSymbol = (a: CowPaymentToken, b: CowPaymentToken) =>
  (preferred.get(a.symbol) ?? 1_000) - (preferred.get(b.symbol) ?? 1_000) ||
  a.symbol.localeCompare(b.symbol)

const getCowPaymentTokens = async (
  owner: Address,
): Promise<readonly CowPaymentToken[]> => {
  const [nativeBalance, entries] = await Promise.all([
    publicClient.getBalance({ address: owner }),
    loadTokenList(),
  ])
  const destinationUsdc = getDestinationContracts(chain.id).usdc
  const normalized = entries
    .map((entry) => ({ entry, token: normalizeToken(entry) }))
    .filter(
      (value): value is { entry: TokenListEntry; token: CowSellToken } =>
        !!value.token && !isAddressEqual(value.token.address, destinationUsdc),
    )

  const balances = await publicClient.multicall({
    allowFailure: true,
    contracts: normalized.map(({ token }) => ({
      address: token.address,
      abi: erc20Abi,
      functionName: 'balanceOf' as const,
      args: [owner] as const,
    })),
  })

  const tokens: CowPaymentToken[] = [
    { ...NATIVE_ETH, name: 'Ether', balance: nativeBalance },
  ]
  balances.forEach((result, index) => {
    if (result.status !== 'success' || result.result === 0n) return
    const item = normalized[index]
    if (!item) return
    const { entry, token } = item
    tokens.push({
      ...token,
      balance: result.result,
      ...(entry.name ? { name: entry.name } : {}),
      ...(entry.logoURI ? { logoURI: entry.logoURI } : {}),
    })
  })
  return tokens.sort(byPreferredSymbol)
}

/** Wallet-held tokens from CoW's reviewed list, plus native ETH. */
export const useCowPaymentTokens = (owner: Address | null) =>
  useQuery({
    queryKey: $qk({
      $scope: 'registration',
      $action: 'cow-payment-tokens',
      chainId: chain.id,
      owner: owner ?? undefined,
    }),
    queryFn: () => getCowPaymentTokens(owner as Address),
    enabled: !!owner,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
