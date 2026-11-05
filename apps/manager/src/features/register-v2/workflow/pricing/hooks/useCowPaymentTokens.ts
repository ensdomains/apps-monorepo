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

// These are CoW Swap's enabled-by-default lists for the networks Graze supports.
// Keep the order: the reviewed CoW list wins when another list repeats a token.
const TOKEN_LISTS_BY_CHAIN: Readonly<Record<number, readonly string[]>> = {
  1: [
    'https://files.cow.fi/tokens/CowSwap.json',
    'https://files.cow.fi/token-lists/CoinGecko.1.json',
  ],
  11155111: ['https://files.cow.fi/token-lists/CowSwapSepolia.json'],
}

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

/** Safe fallback for CoW's maintained Sepolia list. */
const SEPOLIA_FALLBACK: readonly TokenListEntry[] = [
  {
    chainId: 11155111,
    address: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    logoURI:
      'https://files.cow.fi/token-lists/images/1/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2/logo.png',
  },
  {
    chainId: 11155111,
    address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    symbol: 'UNI',
    name: 'Uniswap',
    decimals: 18,
    logoURI:
      'https://files.cow.fi/token-lists/images/1/0x1f9840a85d5af5bf1d1762f925bdaddc4201f984/logo.png',
  },
  {
    chainId: 11155111,
    address: '0xbe72E441BF55620febc26715db68d3494213D8Cb',
    symbol: 'USDC',
    name: 'USDC (test)',
    decimals: 6,
    logoURI:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
  },
  {
    chainId: 11155111,
    address: '0xd3f3d46FeBCD4CdAa2B83799b7A5CdcB69d135De',
    symbol: 'GNO',
    name: 'GNO (test)',
    decimals: 18,
    logoURI:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6810e776880C02933D47DB1b9fc05908e5386b96/logo.png',
  },
  {
    chainId: 11155111,
    address: '0xB4F1737Af37711e9A5890D9510c9bB60e170CB0D',
    symbol: 'DAI',
    name: 'DAI (test)',
    decimals: 18,
    logoURI:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png',
  },
  {
    chainId: 11155111,
    address: '0x0625aFB445C3B6B7B929342a04A22599fd5dBB59',
    symbol: 'COW',
    name: 'CoW Protocol Token',
    decimals: 18,
    logoURI:
      'https://files.cow.fi/token-lists/images/11155111/0x0625afb445c3b6b7b929342a04a22599fd5dbb59/logo.png',
  },
  {
    chainId: 11155111,
    address: '0x58eb19ef91e8a6327fed391b51ae1887b833cc91',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logoURI:
      'https://files.cow.fi/token-lists/images/11155111/0x58eb19ef91e8a6327fed391b51ae1887b833cc91/logo.png',
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
    logoURI:
      'https://files.cow.fi/token-lists/images/1/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2/logo.png',
  },
  {
    chainId: 1,
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logoURI:
      'https://files.cow.fi/token-lists/images/1/0xdac17f958d2ee523a2206206994597c13d831ec7/logo.png',
  },
  {
    chainId: 1,
    address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    symbol: 'DAI',
    name: 'Dai',
    decimals: 18,
    logoURI:
      'https://files.cow.fi/token-lists/images/1/0x6b175474e89094c44da98b954eedeac495271d0f/logo.png',
  },
  {
    chainId: 1,
    address: '0xC18360217D8F7AB5E7C516566761eA12Ce7F9D72',
    symbol: 'ENS',
    name: 'Ethereum Name Service',
    decimals: 18,
    logoURI:
      'https://assets.coingecko.com/coins/images/19785/large/ENS.jpg?1727872989',
  },
  {
    chainId: 1,
    address: '0xDef1CA1fb7FBcDC777520aa7f396b4E015F497aB',
    symbol: 'COW',
    name: 'CoW Protocol Token',
    decimals: 18,
    logoURI:
      'https://files.cow.fi/token-lists/images/1/0xdef1ca1fb7fbcd777520aa7f396b4e015f497ab/logo.png',
  },
  {
    chainId: 1,
    address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    symbol: 'LINK',
    name: 'Chainlink',
    decimals: 18,
    logoURI:
      'https://files.cow.fi/token-lists/images/1/0x514910771af9ca656af840dff83e8264ecf986ca/logo.png',
  },
]

const loadTokenList = async (): Promise<readonly TokenListEntry[]> => {
  const sources = TOKEN_LISTS_BY_CHAIN[Number(chain.id)] ?? []
  const responses = await Promise.allSettled(
    sources.map(async (source) => {
      const response = await fetch(source)
      if (!response.ok)
        throw new Error(`Token list returned ${response.status}`)
      return (await response.json()) as TokenList
    }),
  )
  const merged = new Map<string, TokenListEntry>()
  for (const response of responses) {
    if (response.status !== 'fulfilled') continue
    for (const token of response.value.tokens ?? []) {
      if (token.chainId !== chain.id) continue
      const key = token.address.toLocaleLowerCase()
      if (!merged.has(key)) merged.set(key, token)
    }
  }
  if (merged.size > 0) return [...merged.values()]
  return Number(chain.id) === 1 ? MAINNET_FALLBACK : SEPOLIA_FALLBACK
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
  ['USDC', 'DAI', 'WETH', 'ENS', 'ETH', 'USDT', 'COW', 'LINK'].map(
    (symbol, index) => [symbol, index],
  ),
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

  const tokens: CowPaymentToken[] = []
  if (nativeBalance > 0n)
    tokens.push({ ...NATIVE_ETH, name: 'Ether', balance: nativeBalance })
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

/** Positive wallet balances discovered from CoW Swap's default token lists. */
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
