import { TIME_TRAVEL_RPC } from '@ens-apps/dev-time-travel'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  erc20Abi,
  http,
  parseAbi,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { readContract } from 'viem/actions'
import { sepolia } from 'viem/chains'
import { useConnection, useReadContracts } from 'wagmi'
import { PAYMENT_TOKENS } from '@/features/register/constants/paymentTokens'
import { useFundWallet } from './useFundWallet'

const LOW_BALANCE_THRESHOLD = 500n

// Well-known Anvil test key — used only when VITE_TIME_TRAVEL=1 (local dev).
// This is the standard Anvil #0 private key, publicly documented in the Anvil
// docs and in e2e/infra/scripts/fund-account.sh; it is not a secret.
const ANVIL_FUNDER_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

const ERC20_MINT_ABI = parseAbi(['function mint(address to, uint256 amount)'])
const USDC_MINT_AMOUNT = 10_000_000_000n // 10_000 USDC (6 decimals)
const DAI_MINT_AMOUNT = 10_000_000_000_000_000_000_000n // 10_000 DAI (18 decimals)

/**
 * Clears contract bytecode at `address` on the local Anvil fork, then mints
 * USDC and DAI to it.
 *
 * Why setCode: Anvil-derived addresses can coincide with Sepolia contracts
 * (e.g. the well-known 0xf39F…2266 has an EOF contract). When the ENS
 * registrar calls `_safeMint`, the ERC1155 receiver check fires against the
 * owner address and reverts if the owner has bytecode that isn't an ERC1155
 * receiver. Wiping the code makes the address a plain EOA on the fork.
 */
async function anvilFundAccount(address: `0x${string}`) {
  const transport = http(TIME_TRAVEL_RPC)

  const testClient = createTestClient({
    chain: sepolia,
    mode: 'anvil',
    transport,
  })
  const publicClient = createPublicClient({ chain: sepolia, transport })
  const anvilFunder = privateKeyToAccount(ANVIL_FUNDER_KEY)
  const walletClient = createWalletClient({
    account: anvilFunder,
    chain: sepolia,
    transport,
  })

  // Wipe any contract bytecode so the address behaves as a plain EOA.
  await testClient.setCode({ address, bytecode: '0x' })

  const [usdcBal, daiBal] = await Promise.all([
    readContract(publicClient, {
      address: PAYMENT_TOKENS[0].address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address],
    }),
    readContract(publicClient, {
      address: PAYMENT_TOKENS[1].address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address],
    }),
  ])

  const mints: Promise<`0x${string}`>[] = []

  if (usdcBal < USDC_MINT_AMOUNT) {
    mints.push(
      walletClient.writeContract({
        address: PAYMENT_TOKENS[0].address,
        abi: ERC20_MINT_ABI,
        functionName: 'mint',
        args: [address, USDC_MINT_AMOUNT],
      }),
    )
  }

  if (daiBal < DAI_MINT_AMOUNT) {
    mints.push(
      walletClient.writeContract({
        address: PAYMENT_TOKENS[1].address,
        abi: ERC20_MINT_ABI,
        functionName: 'mint',
        args: [address, DAI_MINT_AMOUNT],
      }),
    )
  }

  await Promise.all(mints)
}

/**
 * Auto-funds the connected wallet when USDC+DAI balance is below threshold.
 * Matches the manager app pattern: runs when wallet is connected.
 *
 * In dev mode (`VITE_TIME_TRAVEL=1`) uses local Anvil mint directly instead
 * of the external API, and also clears any contract bytecode at the account
 * address to prevent ERC1155 receiver check failures during registration.
 */
export function useAutoFundOnLowBalance() {
  const { address } = useConnection()

  // Track which addresses we've already set up in this session so we don't
  // repeat the setCode + mint on every render.
  const setupDoneRef = useRef<Set<string>>(new Set())

  const {
    data: balances = [],
    isLoading: isLoadingBalances,
    refetch: refetchBalances,
  } = useReadContracts({
    contracts: PAYMENT_TOKENS.map((token) => ({
      address: token.address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: address ? [address] : undefined,
    })),
    query: { enabled: Boolean(address) },
  })

  const fundWalletMutation = useFundWallet({
    onSuccess: (data) => {
      if (data?.txHash) {
        toast.success('Wallet funded', {
          description: 'Your wallet has been topped up with test USDC & DAI.',
          id: `fund-wallet-${address}`,
        })
        refetchBalances()
      } else {
        toast.dismiss(`fund-wallet-${address}`)
      }
    },
    onError: (error) => {
      toast.error('Failed to fund wallet', {
        description: error.message,
        id: `fund-wallet-${address}`,
      })
    },
  })

  // Dev-only: clear bytecode + mint tokens directly on the Anvil fork.
  // separate feature; Anvil setup is needed for any local fork run.
  // Falls back to the external API if the RPC doesn't support anvil_* methods
  // (i.e. you're running in dev mode against real Sepolia).
  useEffect(() => {
    if (!import.meta.env.DEV || !address) return
    if (setupDoneRef.current.has(address)) return

    setupDoneRef.current.add(address)
    toast.loading('Setting up dev wallet', {
      description: 'Clearing bytecode and minting test tokens on Anvil...',
      id: `anvil-setup-${address}`,
    })
    anvilFundAccount(address)
      .then(() => {
        toast.success('Dev wallet ready', {
          description: 'Bytecode cleared and USDC/DAI minted.',
          id: `anvil-setup-${address}`,
        })
        refetchBalances()
      })
      .catch(() => {
        // anvil_* methods not available — we're on real Sepolia in dev mode.
        // Remove from setupDone so the external-API effect can handle it.
        setupDoneRef.current.delete(address)
        toast.dismiss(`anvil-setup-${address}`)
      })
  }, [address, refetchBalances])

  // External API path: used in production, or in dev when Anvil setup failed
  // (i.e. connected to real Sepolia). Skipped if Anvil setup already ran.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Should not rerun from mutation status
  useEffect(() => {
    if (import.meta.env.DEV && setupDoneRef.current.has(address ?? '')) return
    if (!address || isLoadingBalances || fundWalletMutation.isPending) return

    const totalBalance = balances.reduce((acc, balance, i) => {
      if (balance.status !== 'success' || balance.result === undefined)
        return acc
      const decimals = PAYMENT_TOKENS[i].decimals
      return acc + BigInt(balance.result) / BigInt(10 ** decimals)
    }, 0n)

    if (totalBalance >= LOW_BALANCE_THRESHOLD) return

    toast.loading('Funding wallet', {
      description: 'Topping up your wallet with test USDC & DAI...',
      id: `fund-wallet-${address}`,
    })
    fundWalletMutation.mutate(address)
  }, [address, isLoadingBalances, balances])
}
