// The validator's session-authorization owner check, mirrored from contracts-v2 `HCASmartSessionLib` and `HCASignatureLib`.

import {
  type Address,
  concat,
  encodeAbiParameters,
  type Hex,
  hashMessage,
  hexToNumber,
  isAddressEqual,
  keccak256,
  maxUint64,
  recoverAddress,
  size,
  slice,
  zeroAddress,
} from 'viem'
import type { ChainDigest } from './session'

const SMART_SESSION_DOMAIN_SEPARATOR =
  '0xe4b7e03cf1e8e7a6af0eec6f72a68d532e03fdaad0b8326461731cb31803a084'
const CHAIN_SESSION_TYPEHASH =
  '0xabc350ff4773ba356e85e2d2ee58d7d7511767acdb108b59058f5b4a5afc074b'
const MULTI_CHAIN_SESSION_TYPEHASH =
  '0xb4323194e4ca3723804b96dc7a0960bde1afff2b080b8b288fdc264c82e21357'
const HALF_CURVE_ORDER =
  0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n
const SIGNATURE_LENGTH = 65
// The SDK prefixes the owner signature with the (zero) validator address.
const VALIDATOR_PREFIX_LENGTH = 20

/** The digest the owner signs to authorize the session set: the validator's `multiChainDigest`. */
export const getSessionAuthorizationDigest = (
  hashesAndChainIds: readonly ChainDigest[],
): Hex => {
  const chainSessionHashes = hashesAndChainIds.map(
    ({ chainId, sessionDigest }) =>
      keccak256(
        encodeAbiParameters(
          [{ type: 'bytes32' }, { type: 'uint64' }, { type: 'bytes32' }],
          [CHAIN_SESSION_TYPEHASH, chainId, sessionDigest],
        ),
      ),
  )
  const structHash = keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'bytes32' }],
      [MULTI_CHAIN_SESSION_TYPEHASH, keccak256(concat(chainSessionHashes))],
    ),
  )
  return keccak256(
    concat(['0x1901', SMART_SESSION_DOMAIN_SEPARATOR, structHash]),
  )
}

/** A stored digest the validator could decode: a uint64 chain id and a 32-byte session digest. */
const isEncodableChainDigest = ({ chainId, sessionDigest }: ChainDigest) =>
  chainId >= 0n && chainId <= maxUint64 && size(sessionDigest) === 32

/** The signer the validator recovers, or `null` where it would recover none. */
const recoverValidatorSigner = async (
  digest: Hex,
  signature: Hex,
): Promise<Address | null> => {
  if (size(signature) !== SIGNATURE_LENGTH) return null
  const r = slice(signature, 0, 32)
  const s = slice(signature, 32, 64)
  const v = hexToNumber(slice(signature, 64, 65))
  const isEthSigned = v === 31 || v === 32
  const recoveryV = isEthSigned ? v - 4 : v < 27 ? v + 27 : v
  if (recoveryV !== 27 && recoveryV !== 28) return null
  if (BigInt(s) > HALF_CURVE_ORDER) return null
  return recoverAddress({
    hash: isEthSigned ? hashMessage({ raw: digest }) : digest,
    signature: { r, s, v: BigInt(recoveryV) },
  }).catch(() => null)
}

/** Whether the validator would accept the SDK's `userSignature` as `owner`'s authorization. */
export const isOwnerSessionAuthorization = async (params: {
  readonly owner: Address
  readonly hashesAndChainIds: readonly ChainDigest[]
  readonly userSignature: Hex
}): Promise<boolean> => {
  if (
    !params.hashesAndChainIds.every(isEncodableChainDigest) ||
    size(params.userSignature) !== VALIDATOR_PREFIX_LENGTH + SIGNATURE_LENGTH ||
    !isAddressEqual(
      slice(params.userSignature, 0, VALIDATOR_PREFIX_LENGTH),
      zeroAddress,
    )
  )
    return false
  const signer = await recoverValidatorSigner(
    getSessionAuthorizationDigest(params.hashesAndChainIds),
    slice(params.userSignature, VALIDATOR_PREFIX_LENGTH),
  )
  return signer !== null && isAddressEqual(signer, params.owner)
}
