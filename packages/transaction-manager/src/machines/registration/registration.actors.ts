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
  concatHex,
  decodeEventLog,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  getCreate2Address,
  isAddressEqual,
  keccak256,
  maxUint256,
  pad,
  parseAbi,
  parseSignature,
  stringToBytes,
  toHex,
  zeroAddress,
} from 'viem'
import {
  getBlock,
  getEip712Domain,
  multicall,
  readContract,
  signTypedData,
} from 'viem/actions'
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

const verifiableFactoryProxyLogicSnippet = parseAbi([
  'function proxyLogic() view returns (address)',
])

/**
 * Counterfactually compute the dedicated-resolver proxy address that
 * `VerifiableFactory.deployProxy(impl, salt, data)` will deploy, WITHOUT waiting
 * for the deploy transaction to mine. This lets the rhinestone flow batch
 * resolver-deploy + commit into a single Intent (the commitment needs the
 * resolver address up front).
 *
 * Mirrors the on-chain derivation exactly (verified against live ProxyDeployed
 * events):
 *   outerSalt    = keccak256(abi.encode(deployer, userSalt))
 *   creationCode = 0x3d604d80600a3d3981f3363d3d373d3d3d363d73 ++ proxyLogic(20)
 *                  ++ 5af43d82803e903d91602b57fd5bf3 ++ outerSalt(32)
 *   address      = CREATE2(factory, outerSalt, keccak256(creationCode))
 *
 * `deployer` is the account that calls `deployProxy` — i.e. the rhinestone HCA
 * (the `from`/sender of the Intent), NOT the EOA owner.
 *
 * See verifiable-factory `VerifiableFactory.sol` / `CloneProxyBytecode.sol`.
 */
export async function predictResolverAddress(input: {
  publicClient: PublicClient
  deployer: Address
  salt: bigint
}): Promise<Address> {
  const factory = ENS_SEPOLIA_CONTRACTS.VerifiableFactory
  const proxyLogic = (await readContract(input.publicClient, {
    address: factory,
    abi: verifiableFactoryProxyLogicSnippet,
    functionName: 'proxyLogic',
  })) as Address

  const outerSalt = keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'uint256' }],
      [input.deployer, input.salt],
    ),
  )

  // EIP-1167 clone creation code with the salt appended (CREATION_CODE_LENGTH
  // = 0x57 = 87 bytes): creation stub + runtime + 20-byte logic + 32-byte salt.
  const creationCode = concatHex([
    '0x3d604d80600a3d3981f3363d3d373d3d3d363d73',
    proxyLogic,
    '0x5af43d82803e903d91602b57fd5bf3',
    pad(outerSalt, { size: 32 }),
  ])

  return getCreate2Address({
    from: factory,
    salt: outerSalt,
    bytecodeHash: keccak256(creationCode),
  })
}

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
 * Encode token approval transaction data.
 *
 * Infinite approve to the registrar. The ENS registrar pulls the payment
 * token from the name owner (the EOA) on every registration, and on HCA flows
 * that approve is a direct EOA tx (the HCA can't approve on the EOA's behalf
 * and the mock tokens have no EIP-2612 permit, so it can't be gasless). A
 * one-time max approve means the EOA pays approve-gas only once instead of on
 * every registration; subsequent registrations skip the approve entirely
 * (`checkingAllowance` sees `maxUint256 >= price`). The registrar is a trusted
 * ENS contract.
 */
function encodeTokenApprovalData(registrarAddress: Address): Hash {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [registrarAddress, maxUint256],
  })
}

/**
 * EIP-2612 permit interface. This is a standard ERC-20 extension, so the ABI is
 * identical regardless of the token implementation: `nonces`/`name` are read to
 * build the EIP-712 domain + message, and `permit` is the call that consumes
 * the owner's off-chain signature to set an allowance with no owner-sent tx.
 */
const erc2612Snippet = parseAbi([
  'function nonces(address owner) view returns (uint256)',
  'function name() view returns (string)',
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
])

/**
 * A signed EIP-2612 permit, ready to be encoded into a `permit(...)` call.
 */
export type PermitSignature = {
  owner: Address
  spender: Address
  value: bigint
  deadline: bigint
  v: number
  r: Hex
  s: Hex
}

// Validity window for a permit signature. Comfortably covers the commitment
// cooldown (~60s) plus relayer latency. Permits are single-use (nonce-bound),
// so a generous deadline is not a replay risk.
const PERMIT_DEADLINE_SECONDS = 60 * 60

/**
 * Encode an EIP-2612 `permit` call from a signed permit.
 */
