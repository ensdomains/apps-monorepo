/**
 * Registration Actor Functions
 *
 * Pure functions for ENS registration operations.
 */

import {
  ethRegistrarCommitmentsSnippet,
  ethRegistrarCommitSnippet,
  ethRegistrarMakeCommitmentSnippet,
  ethRegistrarRegisterSnippet,
} from '@ensdomains/ensjs-abi/v2/ethRegistrar'
import { errAsync, fromPromise, ResultAsync } from 'neverthrow'
import type { Address, Hash, Hex, PublicClient, TransactionReceipt } from 'viem'
import {
  decodeEventLog,
  encodeFunctionData,
  erc20Abi,
  isAddressEqual,
  keccak256,
  parseAbi,
  stringToBytes,
  toHex,
  zeroAddress,
} from 'viem'
import { getBlock, multicall, readContract } from 'viem/actions'
import { sepolia } from 'viem/chains'
import type { Signer } from '../..'
import { VERIFIABLE_FACTORY_ABI } from '../../contracts/abis/VerifiableFactory.abi'

// `MIN_COMMITMENT_AGE` is an immutable on ETHRegistrar; ensjs-abi does not (yet)
// expose a dedicated snippet for it.
const ethRegistrarMinCommitmentAgeSnippet = parseAbi([
  'function MIN_COMMITMENT_AGE() view returns (uint64)',
])

import {
  ENS_SEPOLIA_CONTRACTS,
  REFERER_ADDRESS,
  SUPPORTED_TOKENS,
} from '../../contracts/ens-sepolia'
import { assertPaymentTokenSupported } from '../../contracts/paymentToken'
import { waitForTransactionReceiptById } from '../../helpers/transaction-status.helpers'
import { transactionManager } from '../../providers/transactionManager'
import type {
  RhinestoneTransactionRequest,
  TransactionRequest,
} from '../../types/transaction.types'

type CommitmentData = {
  commitment: Hash
  secret: Hash
}

const DEDICATED_RESOLVER_INIT_ABI = parseAbi([
  'function initialize(address owner, uint256 bitmap)',
])

const DEDICATED_RESOLVER_ROLE_BITMAP = BigInt(
  '0x1111111111111111111111111111111111111111111111111111111111111111',
)

// ============================================================================
// Helper Functions (only used in this file)
// ============================================================================

function generateResolverSalt(name: string): bigint {
  const timestamp = new Date().toISOString()
  return BigInt(keccak256(stringToBytes(`${name}:${timestamp}`)))
}

function getResolverInitCalldata(ownerAddress: Address): Hex {
  return encodeFunctionData({
    abi: DEDICATED_RESOLVER_INIT_ABI,
    functionName: 'initialize',
    args: [ownerAddress, DEDICATED_RESOLVER_ROLE_BITMAP],
  })
}

function parseProxyDeployedAddress(
  receipt: TransactionReceipt,
): Address | undefined {
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: VERIFIABLE_FACTORY_ABI,
        data: log.data,
        topics: log.topics,
      })

      if (decoded.eventName === 'ProxyDeployed') {
        return decoded.args.proxyAddress as Address
      }
    } catch {
      // Ignore non-matching logs
    }
  }
  return undefined
}

/**
 * Generate commitment hash via contract call
 * Note: Uses makeCommitment (NOT makeCommitmentWithToken)
 * Payment token is specified during registration, not commitment
 */
function generateCommitment(
  publicClient: PublicClient,
  name: string,
  ownerAddress: Address,
  duration: bigint,
  resolverAddress: Address,
  registrarAddress: Address = ENS_SEPOLIA_CONTRACTS.ETHRegistrar,
): ResultAsync<CommitmentData, Error> {
  const cleanName = name.replace('.eth', '')
  const secret = keccak256(toHex(Math.random().toString()) as Hash)

  return fromPromise(
    (async () => {
      const commitment = await readContract(publicClient, {
        address: registrarAddress,
        abi: ethRegistrarMakeCommitmentSnippet,
        functionName: 'makeCommitment',
        args: [
          cleanName,
          ownerAddress,
          secret,
          zeroAddress,
          resolverAddress,
          duration,
          REFERER_ADDRESS,
        ],
      })
      return { commitment, secret }
    })(),
    (error) => {
      console.error('❌ Failed to generate commitment:', error)
      return new Error(`Failed to generate commitment: ${error}`)
    },
  )
}

/**
 * Encode commitment transaction data
 */
