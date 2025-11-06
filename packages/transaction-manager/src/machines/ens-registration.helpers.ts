import { err, ok, type Result } from 'neverthrow'
import type { Address, Hex, PublicClient } from 'viem'
import { encodeFunctionData, keccak256, toHex } from 'viem'

// ============================================================================
// ABIs
// ============================================================================

const FAST_TEST_REGISTRAR_ABI = [
  {
    inputs: [{ name: 'commitment', type: 'bytes32' }],
    name: 'commit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'owner', type: 'address' },
      { name: 'secret', type: 'bytes32' },
      { name: 'subregistry', type: 'address' },
      { name: 'resolver', type: 'address' },
      { name: 'duration', type: 'uint64' },
      { name: 'referrer', type: 'bytes32' },
    ],
    name: 'makeCommitment',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'owner', type: 'address' },
      { name: 'secret', type: 'bytes32' },
      { name: 'subregistry', type: 'address' },
      { name: 'resolver', type: 'address' },
      { name: 'duration', type: 'uint64' },
      { name: 'paymentToken', type: 'address' },
      { name: 'referrer', type: 'bytes32' },
    ],
    name: 'register',
    outputs: [{ name: 'tokenId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'owner', type: 'address' },
      { name: 'duration', type: 'uint64' },
      { name: 'paymentToken', type: 'address' },
    ],
    name: 'rentPrice',
    outputs: [
      { name: 'base', type: 'uint256' },
      { name: 'premium', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'commitment', type: 'bytes32' }],
    name: 'commitmentAt',
    outputs: [{ name: '', type: 'uint64' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const ERC20_ABI = [
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

// ============================================================================
// Types
// ============================================================================

export interface ENSRegistrationParams {
  name: string // Name without .eth (e.g., "vitalik")
  duration: bigint // Duration in seconds
  owner: Address
  resolver: Address
  paymentToken: Address // ERC20 token or 0x0000000000000000000000000000000000000000 for ETH
  registrarAddress: Address
  registryAddress: Address // Subregistry address (usually 0x0 for default)
}

export interface RegistrationPricing {
  base: bigint
  premium: bigint
  total: bigint
}

export interface CommitmentData {
  commitment: Hex
  secret: Hex
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generates a random secret for ENS registration commitment
 */
export function generateSecret(): Hex {
  // Generate 32 random bytes
  const randomBytes = new Uint8Array(32)
  crypto.getRandomValues(randomBytes)

  // Convert to hex
  return toHex(randomBytes)
}

/**
 * Calls the registrar contract to generate a commitment hash
 */
export async function makeCommitment(
  params: ENSRegistrationParams,
  secret: Hex,
  publicClient: PublicClient,
): Promise<Result<Hex, Error>> {
  try {
    const commitment = (await publicClient.readContract({
      address: params.registrarAddress,
      abi: FAST_TEST_REGISTRAR_ABI,
      functionName: 'makeCommitment',
      args: [
        params.name,
        params.owner,
        secret,
        params.registryAddress, // subregistry
        params.resolver,
        params.duration,
        toHex(0, { size: 32 }), // referrer (0x0)
      ],
    })) as Hex

    return ok(commitment)
  } catch (error) {
    return err(
      new Error(
        `Failed to make commitment: ${error instanceof Error ? error.message : String(error)}`,
      ),
    )
  }
}

/**
 * Prepares the commit transaction data
 */
export function prepareCommitTransaction(
  params: ENSRegistrationParams,
  commitment: Hex,
): Result<{ to: Address; data: Hex; value: bigint }, Error> {
  try {
    const data = encodeFunctionData({
      abi: FAST_TEST_REGISTRAR_ABI,
      functionName: 'commit',
      args: [commitment],
    })

    return ok({
      to: params.registrarAddress,
      data,
      value: 0n,
    })
  } catch (error) {
    return err(
      new Error(
        `Failed to prepare commit transaction: ${error instanceof Error ? error.message : String(error)}`,
      ),
    )
  }
}

/**
 * Prepares the register transaction data
 */
export function prepareRegisterTransaction(
  params: ENSRegistrationParams,
  secret: Hex,
): Result<{ to: Address; data: Hex; value: bigint }, Error> {
  try {
    const data = encodeFunctionData({
      abi: FAST_TEST_REGISTRAR_ABI,
      functionName: 'register',
      args: [
        params.name,
        params.owner,
        secret,
        params.registryAddress, // subregistry
        params.resolver,
        params.duration,
        params.paymentToken,
        toHex(0, { size: 32 }), // referrer (0x0)
      ],
    })

    return ok({
      to: params.registrarAddress,
      data,
      value: 0n, // Value is 0 for token payments
    })
  } catch (error) {
    return err(
      new Error(
        `Failed to prepare register transaction: ${error instanceof Error ? error.message : String(error)}`,
      ),
    )
  }
}

/**
 * Gets the registration price from the registrar contract
 */
export async function getRegistrationPrice(
  params: ENSRegistrationParams,
  publicClient: PublicClient,
): Promise<Result<RegistrationPricing, Error>> {
  try {
    const [base, premium] = (await publicClient.readContract({
      address: params.registrarAddress,
      abi: FAST_TEST_REGISTRAR_ABI,
      functionName: 'rentPrice',
      args: [params.name, params.owner, params.duration, params.paymentToken],
    })) as [bigint, bigint]

    return ok({
      base,
      premium,
      total: base + premium,
    })
  } catch (error) {
    return err(
      new Error(
        `Failed to get registration price: ${error instanceof Error ? error.message : String(error)}`,
      ),
    )
  }
}

/**
 * Checks if a commitment is ready for reveal (commitment age >= MIN_COMMITMENT_AGE)
 */
export async function checkCommitmentAge(
  commitment: Hex,
  registrarAddress: Address,
  publicClient: PublicClient,
): Promise<Result<{ ready: boolean; commitmentTimestamp: bigint }, Error>> {
  try {
    const commitmentTimestamp = (await publicClient.readContract({
      address: registrarAddress,
      abi: FAST_TEST_REGISTRAR_ABI,
      functionName: 'commitmentAt',
      args: [commitment],
    })) as bigint

    // For FastTestETHRegistrar, MIN_COMMITMENT_AGE is 0, so always ready after confirmation
    const currentTime = BigInt(Math.floor(Date.now() / 1000))
    const ready = commitmentTimestamp > 0n && currentTime >= commitmentTimestamp

    return ok({
      ready,
      commitmentTimestamp,
    })
  } catch (error) {
    return err(
      new Error(
        `Failed to check commitment age: ${error instanceof Error ? error.message : String(error)}`,
      ),
    )
  }
}

/**
 * Prepares a token approval transaction
 */
export async function prepareTokenApproval(
  params: {
    tokenAddress: Address
    spender: Address // registrar address
    amount: bigint
    owner: Address
  },
  publicClient: PublicClient,
): Promise<
  Result<
    { to: Address; data: Hex; value: bigint; needsApproval: boolean },
    Error
  >
> {
  try {
    // Check current allowance
    const currentAllowance = (await publicClient.readContract({
      address: params.tokenAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [params.owner, params.spender],
    })) as bigint

    // If allowance is sufficient, no approval needed
    if (currentAllowance >= params.amount) {
      return ok({
        to: params.tokenAddress,
        data: '0x',
        value: 0n,
        needsApproval: false,
      })
    }

    // Prepare approval transaction
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [params.spender, params.amount],
    })

    return ok({
      to: params.tokenAddress,
      data,
      value: 0n,
      needsApproval: true,
    })
  } catch (error) {
    return err(
      new Error(
        `Failed to prepare token approval: ${error instanceof Error ? error.message : String(error)}`,
      ),
    )
  }
}