function encodePermitData(permit: PermitSignature): Hex {
  return encodeFunctionData({
    abi: erc2612Snippet,
    functionName: 'permit',
    args: [
      permit.owner,
      permit.spender,
      permit.value,
      permit.deadline,
      permit.v,
      permit.r,
      permit.s,
    ],
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
 * Rhinestone-only: deploy the dedicated resolver AND submit the ENS commitment
 * in a SINGLE sponsored Intent.
 *
 * The resolver address is counterfactually predicted (see
 * `predictResolverAddress`) so the commitment — which must bind to the resolver
 * — can be generated before the resolver is mined. Both calls go in one
 * `calls[]` bundle; if the HCA isn't deployed yet, the Rhinestone SDK deploys it
 * inline via the account's factory initCode on this first Intent. This collapses
 * the old three-Intent setup (resolver-deploy, HCA-deploy, commit) into one
 * signature.
 *
 * Returns the bundle `txId`, the predicted `resolverAddress`, and the generated
 * `commitment` so the machine can poll the Intent and later submit the matching
 * register call.
 */
export function submitResolverAndCommitmentActor(input: {
  name: string
  owner: Address
  resolverOwner: Address
  duration: bigint
  selectedToken: 'USDC' | 'DAI'
  signer: import('../..').Signer
  publicClient: PublicClient
  sponsored?: boolean
  id?: string
}): ResultAsync<
  { txId: string; resolverAddress: Address; commitment: CommitmentData },
  Error
> {
  const registrarAddress = ENS_SEPOLIA_CONTRACTS.ETHRegistrar

  return fromPromise(
    (async () => {
      // The HCA (Intent sender) is the deployer that calls `deployProxy`, so it
      // must be the CREATE2 `deployer` used to predict the resolver address.
      const accountAddress = getSignerAddress(input.signer)

      const salt = generateResolverSalt(input.name)
      const initCalldata = getResolverInitCalldata(input.resolverOwner)

      const resolverAddress = await predictResolverAddress({
        publicClient: input.publicClient,
        deployer: accountAddress,
        salt,
      })

      const deployCalldata = encodeFunctionData({
        abi: VERIFIABLE_FACTORY_ABI,
        functionName: 'deployProxy',
        args: [ENS_SEPOLIA_CONTRACTS.DedicatedResolverImpl, salt, initCalldata],
      })

      // Commitment binds to the (predicted) resolver, the owner, and the price
      // token — exactly what the later `register` call will use.
      const commitmentResult = await generateCommitment(
        input.publicClient,
        input.name,
        input.owner,
        input.duration,
        resolverAddress,
        registrarAddress,
      )
      if (commitmentResult.isErr()) {
        throw commitmentResult.error
      }
      const commitment = commitmentResult.value

      const commitmentData = encodeCommitmentData(commitment.commitment)

      const request = createTransactionRequest({
        signer: input.signer,
        from: accountAddress,
        to: registrarAddress,
        data: commitmentData,
        value: 0n,
        chainId: input.publicClient.chain?.id ?? sepolia.id,
        // One Intent, two calls: deploy the resolver, then commit. Order matters
        // only for atomicity here (commit doesn't read the resolver on-chain),
        // but keeping deploy first mirrors the standalone flow.
        calls: [
          {
            to: ENS_SEPOLIA_CONTRACTS.VerifiableFactory,
            data: deployCalldata,
            value: 0n,
          },
          {
            to: registrarAddress,
            data: commitmentData,
            value: 0n,
          },
        ],
        sponsored: input.sponsored ?? true,
      })

      const txId = transactionManager.startTransaction(
        { type: 'custom', request },
        input.signer,
        {
          id: input.id,
          description: `Set up registration for ${input.name}.eth`,
          publicClient: input.publicClient,
          timeout: 120_000,
        },
      )

      return { txId, resolverAddress, commitment }
    })(),
    (error) =>
      error instanceof Error
        ? error
        : new Error(`Failed to submit resolver+commitment bundle: ${error}`),
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

      const approvalData = encodeTokenApprovalData(registrarAddress)

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
 * Produce an EIP-2612 permit signature authorizing the registrar to pull the
 * payment token from the name owner (the EOA).
 *
 * This is an OFF-CHAIN signature (gasless): the EOA never sends a transaction.
 * The on-chain `permit` call is executed later inside the sponsored Warp bundle
 * (see {@link submitPermitAndRegistrationActor}), so the owner needs no native
 * ETH. `permit` validates the signature against `owner` rather than
 * `msg.sender`, so the HCA can carry the EOA's permit in a sponsored intent and
 * it still sets `allowance[EOA][registrar]`.
 */
export function signPermitActor(input: {
  owner: Address
  selectedToken: 'USDC' | 'DAI'
  value: bigint
  approvalSigner: import('../..').Signer
  publicClient: PublicClient
}): ResultAsync<PermitSignature, Error> {
  const registrarAddress = ENS_SEPOLIA_CONTRACTS.ETHRegistrar
  const tokenAddress = getPaymentTokenAddress(input.selectedToken)

  // Permit signatures are an EOA capability — the rhinestone HCA can't produce
  // one. The name owner is always the EOA, so an EOA `approvalSigner` is
  // required here.
  if (input.approvalSigner.type !== 'eoa') {
    return errAsync(
      new Error('Permit signing requires an EOA signer (the name owner).'),
    )
  }

  const walletClient = input.approvalSigner.walletClient
  const account = walletClient.account
  if (!account) {
    return errAsync(new Error('EOA wallet client has no account connected'))
  }
  if (!isAddressEqual(account.address, input.owner)) {
    return errAsync(
      new Error(
        `Permit signer ${account.address} does not match the token owner ${input.owner}`,
      ),
    )
  }

  return fromPromise(
    (async () => {
      const chainId = input.publicClient.chain?.id ?? sepolia.id

      const nonce = (await readContract(input.publicClient, {
        address: tokenAddress,
        abi: erc2612Snippet,
        functionName: 'nonces',
        args: [input.owner],
      })) as bigint

      // Resolve the EIP-712 domain. Prefer ERC-5267 `eip712Domain()` (exact
      // name + version straight from the token); fall back to `name()` with
      // version "1" (the OpenZeppelin ERC20Permit default) for tokens that
      // don't implement ERC-5267.
      let domain: {
        name: string
        version: string
        chainId: number
        verifyingContract: Address
      }
      try {
        const resolved = await getEip712Domain(input.publicClient, {
          address: tokenAddress,
        })
        domain = {
          name: resolved.domain.name ?? '',
          version: resolved.domain.version ?? '1',
          chainId: Number(resolved.domain.chainId ?? chainId),
          verifyingContract:
            (resolved.domain.verifyingContract as Address) ?? tokenAddress,
        }
      } catch {
        const name = (await readContract(input.publicClient, {
          address: tokenAddress,
          abi: erc2612Snippet,
          functionName: 'name',
        })) as string
        domain = {
          name,
          version: '1',
          chainId,
          verifyingContract: tokenAddress,
        }
      }

      const deadline = BigInt(
        Math.floor(Date.now() / 1000) + PERMIT_DEADLINE_SECONDS,
      )

      const signature = await signTypedData(walletClient, {
        account,
        domain,
        types: {
          Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        },
        primaryType: 'Permit',
        message: {
          owner: input.owner,
          spender: registrarAddress,
          value: input.value,
          nonce,
          deadline,
        },
      })

      const { r, s, v, yParity } = parseSignature(signature)

      return {
        owner: input.owner,
        spender: registrarAddress,
        value: input.value,
        deadline,
        v: Number(v ?? BigInt(yParity + 27)),
        r,
        s,
      } satisfies PermitSignature
    })(),
    (error) => {
      console.error('❌ [REGISTRATION ACTOR] Permit signing failed:', error)
      return error instanceof Error ? error : new Error(String(error))
    },
  )
}

/**
 * Submit permit + register as a single batched, Warp-sponsored Rhinestone
 * intent. Only valid for rhinestone signers — the two calls execute atomically
 * in order, so the allowance set by `permit` is visible to `register` in the
 * same tx. The EOA paid no gas and sent no tx; it only signed the permit.
 */
export function submitPermitAndRegistrationActor(input: {
  permit: PermitSignature
  selectedToken: 'USDC' | 'DAI'
  name: string
  commitment: CommitmentData
  signer: import('../..').Signer
  duration: bigint
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
      const normalizedPaymentToken = paymentToken.toLowerCase() as Address

      await assertPaymentTokenSupported(
        input.publicClient,
        registrarAddress,
        normalizedPaymentToken,
      )

      const permitData = encodePermitData(input.permit)

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
          { to: normalizedPaymentToken, data: permitData, value: 0n },
          { to: registrarAddress, data: registrationData, value: 0n },
        ],
        sponsored: input.sponsored ?? true,
      })

      const txId = transactionManager.startTransaction(
        { type: 'custom', request },
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

/**
 * Ensure the HCA is deployed on-chain before routing transactions through it.
 *
 * For Rhinestone signers: checks `account.isDeployed(chain)` and, if the
 * HCA is not yet on-chain, submits a sponsored Intent that runs the factory
 * `createAccount(initData)` deploy. For EOA signers or already-deployed
 * HCAs this is a no-op.
 *
 * The HCA holds no funds — gas is paid by the Warp relayer; only the owner
 * signs the Intent mandate once. Safe to call multiple times.
 */
export function ensureHcaDeployedActor(input: {
  signer: Signer
}): ResultAsync<void, Error> {
  if (input.signer.type !== 'rhinestone') {
    return ResultAsync.fromSafePromise(Promise.resolve())
  }

  const { account, config } = input.signer
  const chain = config.chain

  if (!chain) {
    return errAsync(new Error('Rhinestone signer missing chain config'))
  }

  return fromPromise(
    (async () => {
      if (await account.isDeployed(chain)) {
        return
      }

      console.log(
        '🔧 [ENSURE HCA] HCA not deployed, deploying via sponsored Intent...',
      )

      const { factory, factoryData } = account.getInitData()

      const prepared = await account.prepareTransaction({
        chain,
        sponsored: true,
        calls: [
          {
            to: factory,
            value: 0n,
            data: factoryData,
          },
        ],
      })
      const signed = await account.signTransaction(prepared)
      const result = await account.submitTransaction(signed)
      await account.waitForExecution(result)

      console.log('✅ [ENSURE HCA] HCA deployed successfully')
    })(),
    (error) => {
      console.error('❌ [ENSURE HCA] HCA deployment failed:', error)
      return error instanceof Error ? error : new Error(String(error))
    },
  )
}
