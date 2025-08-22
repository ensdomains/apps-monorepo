import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromPromise, ok } from 'neverthrow'
import { formatUnits } from 'viem'
import { generatePrivateKey } from 'viem/accounts'

import { publicClient } from '@/lib/wagmi'
import { web3AuthService } from '@/lib/web3Auth/web3AuthService'

export class NameChainContractError extends TaggedError(
  'NameChainContractError',
)<{
  cause: unknown
}> {}

export const CONTRACT_ADDRESSES = {
  L2: {
    ETH_REGISTRAR:
      '0xa513e6e4b8f2a923d98304ec87f64353c4d5c853' as `0x${string}`,
    ETHRegistry: '0x5fc8d32690cc91d4c39d9d3abcbd16989f875707' as `0x${string}`,
    L2BridgeController:
      '0x8a791620dd6260079bf849dc5567adc3f2fdc318' as `0x${string}`,
    MockL2Bridge: '0x5fbdb2315678afecb367f032d93f642f64180aa3' as `0x${string}`,
    PriceOracle: '0x0165878a594ca255338adfa4d48449f69242eb8f' as `0x${string}`,
    RegistryDatastore:
      '0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9' as `0x${string}`,
    SimpleRegistryMetadata:
      '0xdc64a140aa3e981100a9beca4e685f962f0cf6c9' as `0x${string}`,
    MockDAI: '0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0' as `0x${string}`,
    MockUSDC: '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512' as `0x${string}`,
  },
}

// Registry and empty address constants
export const EMPTY_ADDRESS =
  '0x0000000000000000000000000000000000000000' as `0x${string}`