function encodeCommitmentData(commitment: Hash): Hash {
  return encodeFunctionData({
    abi: ethRegistrarCommitSnippet,
    functionName: 'commit',
    args: [commitment],
  })
}

/**
 * Encode token approval transaction data
 */
function encodeTokenApprovalData(
  amount: bigint,
  registrarAddress: Address,
): Hash {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [registrarAddress, amount * 2n],
  })
}

/**
 * Encode registration transaction data
 */
function encodeRegistrationData(
  name: string,
  ownerAddress: Address,
  secret: Hash,
  duration: bigint,
  paymentToken: Address,
  resolverAddress: Address,
): Hash {
  const cleanName = name.replace('.eth', '')

  return encodeFunctionData({
    abi: ethRegistrarRegisterSnippet,
    functionName: 'register',
    args: [
      cleanName,
      ownerAddress,
      secret,
      zeroAddress,
      resolverAddress,
      duration,
      paymentToken,
      REFERER_ADDRESS,
    ],
  })
}

/**
 * Get payment token address
 */
function getPaymentTokenAddress(token: 'USDC' | 'DAI'): Address {
  return SUPPORTED_TOKENS[token]
}

export function getSignerAddress(signer: Signer): Address {
  if (signer.type === 'eoa') {
    const account = signer.walletClient.account

    if (!account) {
      throw new Error('EOA wallet client has no account connected')
    }
    return account.address
  }

  if (signer.type === 'rhinestone') {
    if (signer.config.accountAddress) {
      return signer.config.accountAddress
    }
    // Fallback to SDK method
    return signer.account.getAddress() as Address
  }

  signer satisfies never
  throw new Error('Only EOA or Rhinestone signer is supported for registration')
}

/**
 * Create transaction request based on signer type.
 * Returns either an EOA request or a rhinestone-intent request.
 */
export function createTransactionRequest(params: {
  signer: Signer
  from: Address
  to: Address
  data: Hex
  value: bigint
  chainId: number
  calls: Array<{ to: Address; data: Hex; value: bigint }>
  sponsored?: boolean
}): TransactionRequest {
  const { signer, from, to, data, value, chainId, calls, sponsored } = params

  if (signer.type === 'eoa') {
    return {
      type: 'eoa',
      from,
      to,
      data,
      value,
      chainId,
    }
  }

  if (signer.type === 'rhinestone') {
    return {
      type: 'rhinestone-intent',
      from,
      to,
      data,
      value,
      chainId,
      rhinestoneParams: {
        calls,
        sponsored: sponsored ?? true,
      },
    } as RhinestoneTransactionRequest
  }

  signer satisfies never
  throw new Error('Unsupported signer type for transaction request')
}

// ============================================================================
// Actor Functions (exported for use with fromResultAsync in machine)
// ============================================================================

/**
 * Deploy dedicated resolver proxy through verifiable factory
 */
export function submitResolverDeploymentActor(input: {
  name: string
  owner: Address
  signer: import('../..').Signer
  publicClient: PublicClient
  sponsored?: boolean
  id?: string
}): ResultAsync<{ txId: string; salt: bigint }, Error> {
  return ResultAsync.fromSafePromise(
    Promise.resolve().then(() => {
      const accountAddress = getSignerAddress(input.signer)
      const salt = generateResolverSalt(input.name)
      const initCalldata = getResolverInitCalldata(input.owner)

      const deployCalldata = encodeFunctionData({
        abi: VERIFIABLE_FACTORY_ABI,
        functionName: 'deployProxy',
        args: [ENS_SEPOLIA_CONTRACTS.DedicatedResolverImpl, salt, initCalldata],
      })

      const request = createTransactionRequest({
        signer: input.signer,
        from: accountAddress,
        to: ENS_SEPOLIA_CONTRACTS.VerifiableFactory,
        data: deployCalldata,
        value: 0n,
        chainId: input.publicClient.chain?.id ?? sepolia.id,
        calls: [
          {
            to: ENS_SEPOLIA_CONTRACTS.VerifiableFactory,
            data: deployCalldata,
            value: 0n,
          },
        ],
        sponsored: input.sponsored ?? true,
      })

      const txId = transactionManager.startTransaction(
        {
          type: 'custom',
          request,
        },
        input.signer,
        {
          id: input.id,
          description: `Deploy dedicated resolver for ${input.name}.eth`,
          publicClient: input.publicClient,
          timeout: 120_000,
        },
      )

      return { txId, salt }
    }),
  ).mapErr(
    (error) => new Error(`Failed to submit resolver deployment: ${error}`),
  )
}

