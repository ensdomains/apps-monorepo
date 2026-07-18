import { parseAbi } from 'viem'

/**
 * Minimal v2 `ETHRegistrar` ABI needed for server-side commit + reveal.
 * Mirrors the snippets in `@ensdomains/ensjs-abi/v2/ethRegistrar` (which the
 * worker can't import directly). `duration` is `uint64` on-chain.
 */
export const ETH_REGISTRAR_ABI = parseAbi([
  'function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)',
  'function commit(bytes32 commitment)',
  'function commitmentAt(bytes32 commitment) view returns (uint64 commitTime)',
  'function MIN_COMMITMENT_AGE() view returns (uint64)',
  'function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256 tokenId)',
  'function REGISTRY() view returns (address)',
  // Emitted by register; `tokenId` is the ERC-1155 id in the registry, needed
  // to transfer the name to the buyer after the server registers it.
  'event NameRegistered(uint256 indexed tokenId, string label, address owner, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 indexed referrer, uint256 base, uint256 premium)',
])

/**
 * The `IPermissionedRegistry` the registrar writes to — an ERC-1155 token
 * registry. Used to verify a registration and to transfer the name (the
 * registrar charges the `owner`, so the server registers to itself then
 * transfers the token to the buyer; roles move with the token via `_update`).
 */
export const ENS_REGISTRY_ABI = parseAbi([
  'function getResolver(string label) view returns (address)',
  'function getOwner(string label) view returns (address)',
  'function ownerOf(uint256 id) view returns (address)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)',
])

/**
 * `VerifiableFactory.deployProxy` deploys the user's dedicated resolver; the
 * `ProxyDeployed` event carries the deployed proxy address.
 */
export const VERIFIABLE_FACTORY_ABI = parseAbi([
  'function deployProxy(address implementation, uint256 salt, bytes data) returns (address)',
  // Immutable, set in the factory constructor; used to precompute the clone
  // (resolver) CREATE2 address at order time.
  'function proxyLogic() view returns (address)',
  'event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)',
])

/** Dedicated-resolver initializer (owner + role bitmap). */
export const DEDICATED_RESOLVER_INIT_ABI = parseAbi([
  'function initialize(address owner, uint256 bitmap)',
])

/**
 * The BYOC voucher surface fulfilment touches: `commitmentOf` to verify the
 * paid-for commitment before spending, and `burn` (payer must hold BURNER_ROLE)
 * after delivery.
 */
export const VOUCHER_ABI = parseAbi([
  'function commitmentOf(uint256 tokenId) view returns (bytes32)',
  'function burn(uint256 tokenId)',
])

/**
 * Grants the resolver owner every role (mirrors the manager's
 * `DEDICATED_RESOLVER_ROLE_BITMAP`).
 */
export const DEDICATED_RESOLVER_ROLE_BITMAP = BigInt(
  '0x1111111111111111111111111111111111111111111111111111111111111111',
)
