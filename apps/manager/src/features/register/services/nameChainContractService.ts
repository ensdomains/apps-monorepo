import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { err, fromPromise, ok, type Result } from 'neverthrow'
import {
  encodeAbiParameters,
  formatUnits,
  keccak256,
} from 'viem'

// TODO: no dependency from wagmi, remove this
import { publicClient } from '@/lib/wagmi'
import type { Web3AuthServiceType } from '@/lib/web3Auth/web3AuthService'

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
      { name: 'duration', type: 'uint256', internalType: 'uint256' },
      { name: 'token', type: 'address', internalType: 'address' },
    ],
    outputs: [
      { name: 'tokenAmount', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'rentPrice',
    inputs: [
      { name: 'name', type: 'string', internalType: 'string' },
      { name: 'duration', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [
      {
        name: 'price',
        type: 'tuple',
        internalType: 'struct ITokenPriceOracle.Price', // ← Updated struct name
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
    inputs: [
      {
        name: 'name',
        type: 'string',
        internalType: 'string',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'pure',
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
    name: 'makeCommitment', // ← New function you'll need
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
      {
        name: 'subregistry',
        type: 'address',
        internalType: 'contract IRegistry',
      },
      { name: 'resolver', type: 'address', internalType: 'address' },
      { name: 'duration', type: 'uint64', internalType: 'uint64' },
      { name: 'token', type: 'address', internalType: 'address' }, // ← NEW PARAMETER
    ],
    outputs: [{ name: 'tokenId', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'nonpayable', // ← CHANGED from 'payable'
  },
  {
    type: 'function',
    name: 'renew', // ← New function for renewals
    inputs: [
      { name: 'name', type: 'string', internalType: 'string' },
      { name: 'duration', type: 'uint64', internalType: 'uint64' },
      { name: 'token', type: 'address', internalType: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'tokenPriceOracle', // ← New function for getting price oracle address
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
] as const

// Note: TOKEN_PRICE_ORACLE_ABI removed - we now use checkPrice directly on ETH_REGISTRAR

// ERC20 ABI for token approvals
export const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address', internalType: 'address' },
      { name: 'amount', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8', internalType: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [{ name: '', type: 'string', internalType: 'string' }],
    stateMutability: 'view',
  },
] as const

export const REGISTRY_ADDRESS = '0x5fc8d32690cc91d4c39d9d3abcbd16989f875707' // Use your actual registry address
export const EMPTY_ADDRESS = '0x0000000000000000000000000000000000000000'


export const generateCommitment = (
  name: string,
  ownerAddress: string,
  duration: number,
): { commitment: `0x${string}`; secret: `0x${string}` } => {
  const cleanName = name.replace('.eth', '')
  const durationInSeconds = BigInt(duration)
  const secret =
    '0x8891f460088d2245cff60da5e49a21cfc4673324610b9cbbd8c6b9eb410d83a5'

  const encodedData = encodeAbiParameters(
    [
      { name: 'name', type: 'string' },
      { name: 'owner', type: 'address' },
      { name: 'secret', type: 'bytes32' },
      { name: 'subRegistry', type: 'address' },
      { name: 'resolver', type: 'address' },
      { name: 'duration', type: 'uint64' },
    ],
    [
      cleanName,
      ownerAddress as `0x${string}`,
      secret as `0x${string}`,
      REGISTRY_ADDRESS as `0x${string}`,
      EMPTY_ADDRESS as `0x${string}`,
      durationInSeconds,
    ],
  )

  const commitment = keccak256(encodedData)
  return { commitment, secret }
}

export const generateCommitmentViaContract = async (
  name: string,
  ownerAddress: string,
  duration: number, // in years
  web3AuthService: Web3AuthServiceType,
): Promise<
  Result<{ commitment: string; secret: string }, NameChainContractError>
> => {
  try {
    console.log('🔑 Generating commitment via contract')

    const cleanName = name.replace('.eth', '')
    const secret =
      '0x8891f460088d2245cff60da5e49a21cfc4673324610b9cbbd8c6b9eb410d83a5'
    const _durationInSeconds = BigInt(duration * 365 * 24 * 60 * 60)

    // Use the contract's makeCommitment function for perfect compatibility
    const commitment = await web3AuthService.readContract(
      CONTRACT_ADDRESSES.L2.ETH_REGISTRAR,
      ETH_REGISTRAR_ABI as unknown as unknown[],
      'makeCommitment',
      [
        cleanName,
        ownerAddress as `0x${string}`,
        secret as `0x${string}`,
        REGISTRY_ADDRESS as `0x${string}`,
        EMPTY_ADDRESS as `0x${string}`,
        _durationInSeconds,
      ],
    )

    console.log('✅ Commitment generated via contract')

    return ok({
      commitment: commitment as string,
      secret,
    })
  } catch (error) {
    console.error('❌ Failed to generate commitment via contract:', error)
    return err(new NameChainContractError({ cause: error }))
  }
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

export const approveTokenForRegistration = async (
  tokenAddress: string,
  amount: bigint,
  web3AuthService: Web3AuthServiceType,
): Promise<Result<string, NameChainContractError>> => {
  console.log('✅ Starting token approval for registration')

  try {
    const hash = await web3AuthService.writeContract(
      tokenAddress,
      ERC20_ABI as unknown as unknown[],
      'approve',
      [CONTRACT_ADDRESSES.L2.ETH_REGISTRAR, amount],
    )

    console.log('✅ Token approval transaction sent:', hash)
    return ok(hash)
  } catch (error) {
    console.error('❌ Failed to approve token:', error)
    return err(new NameChainContractError({ cause: error }))
  }
}

export const registerDomain = async (
  name: string,
  ownerAddress: string,
  secret: string,
  duration: number, // in years
  selectedToken: string,
  web3AuthService: Web3AuthServiceType,
): Promise<Result<string, NameChainContractError>> => {
  console.log('📝 Starting domain registration')

  try {
    // Convert duration from years to seconds
    const durationInSeconds = BigInt(duration * 365 * 24 * 60 * 60)
    const cleanName = name.replace('.eth', '')

    // Register the domain using the selected token
    const registerHash = await web3AuthService.writeContract(
      CONTRACT_ADDRESSES.L2.ETH_REGISTRAR,
      ETH_REGISTRAR_ABI as unknown as unknown[],
      'register',
      [
        cleanName,
        ownerAddress as `0x${string}`,
        secret as `0x${string}`,
        REGISTRY_ADDRESS as `0x${string}`,
        EMPTY_ADDRESS as `0x${string}`,
        durationInSeconds,
        selectedToken as `0x${string}`,
      ],
    )

    console.log('✅ Domain registration transaction sent:', registerHash)
    return ok(registerHash)
  } catch (error) {
    console.error('❌ Failed to register domain:', error)
    return err(new NameChainContractError({ cause: error }))
  }
}