/**
 * Wait for resolver deployment transaction and extract deployed proxy address
 */
export function resolveResolverDeploymentActor(input: {
  txId: string
}): ResultAsync<{ resolverAddress: Address }, Error> {
  return fromPromise(
    (async () => {
      const receipt = await waitForTransactionReceiptById(input.txId)
      const resolverAddress = parseProxyDeployedAddress(receipt)

      if (!resolverAddress) {
        throw new Error(
          'ProxyDeployed event not found in resolver deployment receipt',
        )
      }

      return { resolverAddress }
    })(),
    (error) => error as Error,
  )
}

/**
 * Generate commitment for ENS registration
 */
export function generateCommitmentActor(input: {
  name: string
  owner: Address
  duration: bigint
  publicClient: PublicClient
  selectedToken: 'USDC' | 'DAI'
  resolverAddress: Address
}): ResultAsync<CommitmentData, Error> {
  const registrarAddress = ENS_SEPOLIA_CONTRACTS.ETHRegistrar

  return generateCommitment(
    input.publicClient,
    input.name,
    input.owner,
    input.duration,
    input.resolverAddress,
    registrarAddress,
  )
}

/**
 * Submit commitment transaction via transaction manager
 */
export function submitCommitmentActor(input: {
  commitment: CommitmentData
  signer: import('../..').Signer
  name: string
  duration: bigint
  publicClient: PublicClient
  sponsored?: boolean
  id?: string
}): ResultAsync<string, Error> {
  const registrarAddress = ENS_SEPOLIA_CONTRACTS.ETHRegistrar

  return fromPromise(
    (async () => {
      console.log(
        `🔧 [REGISTRATION ACTOR] submitCommitmentActor called with:`,
        {
          hasPublicClient: !!input.publicClient,
          hasSigner: !!input.signer,
          signerType: input.signer?.type,
          name: input.name,
        },
      )

      const accountAddress = getSignerAddress(input.signer)

      const commitmentData = encodeCommitmentData(input.commitment.commitment)

      console.log(
        `🔧 [REGISTRATION ACTOR] About to call startTransaction with publicClient:`,
        !!input.publicClient,
      )

      const request = createTransactionRequest({
        signer: input.signer,
        from: accountAddress,
        to: registrarAddress,
        data: commitmentData,
        value: 0n,
        chainId: input.publicClient.chain?.id ?? sepolia.id,
        calls: [
          {
            to: registrarAddress,
            data: commitmentData,
            value: 0n,
          },
        ],
        sponsored: input.sponsored ?? true,
      })

      const txId = transactionManager.startTransaction(
        {
          type: 'custom',
          request,
        },
        input.signer,
        {
          id: input.id,
          description: `Commit to register ${input.name}.eth`,
          publicClient: input.publicClient,
          timeout: 120_000,
        },
      )

      return txId
    })(),
    (error) => error as Error,
  )
}

/**
 * Read MIN_COMMITMENT_AGE from the registrar contract so the cooldown timer
 * matches the deployment (60s on the production v2 ETHRegistrar).
 */
export function readMinCommitmentAgeActor(input: {
  publicClient: PublicClient
}): ResultAsync<bigint, Error> {
  const registrarAddress = ENS_SEPOLIA_CONTRACTS.ETHRegistrar
  return fromPromise(
    readContract(input.publicClient, {
      address: registrarAddress,
      abi: ethRegistrarMinCommitmentAgeSnippet,
      functionName: 'MIN_COMMITMENT_AGE',
    }),
    (error) => {
      console.warn(
        '⚠️ [REGISTRATION ACTOR] Failed to read MIN_COMMITMENT_AGE, defaulting to 60s:',
        error,
      )
      return error as Error
    },
  )
}

/**
 * Read the current ERC20 allowance the spender (registrar) has on the user's
 * payment token. Used to skip the approval step when the user already
 * approved enough.
 */
export function readPaymentTokenAllowanceActor(input: {
  owner: Address
  selectedToken: 'USDC' | 'DAI'
  publicClient: PublicClient
}): ResultAsync<bigint, Error> {
  const registrarAddress = ENS_SEPOLIA_CONTRACTS.ETHRegistrar
  const tokenAddress = getPaymentTokenAddress(input.selectedToken)
  return fromPromise(
    readContract(input.publicClient, {
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [input.owner, registrarAddress],
    }) as Promise<bigint>,
    (error) => error as Error,
  )
}

