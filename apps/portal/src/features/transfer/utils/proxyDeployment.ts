/**
 * Shared helpers for deploying VerifiableFactory proxies (dedicated resolvers)
 * during a transfer.
 *
 * Mirrors the registration flow's resolver deployment
 * (`packages/transaction-manager/src/machines/registration/registration.actors.ts`):
 * the new resolver is initialised with the *recipient* as admin so the new
 * owner — not the sender — controls it after the transfer.
 */

import {
  type Address,
  bytesToHex,
  encodeFunctionData,
  type Hex,
  keccak256,
  parseAbi,
  stringToBytes,
  type TransactionReceipt,
} from 'viem'

const DEDICATED_RESOLVER_INIT_ABI = parseAbi([
  'function initialize(address owner, uint256 bitmap)',
])

// Full permissions for the dedicated resolver admin (one nybble per role),
// matching the registration flow's `DEDICATED_RESOLVER_ROLE_BITMAP`.
const DEDICATED_RESOLVER_ROLE_BITMAP = BigInt(
  '0x1111111111111111111111111111111111111111111111111111111111111111',
)

/**
 * CSPRNG salt for `VerifiableFactory.deployProxy`. Not `Date.now()`/
 * `Math.random()` — the CREATE2 address is bound to the deployer + salt, so the
 * salt should be unpredictable.
 */
export const generateResolverSalt = (name: string): bigint => {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32))
  return BigInt(keccak256(stringToBytes(`${name}:${bytesToHex(randomBytes)}`)))
}

/** `initialize(recipient, bitmap)` calldata so the recipient admins the resolver. */
export const getResolverInitCalldata = (ownerAddress: Address): Hex =>
  encodeFunctionData({
    abi: DEDICATED_RESOLVER_INIT_ABI,
    functionName: 'initialize',
    args: [ownerAddress, DEDICATED_RESOLVER_ROLE_BITMAP],
  })

/**
 * Extract a freshly-deployed proxy address from a deploy receipt. A
 * `deployProxy` call leaves `receipt.contractAddress` empty (the tx target is
 * the factory), so the proxy address surfaces as the emitter of the first log
 * (the proxy's own `initialize` events). Matches the existing
 * `deploySubregistry` helper.
 */
export const extractDeployedAddress = (
  receipt: TransactionReceipt | undefined,
): Address | undefined => {
  if (!receipt) return undefined
  if (receipt.contractAddress) return receipt.contractAddress
  return receipt.logs[0]?.address
}