export const ETH_REGISTRAR_ABI = [
  {
    type: 'function',
    name: 'available',
    inputs: [{ name: 'name', type: 'string', internalType: 'string' }],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'checkPrice',
    inputs: [
      { name: 'name', type: 'string', internalType: 'string' },
      { name: 'duration', type: 'uint256', internalType: 'uint256' }, // Fixed: uint64 → uint256
      { name: 'token', type: 'address', internalType: 'address' },
    ],
    outputs: [
      { name: 'tokenAmount', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'commit',
    inputs: [{ name: 'commitment', type: 'bytes32', internalType: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'makeCommitment',
    inputs: [
      { name: 'name', type: 'string', internalType: 'string' },
      { name: 'owner', type: 'address', internalType: 'address' },
      { name: 'secret', type: 'bytes32', internalType: 'bytes32' },
      { name: 'subregistry', type: 'address', internalType: 'address' },
      { name: 'resolver', type: 'address', internalType: 'address' },
      { name: 'duration', type: 'uint64', internalType: 'uint64' },
    ],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'register',
    inputs: [
      { name: 'name', type: 'string', internalType: 'string' },
      { name: 'owner', type: 'address', internalType: 'address' },
      { name: 'secret', type: 'bytes32', internalType: 'bytes32' },
      { name: 'subregistry', type: 'address', internalType: 'address' },
      { name: 'resolver', type: 'address', internalType: 'address' },
      { name: 'duration', type: 'uint64', internalType: 'uint64' },
      { name: 'token', type: 'address', internalType: 'address' },
    ],
    outputs: [{ name: 'tokenId', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'rentPrice',
    inputs: [
      { name: 'name', type: 'string', internalType: 'string' },
      { name: 'duration', type: 'uint64', internalType: 'uint64' },
    ],
    outputs: [
      {
        name: 'price',
        type: 'tuple',
        internalType: 'struct ITokenPriceOracle.Price',
        components: [
          { name: 'base', type: 'uint256', internalType: 'uint256' },
          { name: 'premium', type: 'uint256', internalType: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'valid',
    inputs: [{ name: 'name', type: 'string', internalType: 'string' }],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
] as const

// ERC20 ABI for token approvals
export const ERC20_ABI = [
  {
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// Real commitment generation using ENS contract
export const generateCommitment = async (
  name: string,
  ownerAddress: string,
  duration: number,
): Promise<{ commitment: `0x${string}`; secret: `0x${string}` }> => {
  const cleanName = name.replace('.eth', '')
  const durationInSeconds = BigInt(duration * 365 * 24 * 60 * 60)
  const secret = generatePrivateKey()

  console.log('🔑 Generating real ENS commitment:', {
    name: cleanName,
    ownerAddress,
    duration: durationInSeconds.toString(),
    secret,
  })

  // Use the contract's makeCommitment function to generate the real commitment
  const commitment = (await publicClient.readContract({
    address: CONTRACT_ADDRESSES.L2.ETH_REGISTRAR,
    abi: ETH_REGISTRAR_ABI,
    functionName: 'makeCommitment',
    args: [
      cleanName,
      ownerAddress as `0x${string}`,
      secret as `0x${string}`,
      CONTRACT_ADDRESSES.L2.ETHRegistry, // subregistry
      EMPTY_ADDRESS, // resolver
      durationInSeconds,
    ],
  })) as `0x${string}`

  console.log('✅ Real ENS commitment generated:', commitment)
  return { commitment, secret }
}

// Real ENS registration functions
export const commitToRegistration = async (
  commitment: `0x${string}`,
  walletClient: any,
): Promise<`0x${string}`> => {
  console.log('🔒 Committing to registration:', commitment)

  // Use Web3Auth EOA address for signing
  const signingAccount = await web3AuthService.getAccount()

  const hash = await walletClient.writeContract({
    address: CONTRACT_ADDRESSES.L2.ETH_REGISTRAR,
    abi: ETH_REGISTRAR_ABI,
    functionName: 'commit',
    args: [commitment],
    account: signingAccount,
    chain: web3AuthService.chain?.viemChain,
  })

  console.log('✅ Commitment transaction hash:', hash)
  return hash
}

export const approveTokenForRegistration = async (
  tokenAddress: `0x${string}`,
  amount: bigint,
  walletClient: any,
): Promise<`0x${string}`> => {
  console.log('✅ Approving token for registration:', { tokenAddress, amount })

  // Use Web3Auth EOA address for signing
  const signingAccount = await web3AuthService.getAccount()

  const hash = await walletClient.writeContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [CONTRACT_ADDRESSES.L2.ETH_REGISTRAR, amount],
    account: signingAccount,
    chain: web3AuthService.chain?.viemChain,
  })

  console.log('✅ Token approval transaction hash:', hash)
  return hash
}

export const registerDomain = async (
  name: string,
  ownerAddress: `0x${string}`,
  duration: number,
  secret: `0x${string}`,
  walletClient: any,
  tokenAddress: `0x${string}` = CONTRACT_ADDRESSES.L2.MockUSDC, // Default to USDC but allow override
): Promise<`0x${string}`> => {
  console.log('📝 Registering domain:', {
    name,
    ownerAddress,
    duration,
    tokenAddress,
  })

  const cleanName = name.replace('.eth', '')
  const durationInSeconds = BigInt(duration * 365 * 24 * 60 * 60)

  // Use Web3Auth EOA address for signing
  const signingAccount = await web3AuthService.getAccount()

  const hash = await walletClient.writeContract({
    address: CONTRACT_ADDRESSES.L2.ETH_REGISTRAR,
    abi: ETH_REGISTRAR_ABI,
    functionName: 'register',
    args: [
      cleanName,
      ownerAddress,
      secret,
      CONTRACT_ADDRESSES.L2.ETHRegistry,
      EMPTY_ADDRESS,
      durationInSeconds,
      tokenAddress,
    ],
    account: signingAccount,
    chain: web3AuthService.chain?.viemChain,
  })

  console.log('✅ Domain registration transaction hash:', hash)
  return hash
}

export const checkRealNameAvailability = ResultFn(async function* (
  name: string,
) {
  const cleanName = name.replace('.eth', '')

  console.log('🔍 Checking name availability')

  try {
    // First, let's test if the network is reachable
    yield* await fromPromise(publicClient.getChainId(), (e) => {
      console.error('❌ Network connection failed:', e)
      return new NameChainContractError({
        cause: `Network unreachable: ${e}`,
      })
    })

    const availability = yield* await fromPromise(
      publicClient.readContract({
        address: CONTRACT_ADDRESSES.L2.ETH_REGISTRAR,
        abi: ETH_REGISTRAR_ABI,
        functionName: 'available',
        args: [cleanName],
      }),
      (e) => {
        console.error('❌ Contract call failed:', e)
        return new NameChainContractError({
          cause: `Contract call failed: ${e}`,
        })
      },
    )

    return ok({
      isAvailable: Boolean(availability),
      name: `${cleanName}.eth`,
    })
  } catch (error) {
    console.error('❌ Unexpected error in checkRealNameAvailability:', error)
    throw new NameChainContractError({ cause: error })
  }
})

export const getTokenPrices = ResultFn(async function* (
  name: string,
  duration: number, // in seconds
) {
  const cleanName = name.replace('.eth', '')
  const durationBigInt = BigInt(duration)

  console.log('💰 Getting token prices')

  const usdcPrice = yield* await fromPromise(
    publicClient.readContract({
      address: CONTRACT_ADDRESSES.L2.ETH_REGISTRAR,
      abi: ETH_REGISTRAR_ABI,
      functionName: 'checkPrice',
      args: [cleanName, durationBigInt, CONTRACT_ADDRESSES.L2.MockUSDC],
    }),
    (e) => new NameChainContractError({ cause: e }),
  )

  const daiPrice = yield* await fromPromise(
    publicClient.readContract({
      address: CONTRACT_ADDRESSES.L2.ETH_REGISTRAR,
      abi: ETH_REGISTRAR_ABI,
      functionName: 'checkPrice',
      args: [cleanName, durationBigInt, CONTRACT_ADDRESSES.L2.MockDAI],
    }),
    (e) => new NameChainContractError({ cause: e }),
  )

  return ok({
    usdc: {
      raw: usdcPrice as bigint,
      formatted: formatUnits(usdcPrice as bigint, 6), // USDC has 6 decimals
      address: CONTRACT_ADDRESSES.L2.MockUSDC,
    },
    dai: {
      raw: daiPrice as bigint,
      formatted: formatUnits(daiPrice as bigint, 18), // DAI has 18 decimals
      address: CONTRACT_ADDRESSES.L2.MockDAI,
    },
  })
})
