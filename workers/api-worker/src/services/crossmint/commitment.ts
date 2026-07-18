import {
  type Address,
  concatHex,
  encodeAbiParameters,
  getCreate2Address,
  type Hex,
  keccak256,
  pad,
  toHex,
} from 'viem'

/**
 * Pure, RPC-free reconstruction of the two on-chain-derived values the Crossmint
 * flow must fix at ORDER time (before the voucher is minted with its commitment):
 * the buyer's dedicated-resolver address (CREATE2, counterfactual) and the
 * commit-reveal commitment that binds the BUYER as the name's owner.
 *
 * Why order-time: the voucher stores `commitment`, and fulfilment checks that
 * stored value against what it's about to register (see fulfilment.ts). For the
 * check to be meaningful the commitment must bind the real owner (the buyer) and
 * the real resolver — but the resolver isn't deployed until fulfilment. It's a
 * CREATE2 clone with a deterministic address, so we precompute it here from a
 * salt derived from the order secret, then deploy to that exact address later.
 *
 * The registrar charges `msg.sender` (verified: ETHRegistrar.register does
 * `safeTransferFrom(paymentToken, msg.sender, BENEFICIARY, ...)`), NOT the
 * `owner` arg — so the payer (the Safe, via the Roles modifier) funds the
 * registration while the name mints straight to the buyer. No transfer step.
 */

// ── VerifiableFactory CREATE2 (matches lib/verifiable-factory) ──────────────────
//
// deployProxy: outerSalt = keccak256(abi.encode(msg.sender, userSalt));
//   proxy = CREATE2(factory, outerSalt, CloneProxyBytecode.creationCode(proxyLogic, outerSalt))
// CloneProxyBytecode.creationCode = 0x57-byte EIP-1167 creation stub (PUSH20
//   proxyLogic) with the 32-byte outerSalt appended for the clone's extcodecopy.
const CLONE_PREFIX = '0x3d604d80600a3d3981f3363d3d373d3d3d363d73' as const
const CLONE_SUFFIX = '0x5af43d82803e903d91602b57fd5bf3' as const

function cloneCreationCode(proxyLogic: Address, outerSalt: Hex): Hex {
  return concatHex([CLONE_PREFIX, proxyLogic, CLONE_SUFFIX, outerSalt])
}

/**
 * The deterministic user salt for the resolver deploy, derived from the order
 * secret so it's stable across the order and fulfilment phases without storing a
 * separate value. `deployProxy` takes a uint256 salt; the 32-byte keccak fits.
 */
export function resolverUserSalt(secret: Hex): Hex {
  return keccak256(secret)
}

/**
 * Counterfactual address of the buyer's dedicated resolver. `deployer` is the
 * identity that will call `deployProxy` (the Safe in Roles mode, the EOA in
 * direct mode) — it's mixed into the CREATE2 salt by the factory, so the
 * precompute must use the same identity that later deploys.
 */
export function computeResolverAddress(params: {
  factory: Address
  proxyLogic: Address
  deployer: Address
  secret: Hex
}): Address {
  const userSalt = resolverUserSalt(params.secret)
  const outerSalt = keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'uint256' }],
      [params.deployer, BigInt(userSalt)],
    ),
  )
  return getCreate2Address({
    from: params.factory,
    salt: outerSalt,
    bytecodeHash: keccak256(cloneCreationCode(params.proxyLogic, outerSalt)),
  })
}

/**
 * Local reconstruction of `ETHRegistrar.makeCommitment` — keccak256 over the
 * abi-encoded (label, owner, secret, subregistry, resolver, duration, referrer)
 * tuple. Kept in lockstep with the on-chain `makeCommitment` (asserted against
 * it in the register phase, so any ABI drift fails a real order rather than
 * silently mis-binding).
 */
export function computeCommitment(params: {
  label: string
  owner: Address
  secret: Hex
  subregistry: Address
  resolver: Address
  duration: bigint
  referrer: Hex
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'string' },
        { type: 'address' },
        { type: 'bytes32' },
        { type: 'address' },
        { type: 'address' },
        { type: 'uint64' },
        { type: 'bytes32' },
      ],
      [
        params.label,
        params.owner,
        pad(params.secret, { size: 32 }),
        params.subregistry,
        params.resolver,
        params.duration,
        pad(params.referrer, { size: 32 }),
      ],
    ),
  )
}

/** Normalizes a uint256 salt to the 0x-hex form `deployProxy` expects as an arg. */
export function saltToHex(secret: Hex): Hex {
  return toHex(BigInt(resolverUserSalt(secret)), { size: 32 })
}