/**
 * Verify a name has actually been registered on-chain. Used as a fallback
 * after the submit/poll path fails — if the wallet flaked but the tx
 * landed, the registry will already reflect the new owner + resolver.
 */
export function verifyRegistrationActor(input: {
  name: string
  owner: Address
  resolverAddress: Address
  publicClient: PublicClient
}): ResultAsync<{ verified: boolean }, Error> {
  const registrarAddress = ENS_SEPOLIA_CONTRACTS.ETHRegistrar
  const cleanName = input.name.replace('.eth', '')
  return fromPromise(
    (async () => {
      // ETHRegistrar.REGISTRY() points at the IPermissionedRegistry where
      // entries are stored. Read the registry, then look up the resolver.
      const registryAddress = (await readContract(input.publicClient, {
        address: registrarAddress,
        abi: parseAbi(['function REGISTRY() view returns (address)']),
        functionName: 'REGISTRY',
      })) as Address

      const registryAbi = parseAbi([
        'function getResolver(string label) view returns (address)',
        'function getOwner(string label) view returns (address)',
      ])
      const [resolver, owner] = await multicall(input.publicClient, {
        allowFailure: false,
        contracts: [
          {
            address: registryAddress,
            abi: registryAbi,
            functionName: 'getResolver',
            args: [cleanName],
          },
          {
            address: registryAddress,
            abi: registryAbi,
            functionName: 'getOwner',
            args: [cleanName],
          },
        ],
      })

      // Guard against the front-running scenario: another address could have
      // claimed the label with the same resolver. Require both resolver and
      // owner to match the expected values.
      const resolverMatches =
        !isAddressEqual(resolver, zeroAddress) &&
        isAddressEqual(resolver, input.resolverAddress)
      const ownerMatches =
        !isAddressEqual(owner, zeroAddress) &&
        isAddressEqual(owner, input.owner)
      const matches = resolverMatches && ownerMatches

      return { verified: matches }
    })(),
    (error) => error as Error,
  )
}

/**
 * Validate commitment readiness before proceeding to registration
 * Checks commitmentAt timestamp and MIN_COMMITMENT_AGE from contract
 * This ensures the commitment is recorded on-chain before registration
 */
export function validateCommitmentActor(input: {
  commitment: CommitmentData
  publicClient: PublicClient
}): ResultAsync<void, Error> {
  const registrarAddress = ENS_SEPOLIA_CONTRACTS.ETHRegistrar

  return fromPromise(
    (async () => {
      console.log('🔍 [REGISTRATION ACTOR] Validating commitment readiness...')

      // Helper function to sleep
      const sleep = (ms: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, ms))

      // Check MIN_COMMITMENT_AGE from contract
      let minAge: bigint
      try {
        minAge = await readContract(input.publicClient, {
          address: registrarAddress,
          abi: ethRegistrarMinCommitmentAgeSnippet,
          functionName: 'MIN_COMMITMENT_AGE',
        })
        console.log(
          `📋 [REGISTRATION ACTOR] MIN_COMMITMENT_AGE: ${minAge.toString()} seconds`,
        )
      } catch (error) {
        console.warn(
          '⚠️ [REGISTRATION ACTOR] Failed to fetch MIN_COMMITMENT_AGE, assuming 0:',
          error,
        )
        minAge = 0n
      }

      // Check if commitmentAt is recorded (retry with backoff if not)
      let committedAt: bigint = 0n
      let attempts = 0
      const maxAttempts = 5

      while (committedAt === 0n && attempts < maxAttempts) {
        try {
          committedAt = await readContract(input.publicClient, {
            address: registrarAddress,
            abi: ethRegistrarCommitmentsSnippet,
            functionName: 'commitmentAt',
            args: [input.commitment.commitment],
          })

          if (committedAt === 0n) {
            attempts++
            if (attempts < maxAttempts) {
              console.log(
                `⏳ [REGISTRATION ACTOR] Commitment timestamp not yet recorded, waiting 3s (attempt ${attempts}/${maxAttempts})...`,
              )
              await sleep(3000)
            }
          }
        } catch (error) {
          console.warn(
            '⚠️ [REGISTRATION ACTOR] Failed to fetch commitmentAt:',
            error,
          )
          attempts++
          if (attempts < maxAttempts) {
            await sleep(3000)
          }
        }
      }

      if (committedAt === 0n) {
        throw new Error(
          'Commitment timestamp not recorded after multiple attempts. The commitment transaction may not have been confirmed yet.',
        )
      }

      console.log(
        `✅ [REGISTRATION ACTOR] Commitment recorded at timestamp: ${committedAt.toString()}`,
      )

      // If MIN_COMMITMENT_AGE is 0, we can proceed immediately
      if (minAge === 0n) {
        console.log(
          '✅ [REGISTRATION ACTOR] MIN_COMMITMENT_AGE is 0, commitment is ready',
        )
        return
      }

      // Otherwise, wait until MIN_COMMITMENT_AGE has elapsed
      const latestBlock = await getBlock(input.publicClient)
      const nowTs = latestBlock.timestamp as bigint
      const elapsed = nowTs - committedAt

      if (elapsed < minAge) {
        const waitSeconds = Number(minAge - elapsed)
        console.log(
          `⏳ [REGISTRATION ACTOR] Waiting ${waitSeconds}s for MIN_COMMITMENT_AGE before registering...`,
        )
        await sleep(waitSeconds * 1000)
      } else {
        console.log(
          `✅ [REGISTRATION ACTOR] MIN_COMMITMENT_AGE requirement satisfied (elapsed: ${elapsed.toString()}s, required: ${minAge.toString()}s)`,
        )
      }
    })(),
    (error) => {
      console.error(
        '❌ [REGISTRATION ACTOR] Commitment validation failed:',
        error,
      )
      return error as Error
    },
  )
}

