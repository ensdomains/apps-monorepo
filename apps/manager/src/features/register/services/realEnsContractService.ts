import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromPromise, ok } from 'neverthrow'
import {
  type Address,
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  http,
  keccak256,
} from 'viem'
import { localhost } from 'viem/chains'

export class RealEnsContractError extends TaggedError('RealEnsContractError')<{
  cause: unknown
}> {}

// Use the same anvil chain configuration as wagmi.ts
const anvil = {
  ...localhost,
  id: 31338,
  name: 'Anvil',
  rpcUrls: {
    ...localhost.rpcUrls,
    default: {
      http: ['http://127.0.0.1:8546'],
      webSocket: ['ws://127.0.0.1:8546'],
    },
  },
}

// Create public client using the same configuration as wagmi
const publicL2Client = createPublicClient({
  chain: anvil,
  transport: http('http://127.0.0.1:8546'),
})

export const CONTRACT_ADDRESSES = {
  L2: {
    ETH_REGISTRAR:
      '0x2279b7a0a67db372996a5fab50d91eaa73d2ebe6' as `0x${string}`,
    ETHRegistry: '0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9' as `0x${string}`,
    L2EjectionController:
      '0xdc64a140aa3e981100a9beca4e685f962f0cf6c9' as `0x${string}`,
    MockL2Bridge: '0x5fbdb2315678afecb367f032d93f642f64180aa3' as `0x${string}`,
    PriceOracle: '0xa513e6e4b8f2a923d98304ec87f64353c4d5c853' as `0x${string}`,
    RegistryDatastore:
      '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512' as `0x${string}`,
    SimpleRegistryMetadata:
      '0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0' as `0x${string}`,
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
    name: 'rentPrice',
    inputs: [
      { name: 'name', type: 'string', internalType: 'string' },
      { name: 'duration', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [
      {
        name: 'price',
        type: 'tuple',
        internalType: 'struct IPriceOracle.Price',
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
    ],
    outputs: [{ name: 'tokenId', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'payable',
  },
] as const

const REGISTRY_ADDRESS = '0x32850cAd1e9170614704fF8BA37a25e498e1B832'
const EMPTY_ADDRESS = '0x0000000000000000000000000000000000000000'

const defaultGas = {
  gas: 1000000n,
  maxFeePerGas: 1000000000n,
  maxPriorityFeePerGas: 1000000000n,
}

// Transaction parameter types for wagmi hooks
export interface CommitTransactionParams {
  to: Address
  data: `0x${string}`
  gas: bigint
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
}

export interface RegisterTransactionParams {
  to: Address
  data: `0x${string}`
  value: bigint
  gas: bigint
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
}

// Helper function to generate commitment hash
export const generateCommitment = (
  name: string,
  ownerAddress: string,
  duration: number,
): { commitment: `0x${string}`; secret: `0x${string}` } => {
  const cleanName = name.replace('.eth', '')
  const durationInSeconds = BigInt(duration * 365 * 24 * 60 * 60)
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

export const checkRealNameAvailability = ResultFn(async function* (
  name: string,
) {
  const cleanName = name.replace('.eth', '')

  console.log('🔍 Checking name availability:', {
    name: cleanName,
    fullName: `${cleanName}.eth`,
    registrarAddress: CONTRACT_ADDRESSES.L2.ETH_REGISTRAR,
    rpcUrl: 'http://127.0.0.1:8546',
  })

  try {
    // First, let's test if the network is reachable
    const networkTest = yield* await fromPromise(
      publicL2Client.getChainId(),
      (e) => {
        console.error('❌ Network connection failed:', e)
        return new RealEnsContractError({ cause: `Network unreachable: ${e}` })
      },
    )

    console.log('✅ Network connection successful, chain ID:', networkTest)

    const availability = yield* await fromPromise(
      publicL2Client.readContract({
        address: CONTRACT_ADDRESSES.L2.ETH_REGISTRAR,
        abi: ETH_REGISTRAR_ABI,
        functionName: 'available',
        args: [cleanName],
      }),
      (e) => {
        console.error('❌ Contract call failed:', e)
        return new RealEnsContractError({ cause: `Contract call failed: ${e}` })
      },
    )

    console.log('✅ Contract call successful, availability:', availability)

    return ok({
      isAvailable: Boolean(availability),
      name: `${cleanName}.eth`,
    })
  } catch (error) {
    console.error('❌ Unexpected error in checkRealNameAvailability:', error)
    throw new RealEnsContractError({ cause: error })
  }
})

export const getRealNamePrice = ResultFn(async function* (
  name: string,
  duration: number = 1,
) {
  const cleanName = name.replace('.eth', '')
  const durationInSeconds = BigInt(duration * 365 * 24 * 60 * 60) // Convert years to seconds

  const priceResult = yield* await fromPromise(
    publicL2Client.readContract({
      address: CONTRACT_ADDRESSES.L2.ETH_REGISTRAR,
      abi: ETH_REGISTRAR_ABI,
      functionName: 'rentPrice',
      args: [cleanName, durationInSeconds],
    }),
    (e) => new RealEnsContractError({ cause: e }),
  )

  const totalPrice = (priceResult as any).base + (priceResult as any).premium

  return ok({
    totalPrice: totalPrice.toString(),
    base: (priceResult as any).base.toString(),
    premium: (priceResult as any).premium.toString(),
  })
})

// Generate commit transaction parameters (no execution)
export const getCommitTransactionParams = (
  name: string,
  ownerAddress: string,
  duration: number = 1,
): CommitTransactionParams => {
  const { commitment } = generateCommitment(name, ownerAddress, duration)

  return {
    to: CONTRACT_ADDRESSES.L2.ETH_REGISTRAR,
    data: encodeFunctionData({
      abi: ETH_REGISTRAR_ABI,
      functionName: 'commit',
      args: [commitment],
    }),
    ...defaultGas,
  }
}

// Legacy function that actually executes transaction (deprecated)
export const commitNameRegistration = () => {
  throw new RealEnsContractError({
    cause:
      'commitNameRegistration should not be called directly. Use getCommitTransactionParams with wagmi hooks instead.',
  })
}

// Generate register transaction parameters (no execution)
export const getRegisterTransactionParams = (
  name: string,
  ownerAddress: string,
  duration: number = 1,
  valueInEth: string = '0.025',
): RegisterTransactionParams => {
  const cleanName = name.replace('.eth', '')
  const { secret } = generateCommitment(name, ownerAddress, duration)
  const valueInWei = BigInt(parseFloat(valueInEth) * 1e18)
  const durationInSeconds = BigInt(duration * 365 * 24 * 60 * 60)

  return {
    to: CONTRACT_ADDRESSES.L2.ETH_REGISTRAR,
    data: encodeFunctionData({
      abi: ETH_REGISTRAR_ABI,
      functionName: 'register',
      args: [
        cleanName,
        ownerAddress as `0x${string}`,
        secret as `0x${string}`,
        REGISTRY_ADDRESS as `0x${string}`,
        EMPTY_ADDRESS as `0x${string}`,
        durationInSeconds,
      ],
    }),
    value: valueInWei,
    ...defaultGas,
  }
}

// Legacy function (deprecated)
export const registerName = () => {
  throw new RealEnsContractError({
    cause:
      'registerName should not be called directly. Use getRegisterTransactionParams with wagmi hooks instead.',
  })
}

export const validateNameFormat = ResultFn(async function* (name: string) {
  const cleanName = name.replace('.eth', '')

  const isValid = yield* await fromPromise(
    publicL2Client.readContract({
      address: CONTRACT_ADDRESSES.L2.ETH_REGISTRAR,
      abi: ETH_REGISTRAR_ABI,
      functionName: 'valid',
      args: [cleanName],
    }),
    (e) => new RealEnsContractError({ cause: e }),
  )

  return ok({
    isValid: Boolean(isValid),
    name: `${cleanName}.eth`,
  })
})
