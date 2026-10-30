import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { err, ok, ResultAsync } from 'neverthrow'
import type { Address, Hex, PublicClient } from 'viem'
import {
  BaseError,
  ContractFunctionRevertedError,
  concat,
  encodeAbiParameters,
  encodeErrorResult,
  isAddressEqual,
  keccak256,
  parseAbi,
  recoverAddress,
  stringToHex,
} from 'viem'
import type { PermitSignature } from '../machines/registration/registration.actors'

const MAINNET_USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const INVALID_SIGNATURE = encodeErrorResult({
  abi: [
    {
      type: 'error',
      name: 'Error',
      inputs: [{ name: 'message', type: 'string' }],
    },
  ],
  errorName: 'Error',
  args: ['EIP2612: invalid signature'],
})
const MAX_CANONICAL_S =
  0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n
const PERMIT_TYPEHASH = keccak256(
  stringToHex(
    'Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)',
  ),
)
const PERMIT_ABI = parseAbi([
  'function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function nonces(address owner) view returns (uint256)',
])

export class HcaPermitValidationError extends TaggedError(
  'HcaPermitValidationError',
)<{
  readonly cause: unknown
}> {
  constructor(input: { readonly cause: unknown }) {
    super({
      ...input,
      message:
        input.cause instanceof Error
          ? input.cause.message
          : String(input.cause),
    })
  }
}

export const isCanonicalHcaUsdc = (chainId: number, token: Address): boolean =>
  chainId === 1 && isAddressEqual(token, MAINNET_USDC)

interface PermitEvidence {
  readonly chainId: number
  readonly token: Address
  readonly permit: PermitSignature
  readonly ownerCode: Hex | undefined
  readonly domainSeparator: Hex
  readonly nonce: bigint
  readonly timestamp: bigint
  readonly revertData: Hex | undefined
}

/** Pure proof against the token's own snapshot, never an assumed typed-data domain. */
export const classifyHcaUsdcPermit = ResultFn(async function* (
  input: PermitEvidence,
) {
  const { permit } = input
  if (
    !isCanonicalHcaUsdc(input.chainId, input.token) ||
    !/^0xef0100[\da-f]{40}$/i.test(input.ownerCode ?? '') ||
    input.revertData !== INVALID_SIGNATURE ||
    permit.deadline < input.timestamp ||
    (permit.v !== 27 && permit.v !== 28) ||
    BigInt(permit.s) > MAX_CANONICAL_S
  ) {
    return err(
      new HcaPermitValidationError({
        cause:
          'Permit rejection is not a proven delegated-wallet incompatibility.',
      }),
    )
  }
  const structHash = keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'address' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'uint256' },
      ],
      [
        PERMIT_TYPEHASH,
        permit.owner,
        permit.spender,
        permit.value,
        input.nonce,
        permit.deadline,
      ],
    ),
  )
  const digest = keccak256(
    concat(['0x1901', input.domainSeparator, structHash]),
  )
  const recovered = yield* ResultAsync.fromPromise(
    recoverAddress({
      hash: digest,
      signature: { r: permit.r, s: permit.s, v: BigInt(permit.v) },
    }),
    (cause) => new HcaPermitValidationError({ cause }),
  )
  return isAddressEqual(recovered, permit.owner)
    ? ok('approval-required' as const)
    : err(
        new HcaPermitValidationError({
          cause:
            'The permit does not recover its owner against the current token nonce and domain.',
        }),
      )
})

/** IO adapter: simulation and all proof reads share one pinned block number. */
export const validateHcaUsdcPermit = ResultFn(async function* (input: {
  readonly publicClient: PublicClient
  readonly chainId: number
  readonly token: Address
  readonly permit: PermitSignature
}) {
  const { publicClient, permit, token, chainId } = input
  if (publicClient.chain?.id !== chainId)
    return err(
      new HcaPermitValidationError({ cause: 'The funding network changed.' }),
    )
  const blockNumber = yield* ResultAsync.fromPromise(
    publicClient.getBlockNumber({ cacheTime: 0 }),
    (cause) => new HcaPermitValidationError({ cause }),
  )
  const simulation = await ResultAsync.fromPromise(
    publicClient.simulateContract({
      address: token,
      abi: PERMIT_ABI,
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
      account: permit.spender,
      blockNumber,
    }),
    (cause) => new HcaPermitValidationError({ cause }),
  )
  if (simulation.isOk()) return ok('permit' as const)
  const cause = simulation.error.cause
  const revert =
    cause instanceof BaseError
      ? cause.walk((error) => error instanceof ContractFunctionRevertedError)
      : undefined
  if (
    !(revert instanceof ContractFunctionRevertedError) ||
    revert.raw !== INVALID_SIGNATURE
  )
    return err(simulation.error)
  const [ownerCode, domainSeparator, nonce, block] =
    yield* ResultAsync.fromPromise(
      Promise.all([
        publicClient.getCode({ address: permit.owner, blockNumber }),
        publicClient.readContract({
          address: token,
          abi: PERMIT_ABI,
          functionName: 'DOMAIN_SEPARATOR',
          blockNumber,
        }),
        publicClient.readContract({
          address: token,
          abi: PERMIT_ABI,
          functionName: 'nonces',
          args: [permit.owner],
          blockNumber,
        }),
        publicClient.getBlock({ blockNumber }),
      ]),
      (cause) => new HcaPermitValidationError({ cause }),
    )
  return classifyHcaUsdcPermit({
    chainId,
    token,
    permit,
    ownerCode,
    domainSeparator,
    nonce,
    timestamp: block.timestamp,
    revertData: revert.raw,
  })
})