/**
 * Submit token approval transaction via transaction manager
 * Note: Normalizes token address to lowercase for Rhinestone SDK compatibility
 */
export function submitApprovalActor(input: {
  tokenPrice: bigint
  selectedToken: 'USDC' | 'DAI'
  signer: import('../..').Signer
  publicClient: PublicClient
  sponsored?: boolean
  id?: string
}): ResultAsync<string, Error> {
  const registrarAddress = ENS_SEPOLIA_CONTRACTS.ETHRegistrar

  return ResultAsync.fromSafePromise(
    Promise.resolve().then(() => {
      const accountAddress = getSignerAddress(input.signer)

      const tokenAddress = getPaymentTokenAddress(input.selectedToken)
      // Normalize to lowercase to avoid Rhinestone SDK validation issues
      const normalizedTokenAddress = tokenAddress.toLowerCase() as Address
      console.log(
        `🔧 Token address normalization: ${tokenAddress} -> ${normalizedTokenAddress}`,
      )

      const approvalData = encodeTokenApprovalData(
        input.tokenPrice,
        registrarAddress,
      )

      const request = createTransactionRequest({
        signer: input.signer,
        from: accountAddress,
        to: normalizedTokenAddress,
        data: approvalData,
        value: 0n,
        chainId: input.publicClient.chain?.id ?? sepolia.id,
        calls: [
          {
            to: normalizedTokenAddress,
            data: approvalData,
            value: 0n,
          },
        ],
        sponsored: input.sponsored ?? true,
      })

      const txId = transactionManager.startTransaction(
        {
          type: 'custom',
          request,
        },
        input.signer,
        {
          id: input.id,
          description: `Approve ${input.selectedToken} for registration`,
          publicClient: input.publicClient,
          timeout: 120_000,
        },
      )

      return txId
    }),
  ).mapErr((error) => new Error(`Failed to submit approval: ${error}`))
}

/**
 * Submit registration transaction via transaction manager
 * Note: Normalizes payment token address to lowercase for Rhinestone SDK compatibility
 */
export function submitRegistrationActor(input: {
  name: string
  commitment: CommitmentData
  signer: import('../..').Signer
  duration: bigint
  selectedToken: 'USDC' | 'DAI'
  owner: Address
  publicClient: PublicClient
  sponsored?: boolean
  resolverAddress: Address
  id?: string
}): ResultAsync<string, Error> {
  const registrarAddress = ENS_SEPOLIA_CONTRACTS.ETHRegistrar

  return fromPromise(
    (async () => {
      const accountAddress = getSignerAddress(input.signer)

      const paymentToken = getPaymentTokenAddress(input.selectedToken)
      // Normalize to lowercase to avoid Rhinestone SDK validation issues
      const normalizedPaymentToken = paymentToken.toLowerCase() as Address
      console.log(
        `🔧 Payment token normalization: ${paymentToken} -> ${normalizedPaymentToken}`,
      )

      // Validate the token against the registrar's *actual* rent price oracle
      // (see `assertPaymentTokenSupported` for why the registrar itself can't
      // be queried directly).
      await assertPaymentTokenSupported(
        input.publicClient,
        registrarAddress,
        normalizedPaymentToken,
      )

      const registrationData = encodeRegistrationData(
        input.name,
        input.owner,
        input.commitment.secret,
        input.duration,
        normalizedPaymentToken,
        input.resolverAddress,
      )

      const request = createTransactionRequest({
        signer: input.signer,
        from: accountAddress,
        to: registrarAddress,
        data: registrationData,
        value: 0n,
        chainId: input.publicClient.chain?.id ?? sepolia.id,
        calls: [
          {
            to: registrarAddress,
            data: registrationData,
            value: 0n,
          },
        ],
        sponsored: input.sponsored ?? true,
      })

      const txId = transactionManager.startTransaction(
        {
          type: 'custom',
          request,
        },
        input.signer,
        {
          id: input.id,
          description: `Register ${input.name}.eth`,
          publicClient: input.publicClient,
          timeout: 120_000,
        },
      )

      return txId
    })(),
    (error) => error as Error,
  )
}

/**
 * Submit approve + register as a single batched Rhinestone intent.
 * Only valid for rhinestone signers — the two calls execute atomically in order,
 * so the allowance set by approve is visible to register in the same tx.
 */
export function submitApprovalAndRegistrationActor(input: {
  tokenPrice: bigint
  selectedToken: 'USDC' | 'DAI'
  name: string
  commitment: CommitmentData
  signer: import('../..').Signer
  duration: bigint
  owner: Address
  publicClient: PublicClient
  sponsored?: boolean
  resolverAddress: Address
}): ResultAsync<string, Error> {
  const registrarAddress = ENS_SEPOLIA_CONTRACTS.ETHRegistrar

  return fromPromise(
    (async () => {
      const accountAddress = getSignerAddress(input.signer)

      const paymentToken = getPaymentTokenAddress(input.selectedToken)
      const normalizedPaymentToken = paymentToken.toLowerCase() as Address

      await assertPaymentTokenSupported(
        input.publicClient,
        registrarAddress,
        normalizedPaymentToken,
      )

      const approvalData = encodeTokenApprovalData(
        input.tokenPrice,
        registrarAddress,
      )

      const registrationData = encodeRegistrationData(
        input.name,
        input.owner,
        input.commitment.secret,
        input.duration,
        normalizedPaymentToken,
        input.resolverAddress,
      )

      const request = createTransactionRequest({
        signer: input.signer,
        from: accountAddress,
        to: registrarAddress,
        data: registrationData,
        value: 0n,
        chainId: input.publicClient.chain?.id ?? sepolia.id,
        calls: [
          { to: normalizedPaymentToken, data: approvalData, value: 0n },
          { to: registrarAddress, data: registrationData, value: 0n },
        ],
        sponsored: input.sponsored ?? true,
      })

      const txId = transactionManager.startTransaction(
        { type: 'custom', request },
        input.signer,
        {
          description: `Approve ${input.selectedToken} and register ${input.name}.eth`,
          publicClient: input.publicClient,
          timeout: 120_000,
        },
      )

      return txId
    })(),
    (error: unknown) =>
      error instanceof Error ? error : new Error(String(error)),
  )
}

/**
 * Poll transaction status by subscribing to transaction machine
 */
export function pollTransactionStatusActor(input: {
  txId: string
}): ResultAsync<void, Error> {
  const txActor = transactionManager.getTransaction(input.txId)

  if (!txActor) {
    return errAsync(new Error(`Transaction ${input.txId} not found`))
  }

  return fromPromise(
    new Promise<void>((resolve, reject) => {
      const subscription = txActor.subscribe((snapshot) => {
        console.log('🔍 [POLL TX STATUS] Transaction state:', {
          txId: input.txId,
          state: snapshot.value,
          hasError: !!snapshot.context.error,
          error: snapshot.context.error?.message,
        })

        if (snapshot.matches('success' as unknown as never)) {
          console.log('✅ [POLL TX STATUS] Transaction succeeded')
          subscription.unsubscribe()
          resolve()
        }
        // Check if we're in any error state (handles nested states like error.submission, error.reverted, etc.)
        if (typeof snapshot.value === 'object' && 'error' in snapshot.value) {
          console.error('❌ [POLL TX STATUS] Transaction failed:', {
            errorState: snapshot.value,
            error: snapshot.context.error,
          })
          subscription.unsubscribe()
          reject(snapshot.context.error || new Error('Transaction failed'))
        }
      })
    }),
    (error) => error as Error,
  )
}
