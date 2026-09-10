// Pure helpers and domain logic for MigrationTestPanel — no React, fully testable.

import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { registrySetApprovalForAllSnippet } from '@ensdomains/ensjs-abi/registry'
import {
  baseRegistrarAddControllerSnippet,
  baseRegistrarControllersSnippet,
  baseRegistrarOwnerSnippet,
  baseRegistrarRegisterSnippet,
} from '@ensdomains/ensjs-abi/v1/baseRegistrar'
import {
  nameWrapperSetFusesSnippet,
  nameWrapperSetSubnodeOwnerSnippet,
  nameWrapperWrapEth2ldSnippet,
} from '@ensdomains/ensjs-abi/v1/nameWrapper'
import { userRegistryRegisterSnippet } from '@ensdomains/ensjs-abi/v2/userRegistry'
import {
  type Address,
  concat,
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
  hexToBytes,
  keccak256,
  parseAbi,
  toBytes,
  toHex,
} from 'viem'

const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]

// --- V1 contract addresses --------------------------------------------------
// V1 contracts sourced from the ensjs Sepolia chain config (same source as
// preflightChecks.ts) so they can't drift from the canonical deployment.
export const V1_BASE_REGISTRAR =
  ensjsSepolia.ensBaseRegistrarImplementation.address
export const V1_NAME_WRAPPER = ensjsSepolia.ensNameWrapper.address
// Fallback owner of the official Sepolia BaseRegistrar — impersonated to
// re-authorize DEFAULT_ACCOUNT as a controller. ENS revoked all V1 controllers
// at ~block 10927919 as part of the V2 migration cutover.
//
// The registrar's `owner()` has since been transferred on Sepolia, so this
// constant is only a last-resort fallback: `ensureFunded()` reads the live
// `owner()` off the fork and impersonates THAT. Hardcoding the owner is what
// silently broke name creation once ownership moved — impersonating a non-owner
// makes `addController` revert, so DEFAULT_ACCOUNT never becomes a controller
// and every `register()` reverts, leaving phantom names that only exist in the
// subgraph mock.
export const V1_BASE_REGISTRAR_OWNER =
  '0xB359d7d04F750E9C008A5a47Bd2b64134bD180F9' as const
export const V1_PUBLIC_RESOLVER =
  '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5' as const

/**
 * Resolver used by the record-bearing presets.
 *
 * It MUST be one of `KNOWN_PUBLIC_RESOLVERS` in @ens-apps/migration, because
 * `resolverStrategyFor` only returns `to-owned-permres` — the branch that
 * actually replays records onto a fresh owned resolver — for a *recognised*
 * public resolver. An unrecognised one yields `keep-v1`, where the V2 name is
 * simply pointed back at the V1 resolver and nothing is replayed. Using
 * V1_PUBLIC_RESOLVER (0xE99638b4…, not in that list) would therefore make a
 * "records" fixture silently exercise the wrong path.
 */
export const V1_RECORD_RESOLVER =
  '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD' as const

/**
 * Resolver used by the `custom-resolver` preset — the mirror image of
 * V1_RECORD_RESOLVER: a resolver the user deployed themselves, so it is not in
 * `KNOWN_PUBLIC_RESOLVERS` and `resolverStrategyFor` degrades to `keep-v1`.
 *
 * It must NOT be V1_PUBLIC_RESOLVER, even though that address is also
 * unrecognised: `reserveKnownAvailableNameInV2` writes V1_PUBLIC_RESOLVER into
 * the V2 registry slot of EVERY seeded name at reservation time, so a fixture
 * using it cannot distinguish "migration carried the custom resolver across"
 * from "the reservation default was never overwritten". A distinct address makes
 * that read unambiguous.
 *
 * Nothing is deployed here on Sepolia — `ensureCustomResolverDeployed` clones
 * the live PublicResolver's runtime code onto this address on the fork. The
 * clone starts with empty record storage and its immutable ENS-registry and
 * NameWrapper wiring is baked into that code, so it authorises writes exactly
 * like a self-deployed resolver would.
 */
export const V1_CUSTOM_RESOLVER =
  '0xC0FFEe0000000000000000000000000000000001' as const

/**
 * Manager (V1 registry `owner`) used by the `managed` preset — Anvil account 1,
 * deliberately different from DEFAULT_ACCOUNT (the registrant).
 *
 * `classifyNames` only sets `managerAddress` when the registry owner differs
 * from the registrant, and that is the sole trigger for the ETHRegistry
 * approval and its revocation. Without this preset that whole branch is
 * unreachable from the UI.
 */
export const V1_DISTINCT_MANAGER =
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const

/**
 * Anvil account 2 — a third party, distinct from both DEFAULT_ACCOUNT and
 * V1_DISTINCT_MANAGER. Used by `owner-not-manager` so the controller sits with
 * somebody who is neither the registrant nor the usual "other" account.
 */
export const V1_THIRD_ACCOUNT =
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as const

/** BaseRegistrar.reclaim sets the V1 registry owner (manager) for a token. */
const baseRegistrarReclaimSnippet = parseAbi([
  'function reclaim(uint256 id, address owner)',
])

/**
 * The classic ENS registry. `ensjsSepolia.ensRegistry` is the **V2** registry in
 * this manifest, so the V1 one has to be named explicitly. Deterministic
 * deployment — same address on mainnet and Sepolia.
 */
export const V1_ENS_REGISTRY =
  '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as const

const setResolverSnippet = parseAbi([
  'function setResolver(bytes32 node, address resolver)',
])
const resolverWriteSnippet = parseAbi([
  'function setText(bytes32 node, string key, string value)',
  'function setAddr(bytes32 node, uint256 coinType, bytes a)',
  'function setContenthash(bytes32 node, bytes hash)',
  'function setABI(bytes32 node, uint256 contentType, bytes data)',
  'function setPubkey(bytes32 node, bytes32 x, bytes32 y)',
  'function setInterface(bytes32 node, bytes4 interfaceID, address implementer)',
])
const resolverReadSnippet = parseAbi([
  'function text(bytes32 node, string key) view returns (string)',
  'function addr(bytes32 node, uint256 coinType) view returns (bytes)',
  'function contenthash(bytes32 node) view returns (bytes)',
  'function ABI(bytes32 node, uint256 contentTypes) view returns (uint256, bytes)',
  'function pubkey(bytes32 node) view returns (bytes32 x, bytes32 y)',
  'function interfaceImplementer(bytes32 node, bytes4 interfaceID) view returns (address)',
])

/**
 * An IPFS contenthash, written by the record presets on purpose.
 *
 * The migration's `Profile` type carries only `texts` and coin-type `addresses`
 * — `contenthash` appears nowhere in packages/migration or the migration feature
 * — so a name serving a site this way looks like it should LOSE it. Writing one
 * into the fixture turns that suspicion into an observable assertion instead of
 * a code-reading argument.
 */
export const QA_RECORD_CONTENTHASH =
  '0xe3010170122029f2d17be6139079dc48696d1f582a8530eb9805b561eda517e22a892c7e3f1f' as const

/**
 * V1 records written by the record-bearing presets. Deliberately small and
 * recognisable so a tester can eyeball whether migration replayed them onto the
 * V2 resolver. Derived from the preset type rather than stored per name — the
 * active list lives in a 4096-byte cookie, and every extra field shrinks how
 * many names fit (currently 29).
 */
/**
 * Text records. `migratedValue`, where present, is what the record is expected to
 * read as AFTER migration — migration deliberately normalises social handles
 * (`cleanResolverTextRecords` → `createSocialProfileValueNormalizer`), so
 * `@ens_qa` legitimately becomes `ens_qa`. Encoding that here means the fixture
 * tests the normalisation rather than reporting it as data loss.
 */
/**
 * ERC-7930 encoded mainnet address of the known 8004.eth agent registry, as used
 * by the ENSIP-25 `agent-registration[...]` key format.
 */
const AGENT_REGISTRY_HEX =
  '0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432' as const
/** ENSIP-25 agent-registration key. Dynamic — cannot be a default lookup key. */
export const QA_AGENT_RECORD_KEY =
  `agent-registration[${AGENT_REGISTRY_HEX}][19151]` as const

export const QA_RECORD_TEXTS = [
  { key: 'description', value: 'QA migration fixture' },
  // Leading `@` on purpose: exercises the social normaliser.
  { key: 'com.twitter', value: '@ens_qa', migratedValue: 'ens_qa' },
  // Deliberately NOT one of the portal's default text keys, so this one is only
  // discoverable through the subgraph key list rather than the hardcoded
  // defaults — which is how a real user's arbitrary key has to be found.
  { key: 'com.github', value: 'ens-qa-fixture' },
  // The two most user-visible records: losing either is immediately obvious to an
  // owner, so they are worth asserting explicitly rather than assuming "it's just
  // another text record". `header` is what the UI calls Banner.
  {
    key: 'avatar',
    value: 'https://avatar-upload-staging.ens-cf.workers.dev/sepolia/qa.eth',
  },
  { key: 'header', value: 'https://example.com/qa-banner.png' },
  // ENSIP-25 agent registration. The key encodes a registry and agent id, so it
  // is unguessable — it can only be migrated if the key LIST is carried, never
  // by a default-key lookup. Same risk class as com.github but a live feature.
  { key: QA_AGENT_RECORD_KEY, value: '1' },
] as const satisfies readonly {
  key: string
  value: string
  migratedValue?: string
}[]

/**
 * Coin addresses. coinType 60 = ETH, 0 = BTC.
 *
 * ETH alone is not a sufficient test: `getRecords` requests a hardcoded default
 * coin list, so an ETH record can be picked up even when the coinType list is
 * wrong. BTC is not special-cased anywhere in the migration, so it only survives
 * if the coinType list is genuinely carried.
 *
 * BTC value is the P2PKH scriptPubkey for `1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa`,
 * which is what the resolver stores for coinType 0.
 */
export const QA_RECORD_ADDRESSES = [
  { coinType: 60, value: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' },
  {
    coinType: 0,
    value: '0x76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac',
  },
] as const
/** Kept for callers that only care about the ETH address. */
export const QA_RECORD_ADDRESS = QA_RECORD_ADDRESSES[0]

/**
 * Record kinds that `Profile` ({ texts, addresses }) cannot represent, written
 * so their loss is demonstrable rather than merely inferred from the type.
 * contenthash is already confirmed lost; these extend the same proof to the rest
 * of what a V1 PublicResolver can hold.
 */
export const QA_RECORD_ABI = {
  // contentType 1 = JSON (the PublicResolver accepts powers of two).
  contentType: 1n,
  // toHex, not Buffer — this module runs in the browser.
  value: toHex('[{"type":"function","name":"qaFixture"}]'),
} as const
export const QA_RECORD_PUBKEY = {
  x: '0x1111111111111111111111111111111111111111111111111111111111111111',
  y: '0x2222222222222222222222222222222222222222222222222222222222222222',
} as const
export const QA_RECORD_INTERFACE = {
  // ERC-165 id for a made-up interface + an implementer that is easy to spot.
  interfaceId: '0x12345678',
  implementer: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
} as const

export const QA_RECORD_TEXT_KEYS = QA_RECORD_TEXTS.map((r) => r.key)
export const QA_RECORD_COIN_TYPES = QA_RECORD_ADDRESSES.map((a) => a.coinType)

// V2 contracts — read from the ensjs Sepolia chain config (same source as the
// manager's migration/contracts/addresses.ts), NOT hardcoded.
//
// These used to be literals copied from a past deployment, and silently rotted
// when ensjs was bumped to a new one. The panel then reserved each name's v2
// slot in the OLD registry while the manager migrated against the NEW one, so
// the label was AVAILABLE rather than RESERVED at migrate time. Migration
// controllers hold only ROLE_REGISTER_RESERVED, so claiming an AVAILABLE label
// needs ROLE_REGISTRAR, which they don't have — surfacing as
// `EACUnauthorizedAccountRoles(0, 1, <controller>)` on the "Migration failed"
// screen. Reading them from ensjs keeps the panel and the app on one deployment.
export const V2_ETH_REGISTRY_ADDR = ensjsSepolia.ensRegistry.address
export const V2_ETH_REGISTRAR_ADDR = ensjsSepolia.ensEthRegistrar.address
const V2_MIGRATION_CONTROLLERS = [
  ensjsSepolia.ensUnlockedMigrationController.address,
  ensjsSepolia.ensLockedMigrationController.address,
] as const

/** Anvil account #0 — always has 10 000 ETH on a fresh fork. */
export const DEFAULT_ACCOUNT =
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const

export const ONE_YEAR = 365 * 24 * 3600

// Bonus added to a name's v1 expiry when it's reserved on v2 during pre-migration
// (contracts-v2 `PREMIGRATION_BONUS_PERIOD = 1 + (GRACE_PERIOD_V1 - GRACE_PERIOD_V2)`
// = ~62 days). The v2 slot stays RESERVED for this window, then AVAILABLE-renewable
// for another GRACE_PERIOD_V2 (28d) — 62 + 28 = 90 days = the full v1 grace, so a
// reserved v1 name is renewable throughout grace. Match it so seeded names have the
// SAME renewable window as production (rather than staying renewable indefinitely).
export const PREMIGRATION_BONUS_PERIOD = 1 + (90 - 28) * 24 * 3600
export const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as const

// --- Fuse bit masks (NameWrapper) -------------------------------------------
export const CANNOT_UNWRAP = 1 as const
export const CANNOT_BURN_FUSES = 2 as const
export const CANNOT_TRANSFER = 4 as const
export const CANNOT_SET_RESOLVER = 8 as const
export const CANNOT_SET_TTL = 16 as const
export const CANNOT_CREATE_SUBDOMAIN = 32 as const
export const CANNOT_APPROVE = 64 as const
export const PARENT_CANNOT_CONTROL = 1 << 16
export const IS_DOT_ETH = 1 << 17

export const ALL_CHILD_FUSES =
  CANNOT_UNWRAP |
  CANNOT_BURN_FUSES |
  CANNOT_TRANSFER |
  CANNOT_SET_RESOLVER |
  CANNOT_SET_TTL |
  CANNOT_CREATE_SUBDOMAIN |
  CANNOT_APPROVE

// --- Storage keys -----------------------------------------------------------
export const POSITION_STORAGE_KEY = 'ens:migration-tool:pos'

// --- Types ------------------------------------------------------------------
export type PresetType =
  | 'unwrapped'
  | 'wrapped'
  | 'locked'
  | 'locked-all'
  | 'grace'
  | 'grace-renewable-wrapped'
  | 'grace-renewable-unwrapped'
  | 'emancipated'
  | 'managed'
  | 'records'
  | 'custom-resolver'
  | 'subname'
  | 'subname-records'
  | 'detached-child'
  | 'wrapped-subname'
  | 'unwrapped-subname'
  | 'copy-nested'
  | 'copy-orphan'
  | 'copy-locked-parent'
  | 'copy-unsupported-resolver'
  | 'locked-no-transfer'
  | 'manager-only'
  | 'owner-not-manager'
  | 'locked-no-resolver'
  | 'reassign-wrapped'
  | 'reassign-registry'
  | 'reassign-emancipated'
  | 'reassign-mismatch'
  | 'reassign-registrant-only'
  | 'reassign-grace'

/**
 * Single source of truth for the SHAPE each preset creates.
 *
 * The subgraph mock and the on-chain creation must agree exactly. When they did
 * not — the `records` preset was created unwrapped but described as wrapped —
 * `classifyNames` read it as a locked 2LD holding an ERC-1155 that did not
 * exist, and the name silently vanished from the migration list. Deriving the
 * mock from this table instead of ad-hoc `type === …` checks keeps that class of
 * bug out.
 *
 * `parentFuses` is what the parent's `wrappedDomain.fuses` reports (0 when
 * unwrapped). `child` is present only for presets that also OFFER a child;
 * `emancipated` creates one on-chain but deliberately does not offer it.
 */
/**
 * One descendant beneath a preset's 2LD, to any depth.
 *
 * `fuses` is the FULL bitmap written to the child; nothing is OR'd in. That
 * matters because PARENT_CANNOT_CONTROL is exactly the bit that decides
 * `detached-child` (a token migration) from `unlocked-child` (a copy), and
 * because the NameWrapper refuses to burn PCC unless the parent has
 * CANNOT_UNWRAP — so a preset asking for the wrong combination reverts.
 */
export type PresetNodeShape = {
  /** Label is `${labelPrefix}-${rootLabel}`. Distinct per level. */
  readonly labelPrefix: string
  /** false = registry-only subname, no NameWrapper involvement. */
  readonly wrapped: boolean
  readonly fuses: number
  readonly records?: boolean
  /**
   * Which resolver the node reports. `'none'` (the default for a descendant) is
   * a real, ELIGIBLE state for a copy — `hasSupportedCopyResolver(null)` is
   * true. `'custom'` points at an unrecognised resolver, which is how the
   * `unsupported-resolver` fixture is built.
   */
  readonly resolver?: 'record' | 'custom' | 'none'
  /**
   * Whether this node is offered to the migration flow at all. `false` creates
   * it on chain but keeps it out of the subgraph injection — which is how a
   * name whose parent is missing from the selection is expressed.
   */
  readonly offer?: boolean
  /**
   * Who the node is issued to. `'other'` is Anvil account 1, which is how the
   * #1144 reassign presets leave YOU holding only the parent — the one role
   * that reaches a subname through `setSubnodeOwner`. Defaults to you.
   */
  readonly holder?: 'you' | 'other'
  readonly descendants?: readonly PresetNodeShape[]
}

export type PresetShape = {
  readonly parentWrapped: boolean
  readonly parentFuses: number
  /** Whether the 2LD itself is offered. `false` = it exists but is not injected. */
  readonly offerParent?: boolean
  /** Expiry offset for the 2LD, in seconds from now. Defaults to one year. */
  readonly parentExpiryOffset?: number
  readonly descendants?: readonly PresetNodeShape[]
}

/** Default child label for a preset's single first-level descendant. */
const DEFAULT_CHILD_PREFIX = 'sub'

/**
 * The three descendant shapes the migration routes actually distinguish.
 * Named once so a preset declares intent rather than fuse arithmetic.
 */
/** PCC + CANNOT_UNWRAP under a locked parent -> `locked-child`, a token migration. */
const LOCKED_CHILD_SHAPE = {
  labelPrefix: DEFAULT_CHILD_PREFIX,
  wrapped: true,
  fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
} as const satisfies PresetNodeShape
/** No fuses. Under an unwrapped/unlocked 2LD -> `copy` / `unlocked-child`. */
const UNLOCKED_CHILD_SHAPE = {
  labelPrefix: DEFAULT_CHILD_PREFIX,
  wrapped: true,
  fuses: 0,
} as const satisfies PresetNodeShape
/** No wrapper token at all. Under an unwrapped 2LD -> `copy` / `registry-child`. */
const REGISTRY_CHILD_SHAPE = {
  labelPrefix: DEFAULT_CHILD_PREFIX,
  wrapped: false,
  fuses: 0,
} as const satisfies PresetNodeShape

const EMANCIPATED_2LD = PARENT_CANNOT_CONTROL | IS_DOT_ETH
const LOCKED_2LD = EMANCIPATED_2LD | CANNOT_UNWRAP

/**
 * The part of a fuse set that `NameWrapper.setFuses` accepts — a uint16 of
 * child-controlled fuses. PARENT_CANNOT_CONTROL (1<<16) and IS_DOT_ETH (1<<17)
 * are burned by `wrapETH2LD` itself and are not settable, so passing a full
 * parent fuse set reverts with "not in safe 16-bit unsigned integer range".
 */
export const childSettableFuses = (fuses: number): number => fuses & 0xffff

export const PRESET_SHAPES: Record<PresetType, PresetShape> = {
  unwrapped: { parentWrapped: false, parentFuses: 0 },
  wrapped: { parentWrapped: true, parentFuses: EMANCIPATED_2LD },
  locked: { parentWrapped: true, parentFuses: LOCKED_2LD },
  'locked-all': {
    parentWrapped: true,
    parentFuses: LOCKED_2LD | ALL_CHILD_FUSES,
  },
  grace: { parentWrapped: true, parentFuses: LOCKED_2LD },
  'grace-renewable-wrapped': { parentWrapped: true, parentFuses: LOCKED_2LD },
  'grace-renewable-unwrapped': { parentWrapped: false, parentFuses: 0 },
  // Creates an emancipated child on-chain but offers only the parent, so `child`
  // is intentionally absent. Use `subname` to migrate a child.
  // Creates an emancipated child on chain but deliberately does NOT offer it —
  // the point of this preset is a 2LD that has descendants the flow must ignore.
  // Use `subname` to migrate a child.
  emancipated: {
    parentWrapped: true,
    parentFuses: LOCKED_2LD,
    descendants: [{ ...LOCKED_CHILD_SHAPE, offer: false }],
  },
  managed: { parentWrapped: false, parentFuses: 0 },
  records: { parentWrapped: false, parentFuses: 0 },
  // Same shape as `records` — only the resolver differs, which is the whole
  // point: it isolates resolver recognition from every other variable.
  'custom-resolver': { parentWrapped: false, parentFuses: 0 },
  subname: {
    parentWrapped: true,
    parentFuses: LOCKED_2LD,
    descendants: [LOCKED_CHILD_SHAPE],
  },
  'subname-records': {
    parentWrapped: true,
    parentFuses: LOCKED_2LD,
    descendants: [{ ...LOCKED_CHILD_SHAPE, records: true }],
  },
  // PCC burned but NOT CANNOT_UNWRAP, under a locked parent -> `detached-child`,
  // which routes to the parent's certified WrapperRegistry.
  'detached-child': {
    parentWrapped: true,
    parentFuses: LOCKED_2LD,
    descendants: [
      {
        labelPrefix: DEFAULT_CHILD_PREFIX,
        wrapped: true,
        fuses: PARENT_CANNOT_CONTROL,
      },
    ],
  },
  // Unlocked (emancipated but not locked) 2LD + a child with NO fuses. Since
  // subname migration landed this is `copy` / `unlocked-child`: the child has no
  // transferable token, so it is RE-CREATED in a deterministic UserRegistry
  // under the parent, carrying its own wrappedDomain.expiryDate as the V2
  // expiry. It used to be rejected as ineligible `unlocked-subname`, a reason
  // no code path emits any more.
  'wrapped-subname': {
    parentWrapped: true,
    parentFuses: EMANCIPATED_2LD,
    descendants: [UNLOCKED_CHILD_SHAPE],
  },
  // Registry-only child of an unwrapped parent — no NameWrapper token at all.
  // Also a copy since subname migration landed (`registry-child`), re-created
  // with expiry MAX_UINT64 because it has no V1 expiry of its own. It used to
  // vanish silently, with `classifyName` returning a bare null.
  'unwrapped-subname': {
    parentWrapped: false,
    parentFuses: 0,
    descendants: [REGISTRY_CHILD_SHAPE],
  },
  // Two levels of copy beneath one unwrapped 2LD: a UserRegistry is deployed
  // per copy PARENT, so this exercises the chained case and `hasCompleteCopyRoute`
  // walking up more than one link.
  'copy-nested': {
    parentWrapped: false,
    parentFuses: 0,
    descendants: [
      {
        ...REGISTRY_CHILD_SHAPE,
        descendants: [{ ...REGISTRY_CHILD_SHAPE, labelPrefix: 'deep' }],
      },
    ],
  },
  // The 2LD exists on chain but is NOT offered, so the child has no migrating
  // ancestor. `hasCompleteCopyRoute` demotes it to ineligible `missing-parent`.
  'copy-orphan': {
    parentWrapped: false,
    parentFuses: 0,
    offerParent: false,
    descendants: [REGISTRY_CHILD_SHAPE],
  },
  // The sharpest rule the copy route adds: a copy needs an `unwrapped` or
  // `unlocked` 2LD ancestor, so a child under a LOCKED 2LD is not a copy at all.
  // Creating it is legal — only BURNING PCC needs the parent locked.
  'copy-locked-parent': {
    parentWrapped: true,
    parentFuses: LOCKED_2LD,
    descendants: [UNLOCKED_CHILD_SHAPE],
  },
  // A copy always rewrites the resolver to the owner's PermissionedResolver, so
  // it cannot carry an unrecognised one across -> ineligible
  // `unsupported-resolver`. The `good` sibling is the control: it must still be
  // offered, which is what proves the rejection is about the resolver.
  'copy-unsupported-resolver': {
    parentWrapped: false,
    parentFuses: 0,
    descendants: [
      { ...REGISTRY_CHILD_SHAPE, labelPrefix: 'bad', resolver: 'custom' },
      { ...REGISTRY_CHILD_SHAPE, labelPrefix: 'good' },
    ],
  },
  'locked-no-transfer': {
    parentWrapped: true,
    parentFuses: LOCKED_2LD | CANNOT_TRANSFER,
  },
  // A plain unwrapped 2LD as far as the shape goes: the registrant/controller
  // split cannot be expressed here, because it is a write that happens AFTER
  // registration. See the `manager-only` arm in createV1NameOnAnvil.
  'manager-only': { parentWrapped: false, parentFuses: 0 },
  // Same reason — the split is imperative. This is the mirror: you keep the
  // registrant and hand the controller away.
  'owner-not-manager': { parentWrapped: false, parentFuses: 0 },
  'locked-no-resolver': {
    parentWrapped: true,
    parentFuses: LOCKED_2LD | CANNOT_SET_RESOLVER,
  },
  // #1144 — a V1 subname moved by its PARENT (`setSubnodeOwner`). Every one
  // leaves you holding the parent and somebody else holding the child, so the
  // transfer route has to decide what the parent may do. The children are
  // withheld from the migration mock: they are not yours to migrate.
  'reassign-wrapped': {
    parentWrapped: true,
    parentFuses: EMANCIPATED_2LD,
    descendants: [{ ...UNLOCKED_CHILD_SHAPE, holder: 'other', offer: false }],
  },
  'reassign-registry': {
    parentWrapped: false,
    parentFuses: 0,
    descendants: [{ ...REGISTRY_CHILD_SHAPE, holder: 'other', offer: false }],
  },
  // PCC burned on the child: the wrapper's `canCallSetSubnodeOwner` refuses.
  'reassign-emancipated': {
    parentWrapped: true,
    parentFuses: LOCKED_2LD,
    descendants: [
      {
        labelPrefix: DEFAULT_CHILD_PREFIX,
        wrapped: true,
        fuses: PARENT_CANNOT_CONTROL,
        holder: 'other',
        offer: false,
      },
    ],
  },
  // Created wrapped and yours, then UNWRAPPED onto account 1 — see
  // `finishReassignPreset`. A wrapped parent over a registry child.
  'reassign-mismatch': {
    parentWrapped: true,
    parentFuses: EMANCIPATED_2LD,
    descendants: [{ ...UNLOCKED_CHILD_SHAPE, offer: false }],
  },
  // The parent's CONTROLLER is handed to account 2 afterwards; you keep only
  // its ERC-721, and `setSubnodeOwner` is the controller's power.
  'reassign-registrant-only': {
    parentWrapped: false,
    parentFuses: 0,
    descendants: [{ ...REGISTRY_CHILD_SHAPE, holder: 'other', offer: false }],
  },
  // Then the clock is pushed 30 days into the 2LD's grace period. `other-` is
  // the parent's move (refused while the 2LD is in grace); `held-` is yours,
  // and still transfers, with a warning.
  'reassign-grace': {
    parentWrapped: true,
    parentFuses: EMANCIPATED_2LD,
    descendants: [
      {
        ...UNLOCKED_CHILD_SHAPE,
        labelPrefix: 'other',
        holder: 'other',
        offer: false,
      },
      { ...UNLOCKED_CHILD_SHAPE, labelPrefix: 'held', offer: false },
    ],
  },
}

/**
 * One node of a preset, resolved against a concrete root label.
 *
 * Everything downstream — the on-chain writes, the subgraph mock, the profile
 * rows, the panel's name list — is derived from this single walk. That is
 * deliberate: when the mock and the chain were computed separately they drifted
 * (the `records` preset was created unwrapped but described as wrapped, so
 * `classifyNames` read it as a locked 2LD holding an ERC-1155 that did not
 * exist and the name silently vanished). One source, one shape.
 */
export type PresetNode = {
  /** Label path, leaf first: `['deep-dev1', 'sub-dev1', 'dev1']`. */
  readonly labels: readonly string[]
  readonly fullName: string
  readonly node: `0x${string}`
  readonly label: string
  readonly parentNode: `0x${string}`
  readonly parentFullName: string
  readonly depth: number
  readonly wrapped: boolean
  readonly fuses: number
  readonly records: boolean
  readonly resolver: 'record' | 'custom' | 'none'
  readonly offer: boolean
  /** Who the node is issued to on chain. */
  readonly holder: Address
  /** The immediate parent's wrapper state, which the classifier reads. */
  readonly parentWrapped: boolean
  readonly parentFuses: number
}

/** Which resolver a preset's 2LD reports. */
const rootResolverKind = (type: PresetType): 'record' | 'custom' | 'none' => {
  if (!presetHasParentRecords(type)) return 'none'
  return type === 'custom-resolver' ? 'custom' : 'record'
}

/** namehash of a label path given leaf-first (`['sub','alice']` → sub.alice.eth). */
export const nodeForPath = (labels: readonly string[]): `0x${string}` =>
  [...labels]
    .reverse()
    .reduce<`0x${string}`>(
      (acc, l) => namehashFromLabelAndParent(labelhash(l), acc),
      ETH_NODE,
    )

/**
 * Every name a preset puts on chain, parent first.
 *
 * Parent-first matters for more than tidiness: descendants can only be created
 * once their parent exists, and `hasCompleteCopyRoute` walks *up* from a copy,
 * so a missing link is always an earlier entry in this list.
 */
export const walkPreset = (
  rootLabel: string,
  type: PresetType,
): readonly PresetNode[] => {
  const shape = PRESET_SHAPES[type]
  const out: PresetNode[] = []

  const root: PresetNode = {
    labels: [rootLabel],
    fullName: `${rootLabel}.eth`,
    node: nodeForPath([rootLabel]),
    label: rootLabel,
    parentNode: ETH_NODE,
    parentFullName: 'eth',
    depth: 0,
    wrapped: shape.parentWrapped,
    fuses: shape.parentFuses,
    records: presetHasParentRecords(type),
    resolver: rootResolverKind(type),
    offer: shape.offerParent ?? true,
    holder: DEFAULT_ACCOUNT,
    parentWrapped: false,
    parentFuses: 0,
  }
  out.push(root)

  const visit = (node: PresetNode, descendants: readonly PresetNodeShape[]) => {
    for (const child of descendants) {
      const label = `${child.labelPrefix}-${rootLabel}`
      const labels = [label, ...node.labels]
      const entry: PresetNode = {
        labels,
        fullName: `${label}.${node.fullName}`,
        node: nodeForPath(labels),
        label,
        parentNode: node.node,
        parentFullName: node.fullName,
        depth: node.depth + 1,
        wrapped: child.wrapped,
        fuses: child.fuses,
        records: child.records ?? false,
        resolver: child.resolver ?? (child.records ? 'record' : 'none'),
        offer: child.offer ?? true,
        holder:
          child.holder === 'other' ? V1_DISTINCT_MANAGER : DEFAULT_ACCOUNT,
        parentWrapped: node.wrapped,
        parentFuses: node.fuses,
      }
      out.push(entry)
      visit(entry, child.descendants ?? [])
    }
  }
  visit(root, shape.descendants ?? [])

  return out
}

/** Presets that put at least one descendant on chain, offered or not. */
export const presetHasSubname = (type: PresetType): boolean =>
  (PRESET_SHAPES[type].descendants ?? []).length > 0
/** Presets whose 2LD carries V1 records. */
export const presetHasParentRecords = (type: PresetType): boolean =>
  type === 'records' || type === 'subname-records' || type === 'custom-resolver'
/**
 * Which resolver a preset's records live on. `custom-resolver` writes to an
 * unrecognised one on purpose; everything else uses the recognised resolver so
 * replay is reachable. Creation, the subgraph mock and the read-back all go
 * through this so they cannot disagree about where the records are.
 */
export const recordResolverFor = (type: PresetType): Address =>
  type === 'custom-resolver' ? V1_CUSTOM_RESOLVER : V1_RECORD_RESOLVER
/** Every ENS name a preset puts in front of the migration flow. */
export const fullNamesFor = (name: {
  label: string
  type: PresetType
}): string[] => walkPreset(name.label, name.type).map((n) => n.fullName)

export interface ActiveName {
  label: string
  type: PresetType
  id: string
  /** Unix seconds — V1 expiry, used for subgraph mock and V2 reservation */
  expiryDate: number
}

export type Pos = { left: number; top: number }

// --- Preset definitions -----------------------------------------------------
export const PRESETS: { type: PresetType; label: string; title: string }[] = [
  { type: 'unwrapped', label: 'Unwrapped', title: 'ERC-721 on BaseRegistrar' },
  { type: 'wrapped', label: 'Wrapped', title: 'NameWrapper, no fuses' },
  {
    type: 'locked',
    label: 'Locked',
    title: 'NameWrapper, CANNOT_UNWRAP fuse burned',
  },
  {
    type: 'locked-all',
    label: 'Locked+All',
    title: 'NameWrapper, all 7 child fuses burned',
  },
  {
    type: 'grace',
    label: 'Grace Period',
    title: 'Locked name expired 45 days ago (clock advanced)',
  },
  {
    type: 'grace-renewable-wrapped',
    label: 'Grace RW (wrapped)',
    title:
      'Wrapped name in grace, v2 reservation active → isRenewable=true. NOTE: after renewal the NameWrapper token stays expired, so migration reverts with ERC1155 insufficient balance.',
  },
  {
    type: 'grace-renewable-unwrapped',
    label: 'Grace RW (unwrapped)',
    title:
      'Unwrapped name in grace, v2 reservation active → isRenewable=true. Renew then migrate works end-to-end (ERC-721 in BaseRegistrar).',
  },
  {
    type: 'emancipated',
    label: 'Emancipated',
    title:
      'Locked 2LD with an emancipated child beneath it. NOTE: only the PARENT is offered for migration — use "Subname" to migrate the child itself.',
  },
  {
    type: 'records',
    label: 'Records',
    title:
      'Unwrapped 2LD with a V1 resolver and real text + ETH-address records, so record replay is observable.',
  },
  {
    type: 'custom-resolver',
    label: 'Custom Res',
    title:
      'Same as "Records" but the resolver is NOT in KNOWN_PUBLIC_RESOLVERS -> strategy degrades to keep-v1: the V2 name points back at the V1 resolver and NO records are read or replayed.',
  },
  {
    type: 'subname',
    label: 'Subname',
    title:
      'Locked 2LD + locked child, BOTH offered for migration — exercises parent-first ordering and descendant routing.',
  },
  {
    type: 'subname-records',
    label: 'Subname+Rec',
    title:
      'Locked 2LD + locked child, both offered AND both carrying V1 records — the fullest hierarchy fixture.',
  },
  {
    type: 'managed',
    label: 'Managed',
    title:
      'Unwrapped, V1 registry owner (manager) != registrant via reclaim(). The only preset that triggers "Approve manager restoration" + "Revoke temporary HCA access".',
  },
  {
    type: 'detached-child',
    label: 'Detached',
    title:
      "Locked 2LD + child with PARENT_CANNOT_CONTROL but NOT CANNOT_UNWRAP -> tokenType 'detached-child', routed to the parent's certified WrapperRegistry.",
  },
  {
    type: 'wrapped-subname',
    label: 'Copy sub (wrapped)',
    title:
      "Unlocked (emancipated, not locked) 2LD + child with NO fuses -> action 'copy', tokenType 'unlocked-child'. The child has no transferable token, so it is RE-CREATED in a deterministic UserRegistry under the parent, carrying its own wrappedDomain.expiryDate as the V2 expiry. Used to be rejected as 'unlocked-subname' — a reason nothing emits any more.",
  },
  {
    type: 'unwrapped-subname',
    label: 'Copy sub (registry)',
    title:
      "Unwrapped 2LD + registry-only child (no NameWrapper token) -> action 'copy', tokenType 'registry-child'. Ownership is proven via LegacyRegistry.owner(namehash), not a token, and it is re-created with expiry MAX_UINT64 since it has no V1 expiry of its own. Used to vanish silently.",
  },
  {
    type: 'copy-nested',
    label: 'Copy nested',
    title:
      'Unwrapped 2LD -> registry 3LD -> registry 4LD, all copies. A UserRegistry is deployed per copy PARENT, so this is the chained case: resolution walks ETHRegistry -> UserRegistry(2LD) -> UserRegistry(3LD).',
  },
  {
    type: 'copy-orphan',
    label: 'Copy orphan',
    title:
      "Registry-only child whose 2LD is created on chain but NOT offered. hasCompleteCopyRoute finds no migrating ancestor -> ineligible 'missing-parent'. Expect an EMPTY list: seed another preset alongside it, or you cannot tell this from a broken subgraph mock.",
  },
  {
    type: 'copy-locked-parent',
    label: 'Copy -locked',
    title:
      "LOCKED 2LD + child with no fuses. The copy route requires an 'unwrapped' or 'unlocked' 2LD ancestor, so the child is ineligible 'missing-parent' while the 2LD still migrates as 'locked-2ld'. The sharpest new rule in the subname PR.",
  },
  {
    type: 'copy-unsupported-resolver',
    label: 'Copy -res',
    title:
      "Unwrapped 2LD + two registry children: 'bad-' on an unrecognised resolver -> ineligible 'unsupported-resolver', and 'good-' with no resolver -> eligible. A copy always rewrites the resolver to the owner's PermissionedResolver and cannot carry an unknown one across. The good sibling is the control.",
  },
  {
    type: 'owner-not-manager',
    label: 'Owner not mgr',
    title:
      "Unwrapped 2LD, then the ENSRegistry controller is handed to Anvil account 2 — you keep the ERC-721. Transfer is ALLOWED (the registrar asks the registrant), no record options are offered (the resolver authorises the controller, not you), and `reclaim` takes the manager back onto the recipient. The mirror of 'Manager only'.",
  },
  {
    type: 'manager-only',
    label: 'Manager only',
    title:
      "Unwrapped 2LD, then the ERC-721 is handed to Anvil account 1 — leaving YOU as the ENSRegistry controller but NOT the BaseRegistrar registrant. Transfer must refuse with 'You manage this name but don't own it' and name the registrant. The one V1 ownership shape with no V2 analogue.",
  },
  {
    type: 'locked-no-transfer',
    label: 'Locked -xfer',
    title:
      "Locked 2LD with ONLY CANNOT_TRANSFER added -> ineligible 'not-transferable'. Isolates the one fuse that Locked+All hides among seven.",
  },
  {
    type: 'locked-no-resolver',
    label: 'Locked -res',
    title:
      'Locked 2LD with ONLY CANNOT_SET_RESOLVER added -> migrates, but resolverStrategy is forced to keep-v1 so records are NOT replayed.',
  },
  {
    type: 'reassign-wrapped',
    label: 'Reassign wrapped',
    title:
      "Wrapped 2LD you own + a wrapped subname held by account 1. Open lands on the SUBNAME. The Ownership tab offers Transfer; the form warns that account 1 loses it, offers no record options, and runs ONE 'Reassign subname' step (NameWrapper.setSubnodeOwner). Fuses and expiry must survive it.",
  },
  {
    type: 'reassign-registry',
    label: 'Reassign registry',
    title:
      "Unwrapped 2LD you own + a registry-only subname held by account 1. Same as 'Reassign wrapped' but the one step is ENSRegistry.setSubnodeOwner. Before #1144 this said 'Not authorized'.",
  },
  {
    type: 'reassign-emancipated',
    label: 'Reassign -PCC',
    title:
      "Locked 2LD you own + a subname held by account 1 with PARENT_CANNOT_CONTROL burned. No Transfer link; /transfer reads 'This subname is out of the parent's control'.",
  },
  {
    type: 'reassign-mismatch',
    label: 'Reassign ≠wrap',
    title:
      "Wrapped 2LD you own + a subname UNWRAPPED onto account 1. No Transfer link; /transfer reads 'Can't reassign this subname from here' — reassigning would force-wrap it.",
  },
  {
    type: 'reassign-registrant-only',
    label: 'Parent reg only',
    title:
      "Unwrapped 2LD whose ERC-721 you keep but whose controller is account 2, + a subname held by account 1. No Transfer link; /transfer reads 'Reclaim the parent first'.",
  },
  {
    type: 'reassign-grace',
    label: 'Reassign grace',
    title:
      "Wrapped 2LD you own pushed 30 days INTO GRACE (moves the shared clock ~13 months — seed it last). 'other-' (account 1): '<2LD> is in its grace period', no form. 'held-' (yours): the form, plus a warning that whoever registers the 2LD next can take it back.",
  },
]

export const TYPE_BADGE_COLORS: Record<PresetType, string> = {
  unwrapped: '#4b5563',
  wrapped: '#1d4ed8',
  locked: '#7c3aed',
  'locked-all': '#9333ea',
  grace: '#b45309',
  'grace-renewable-wrapped': '#c2410c',
  'grace-renewable-unwrapped': '#ea580c',
  emancipated: '#065f46',
  managed: '#0e7490',
  records: '#a16207',
  'custom-resolver': '#78350f',
  subname: '#4338ca',
  'subname-records': '#6d28d9',
  'detached-child': '#0369a1',
  // The copy family. Teal, deliberately not the red these two used to wear:
  // both are now ELIGIBLE routes, not rejections.
  'wrapped-subname': '#0d9488',
  'unwrapped-subname': '#0f766e',
  'copy-nested': '#115e59',
  'copy-orphan': '#9f1239',
  'copy-locked-parent': '#9d174d',
  'copy-unsupported-resolver': '#831843',
  'locked-no-transfer': '#991b1b',
  'manager-only': '#7c6bd6',
  'owner-not-manager': '#5b8def',
  'locked-no-resolver': '#a21caf',
  'reassign-wrapped': '#0e7490',
  'reassign-registry': '#0891b2',
  'reassign-emancipated': '#be123c',
  'reassign-mismatch': '#9f1239',
  'reassign-registrant-only': '#a16207',
  'reassign-grace': '#c2410c',
}

/**
 * Which migration route each preset is meant to exercise. Purely descriptive —
 * the panel groups its buttons by this so a 23-button strip stays readable, and
 * it puts the expected outcome next to the button that produces it.
 */
export const PRESET_FAMILY: Record<
  PresetType,
  'migrate' | 'copy' | 'ineligible' | 'transfer'
> = {
  unwrapped: 'migrate',
  wrapped: 'migrate',
  locked: 'migrate',
  'locked-all': 'ineligible',
  grace: 'migrate',
  'grace-renewable-wrapped': 'migrate',
  'grace-renewable-unwrapped': 'migrate',
  emancipated: 'migrate',
  managed: 'migrate',
  records: 'migrate',
  'custom-resolver': 'migrate',
  subname: 'migrate',
  'subname-records': 'migrate',
  'detached-child': 'migrate',
  'wrapped-subname': 'copy',
  'unwrapped-subname': 'copy',
  'copy-nested': 'copy',
  'copy-orphan': 'ineligible',
  'copy-locked-parent': 'ineligible',
  'copy-unsupported-resolver': 'ineligible',
  'locked-no-transfer': 'ineligible',
  'manager-only': 'transfer',
  'owner-not-manager': 'transfer',
  'locked-no-resolver': 'migrate',
  'reassign-wrapped': 'transfer',
  'reassign-registry': 'transfer',
  'reassign-emancipated': 'transfer',
  'reassign-mismatch': 'transfer',
  'reassign-registrant-only': 'transfer',
  'reassign-grace': 'transfer',
}

// --- ABI fragments ----------------------------------------------------------
// All contract ABIs are sourced from @ensdomains/ensjs-abi per-function
// snippets (imported above). NameWrapper: wrapETH2LD / setFuses /
// setSubnodeOwner. BaseRegistrar: register / addController / owner /
// controllers. setApprovalForAll from the registry snippet (standard
// ERC-721/1155 method, encodes identically). V2 registry register from
// v2/userRegistry (identical param types; only names differ).

// --- Crypto helpers ---------------------------------------------------------

/** ETH namehash of "eth" */
export const ETH_NODE =
  '0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae' as const

export function labelhash(label: string): `0x${string}` {
  return keccak256(toBytes(label))
}

export function namehashFromLabelAndParent(
  labelHash: `0x${string}`,
  parentNode: `0x${string}`,
): `0x${string}` {
  return keccak256(concat([hexToBytes(parentNode), hexToBytes(labelHash)]))
}

// --- JSON-RPC helpers -------------------------------------------------------

interface RpcReadCall {
  readonly method: string
  readonly params: unknown[]
}

interface RpcBatchResponse {
  readonly id?: number
  readonly result?: unknown
  readonly error?: { readonly message?: string }
}

interface RpcBatchRequest extends RpcReadCall {
  readonly jsonrpc: '2.0'
  readonly id: number
}

const RPC_READ_BATCH_SIZE = 100

export async function rpcCall(
  endpoint: string,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}: ${res.statusText}`)
  const json = (await res.json()) as {
    result?: unknown
    error?: { message: string }
  }
  if (json.error) throw new Error(`RPC error: ${json.error.message}`)
  return json.result
}

/**
 * Send read-only JSON-RPC calls in bounded batches. Batch responses may arrive
 * in any order, so results are restored to input order by request id. If an RPC
 * endpoint does not support batching, retry that chunk as individual reads;
 * per-call failures stay `undefined` for the caller's existing fallback.
 */
async function fetchRpcReadBatch(
  endpoint: string,
  requests: readonly RpcBatchRequest[],
): Promise<RpcBatchResponse[]> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requests),
  })
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}: ${res.statusText}`)
  const json: unknown = await res.json()
  if (!Array.isArray(json))
    throw new Error('RPC batch response is not an array')
  return json as RpcBatchResponse[]
}

async function retryRpcReadChunk(
  endpoint: string,
  chunk: readonly RpcReadCall[],
  results: (unknown | undefined)[],
  offset: number,
): Promise<void> {
  for (const [index, call] of chunk.entries()) {
    try {
      results[offset + index] = await rpcCall(
        endpoint,
        call.method,
        call.params,
      )
    } catch {
      // Preserve the caller's per-name fallback for an unreadable entry.
    }
  }
}

function restoreRpcReadBatchOrder(
  responses: readonly RpcBatchResponse[],
  requests: readonly RpcBatchRequest[],
  results: (unknown | undefined)[],
  offset: number,
): void {
  const responsesById = new Map(
    responses.flatMap((response) =>
      typeof response.id === 'number' ? [[response.id, response] as const] : [],
    ),
  )
  for (const [index, request] of requests.entries()) {
    const response = responsesById.get(request.id)
    if (response && !response.error) results[offset + index] = response.result
  }
}

async function rpcReadBatch(
  endpoint: string,
  calls: readonly RpcReadCall[],
): Promise<(unknown | undefined)[]> {
  const results = new Array<unknown | undefined>(calls.length).fill(undefined)

  for (let offset = 0; offset < calls.length; offset += RPC_READ_BATCH_SIZE) {
    const chunk = calls.slice(offset, offset + RPC_READ_BATCH_SIZE)
    const requests: RpcBatchRequest[] = chunk.map((call, index) => ({
      jsonrpc: '2.0' as const,
      id: offset + index + 1,
      method: call.method,
      params: call.params,
    }))

    try {
      const responses = await fetchRpcReadBatch(endpoint, requests)
      restoreRpcReadBatchOrder(responses, requests, results, offset)
    } catch {
      await retryRpcReadChunk(endpoint, chunk, results, offset)
    }
  }

  return results
}

export async function sendTx(
  endpoint: string,
  to: string,
  data: `0x${string}`,
  value = '0x0',
): Promise<void> {
  await rpcCall(endpoint, 'eth_sendTransaction', [
    {
      from: DEFAULT_ACCOUNT,
      to,
      data,
      gas: '0x7A120', // 500 000 gas
      gasPrice: '0x3B9ACA00', // 1 gwei — override fork base fee
      value,
    },
  ])
  await rpcCall(endpoint, 'evm_mine', [])
}

export async function increaseTime(
  endpoint: string,
  seconds: number,
): Promise<void> {
  await rpcCall(endpoint, 'evm_increaseTime', [seconds])
  await rpcCall(endpoint, 'evm_mine', [])
}

export async function getBlockTimestamp(endpoint: string): Promise<number> {
  const block = (await rpcCall(endpoint, 'eth_getBlockByNumber', [
    'latest',
    false,
  ])) as { timestamp: string }
  return Number.parseInt(block.timestamp, 16)
}

// Variant of sendTx that uses a custom `from` (for impersonated accounts).
// Funds the sender with 0.1 ETH first so the gas cost is covered even if the
// impersonated account has zero balance on the fork.
export async function sendTxFrom(
  endpoint: string,
  from: string,
  to: string,
  data: `0x${string}`,
): Promise<void> {
  await rpcCall(endpoint, 'anvil_setBalance', [from, '0x16345785D8A0000']) // 0.1 ETH
  await rpcCall(endpoint, 'eth_sendTransaction', [
    { from, to, data, gas: '0xF4240', gasPrice: '0x3B9ACA00' },
  ])
  await rpcCall(endpoint, 'evm_mine', [])
}

// --- Name creation ----------------------------------------------------------

/**
 * Register a V1 .eth name by calling BaseRegistrar.register() directly.
 * DEFAULT_ACCOUNT must already be an authorized controller on the BaseRegistrar —
 * ensureFunded() does this via impersonation on each Anvil session.
 */
export async function registerV1Name(
  endpoint: string,
  label: string,
  wrapAfterRegister: boolean,
): Promise<void> {
  const tokenId = BigInt(labelhash(label))

  await sendTx(
    endpoint,
    V1_BASE_REGISTRAR,
    encodeFunctionData({
      abi: baseRegistrarRegisterSnippet,
      functionName: 'register',
      args: [tokenId, DEFAULT_ACCOUNT, BigInt(ONE_YEAR)],
    }),
  )

  if (!wrapAfterRegister) return

  // Approve the NameWrapper to transfer the ERC-721
  await sendTx(
    endpoint,
    V1_BASE_REGISTRAR,
    encodeFunctionData({
      abi: registrySetApprovalForAllSnippet,
      functionName: 'setApprovalForAll',
      args: [V1_NAME_WRAPPER, true],
    }),
  )

  // Wrap via official NameWrapper (pass zero resolver — not needed for migration testing)
  await sendTx(
    endpoint,
    V1_NAME_WRAPPER,
    encodeFunctionData({
      abi: nameWrapperWrapEth2ldSnippet,
      functionName: 'wrapETH2LD',
      args: [label, DEFAULT_ACCOUNT, 0, ZERO_ADDRESS],
    }),
  )
}

/**
 * Point the V1 registry owner (the "manager") at `manager` while the registrant
 * keeps the ERC-721. Called by DEFAULT_ACCOUNT, which must be the registrant.
 */
export async function reclaimV1Manager(
  endpoint: string,
  label: string,
  manager: Address,
): Promise<void> {
  await sendTx(
    endpoint,
    V1_BASE_REGISTRAR,
    encodeFunctionData({
      abi: baseRegistrarReclaimSnippet,
      functionName: 'reclaim',
      args: [BigInt(labelhash(label)), manager],
    }),
  )
}

/**
 * The `resolver` field for a mock domain. Record-bearing names must report the
 * exact resolver their records were actually written to — recognised or not;
 * other wrapped names keep reporting the resolver they are created with;
 * unwrapped ones have none.
 */
const resolverRefFor = (
  hasRecords: boolean,
  isWrapped: boolean,
  recordResolver: Address = V1_RECORD_RESOLVER,
): { id: string; address: string } | null => {
  if (hasRecords) return { id: recordResolver, address: recordResolver }
  if (isWrapped) return { id: V1_PUBLIC_RESOLVER, address: V1_PUBLIC_RESOLVER }
  return null
}

/** namehash of `<label>.eth`. */
export const nodeForLabel = (label: string): `0x${string}` =>
  namehashFromLabelAndParent(labelhash(label), ETH_NODE)

const registrySetSubnodeOwnerSnippet = parseAbi([
  'function setSubnodeOwner(bytes32 node, bytes32 label, address owner) returns (bytes32)',
])

/**
 * Create a registry-only subname: owned directly in the V1 registry with no
 * NameWrapper token. Requires the parent to be unwrapped (its registry owner is
 * this account). This is the `eth-unwrapped-subname` state.
 */
export async function createRegistryOnlySubname(
  endpoint: string,
  parentNode: `0x${string}`,
  sublabel: string,
  owner: Address = DEFAULT_ACCOUNT,
): Promise<void> {
  await sendTx(
    endpoint,
    V1_ENS_REGISTRY,
    encodeFunctionData({
      abi: registrySetSubnodeOwnerSnippet,
      functionName: 'setSubnodeOwner',
      args: [parentNode, labelhash(sublabel), owner],
    }),
  )
}

/**
 * Create a wrapped child with an explicit fuse set. Unlike
 * Takes the parent NODE rather than a label, so it works at any depth. It does
 * not assume PCC|CANNOT_UNWRAP, so it produces `detached-child` (PCC only) and
 * the copy states (no fuses) as well.
 *
 * NOTE: burning PARENT_CANNOT_CONTROL requires the parent to have CANNOT_UNWRAP
 * burned first, so callers must match `PRESET_SHAPES`.
 */
export async function createWrappedSubnameWithFuses(
  endpoint: string,
  parentNode: `0x${string}`,
  sublabel: string,
  fuses: number,
  owner: Address = DEFAULT_ACCOUNT,
): Promise<void> {
  const now = await getBlockTimestamp(endpoint)
  await sendTx(
    endpoint,
    V1_NAME_WRAPPER,
    encodeFunctionData({
      abi: nameWrapperSetSubnodeOwnerSnippet,
      functionName: 'setSubnodeOwner',
      args: [parentNode, sublabel, owner, fuses, BigInt(now + ONE_YEAR * 2)],
    }),
  )
}

/**
 * Put a "user deployed this themselves" resolver on the fork at
 * V1_CUSTOM_RESOLVER by cloning the live PublicResolver's runtime code.
 * Idempotent, so re-seeding the preset costs one `eth_getCode`.
 *
 * A clone rather than the live address on purpose: see V1_CUSTOM_RESOLVER for
 * why reusing V1_PUBLIC_RESOLVER makes the fixture unfalsifiable.
 */
export async function ensureCustomResolverDeployed(
  endpoint: string,
): Promise<void> {
  const existing = (await rpcCall(endpoint, 'eth_getCode', [
    V1_CUSTOM_RESOLVER,
    'latest',
  ])) as string | undefined
  if (existing && existing !== '0x') return

  const code = (await rpcCall(endpoint, 'eth_getCode', [
    V1_PUBLIC_RESOLVER,
    'latest',
  ])) as string | undefined
  if (!code || code === '0x') {
    throw new Error(
      `Cannot clone a custom resolver: no code at ${V1_PUBLIC_RESOLVER} on this fork`,
    )
  }
  await rpcCall(endpoint, 'anvil_setCode', [V1_CUSTOM_RESOLVER, code])
}

/**
 * Point a node at a V1 resolver and write the QA record set.
 *
 * `setResolver` has to go through whoever owns the node in the V1 registry: the
 * account itself for an unwrapped name, the NameWrapper for a wrapped one (which
 * includes every subname of a wrapped parent).
 *
 * The record writes then go straight to the resolver in both cases: the V1
 * PublicResolver is NameWrapper-aware, so when the registry owner is the wrapper
 * it authorises `nameWrapper.ownerOf(node)` — which is this account.
 */
/**
 * Point a node at a resolver without writing any records.
 *
 * The write goes through the NameWrapper for a wrapped node and the registry
 * for an unwrapped one, because that is who owns the node in the V1 registry.
 */
export async function setV1Resolver(
  endpoint: string,
  node: `0x${string}`,
  isWrapped: boolean,
  resolver: Address,
): Promise<void> {
  await sendTx(
    endpoint,
    isWrapped ? V1_NAME_WRAPPER : V1_ENS_REGISTRY,
    encodeFunctionData({
      abi: setResolverSnippet,
      functionName: 'setResolver',
      args: [node, resolver],
    }),
  )
}

export async function writeV1Records(
  endpoint: string,
  node: `0x${string}`,
  isWrapped: boolean,
  resolver: Address = V1_RECORD_RESOLVER,
): Promise<void> {
  await setV1Resolver(endpoint, node, isWrapped, resolver)

  for (const { key, value } of QA_RECORD_TEXTS) {
    await sendTx(
      endpoint,
      resolver,
      encodeFunctionData({
        abi: resolverWriteSnippet,
        functionName: 'setText',
        args: [node, key, value],
      }),
    )
  }

  for (const { coinType, value } of QA_RECORD_ADDRESSES) {
    await sendTx(
      endpoint,
      resolver,
      encodeFunctionData({
        abi: resolverWriteSnippet,
        functionName: 'setAddr',
        args: [node, BigInt(coinType), value],
      }),
    )
  }

  // Kinds `Profile` cannot represent. Written so their loss is demonstrable.
  await sendTx(
    endpoint,
    resolver,
    encodeFunctionData({
      abi: resolverWriteSnippet,
      functionName: 'setContenthash',
      args: [node, QA_RECORD_CONTENTHASH],
    }),
  )
  await sendTx(
    endpoint,
    resolver,
    encodeFunctionData({
      abi: resolverWriteSnippet,
      functionName: 'setABI',
      args: [node, QA_RECORD_ABI.contentType, QA_RECORD_ABI.value],
    }),
  )
  await sendTx(
    endpoint,
    resolver,
    encodeFunctionData({
      abi: resolverWriteSnippet,
      functionName: 'setPubkey',
      args: [node, QA_RECORD_PUBKEY.x, QA_RECORD_PUBKEY.y],
    }),
  )
  await sendTx(
    endpoint,
    resolver,
    encodeFunctionData({
      abi: resolverWriteSnippet,
      functionName: 'setInterface',
      args: [
        node,
        QA_RECORD_INTERFACE.interfaceId,
        QA_RECORD_INTERFACE.implementer,
      ],
    }),
  )

  // `sendTx` uses eth_sendTransaction, which returns a hash even for a call that
  // reverts — so a rejected write would leave a record-less fixture and migration
  // would look like it dropped them. Read every kind back and fail loudly.
  // Going through readAllV1Records means a kind added above is automatically
  // verified here too, rather than needing a matching assertion by hand.
  const written = await readAllV1Records(endpoint, node, resolver)
  const missing = written.filter((r) => !r.present)
  if (missing.length > 0) {
    throw new Error(
      `V1 records did not persist on ${node}: ${missing.map((r) => r.kind).join(', ')} — the resolver rejected the write(s) (not authorised for this node, or the resolver lacks that interface). A fixture missing a kind silently stops testing it.`,
    )
  }
}

/** One record kind read back off a resolver. */
export type RecordProbe = {
  readonly kind: string
  /** Whether migration's `Profile` type can represent this kind at all. */
  readonly migratable: boolean
  readonly present: boolean
  readonly value: string | null
}

type ResolverReadFn =
  | 'text'
  | 'addr'
  | 'contenthash'
  | 'ABI'
  | 'pubkey'
  | 'interfaceImplementer'

const encResolverRead = (
  functionName: ResolverReadFn,
  args: readonly unknown[],
): Hex =>
  encodeFunctionData({
    abi: resolverReadSnippet,
    functionName,
    args: args as never,
  })

const decodeStrResult = (raw?: string): string => {
  if (!raw || raw === '0x') return ''
  try {
    const [v] = decodeAbiParameters([{ type: 'string' }], raw as Hex)
    return v
  } catch {
    return ''
  }
}

const decodeBytesResult = (raw?: string): string | null => {
  if (!raw || raw === '0x') return null
  try {
    const [v] = decodeAbiParameters([{ type: 'bytes' }], raw as Hex)
    return v && v !== '0x' ? v : null
  } catch {
    return null
  }
}

/** Bind eth_call to one resolver so the readers below stay terse. */
const resolverReader =
  (endpoint: string, resolver: string) =>
  async (fn: ResolverReadFn, args: readonly unknown[]) =>
    (await rpcCall(endpoint, 'eth_call', [
      { to: resolver, data: encResolverRead(fn, args) },
      'latest',
    ])) as string | undefined

/** text + coin-address records — the kinds `Profile` CAN carry. */
const readMigratableRecords = async (
  node: `0x${string}`,
  read: ReturnType<typeof resolverReader>,
  /** Compare against post-migration expectations (normalised social handles). */
  expectMigrated = false,
): Promise<RecordProbe[]> => {
  const out: RecordProbe[] = []
  for (const record of QA_RECORD_TEXTS) {
    const { key, value } = record
    const expected =
      expectMigrated && 'migratedValue' in record
        ? (record.migratedValue as string)
        : value
    const got = decodeStrResult(await read('text', [node, key]))
    out.push({
      kind: `text:${key}`,
      migratable: true,
      present: got === expected,
      value: got || null,
    })
  }
  for (const { coinType, value } of QA_RECORD_ADDRESSES) {
    const got = decodeBytesResult(await read('addr', [node, BigInt(coinType)]))
    out.push({
      kind: `addr:${coinType}`,
      migratable: true,
      present: (got ?? '').toLowerCase() === value.toLowerCase(),
      value: got,
    })
  }
  return out
}

/**
 * contenthash / ABI / pubkey / interface.
 *
 * contenthash and ABI became migratable when preservation landed (they are now
 * fields on `Profile`); pubkey and interface still have no representation, so
 * they are expected to be dropped.
 */
const readUnmigratableRecords = async (
  node: `0x${string}`,
  read: ReturnType<typeof resolverReader>,
): Promise<RecordProbe[]> => {
  const ch = decodeBytesResult(await read('contenthash', [node]))

  let abiData: string | null = null
  const abiRaw = await read('ABI', [node, QA_RECORD_ABI.contentType])
  try {
    if (abiRaw && abiRaw !== '0x') {
      const [, data] = decodeAbiParameters(
        [{ type: 'uint256' }, { type: 'bytes' }],
        abiRaw as Hex,
      )
      abiData = data && data !== '0x' ? data : null
    }
  } catch {
    abiData = null
  }

  // pubkey returns (bytes32 x, bytes32 y). Comparing x distinguishes a written
  // key from an all-zero unset one.
  const pkRaw = await read('pubkey', [node])
  const pkX = pkRaw && pkRaw !== '0x' ? `0x${pkRaw.slice(2, 66)}` : null

  const ifaceRaw = await read('interfaceImplementer', [
    node,
    QA_RECORD_INTERFACE.interfaceId,
  ])
  const iface = ifaceRaw && ifaceRaw !== '0x' ? `0x${ifaceRaw.slice(26)}` : null

  return [
    {
      kind: 'contenthash',
      migratable: true,
      present: ch === QA_RECORD_CONTENTHASH,
      value: ch,
    },
    {
      kind: 'ABI',
      migratable: true,
      present: abiData === QA_RECORD_ABI.value,
      value: abiData,
    },
    {
      kind: 'pubkey',
      migratable: false,
      present: pkX === QA_RECORD_PUBKEY.x,
      value: pkX,
    },
    {
      kind: 'interface',
      migratable: false,
      present:
        (iface ?? '').toLowerCase() ===
        QA_RECORD_INTERFACE.implementer.toLowerCase(),
      value: iface,
    },
  ]
}

/**
 * Every record kind the fixture writes, read off one resolver.
 *
 * Point it at the V1 record resolver to confirm the fixture landed, or at a
 * migrated name's V2 resolver to see which kinds survived. `migratable` marks
 * the kinds `Profile` can represent — those are expected to be carried; the rest
 * are expected to be lost, and this is what proves it either way.
 */
export async function readAllV1Records(
  endpoint: string,
  node: `0x${string}`,
  resolver: string = V1_RECORD_RESOLVER,
  /**
   * Set when probing a MIGRATED name's V2 resolver: social handles are
   * normalised by migration, so `@ens_qa` is expected to read as `ens_qa`.
   * Without this the transform looks identical to the record being dropped.
   */
  expectMigrated = false,
): Promise<RecordProbe[]> {
  const read = resolverReader(endpoint, resolver)
  return [
    ...(await readMigratableRecords(node, read, expectMigrated)),
    ...(await readUnmigratableRecords(node, read)),
  ]
}

export async function setNameFuses(
  endpoint: string,
  label: string,
  fuses: number,
): Promise<void> {
  const lh = labelhash(label)
  const node = namehashFromLabelAndParent(lh, ETH_NODE)
  await sendTx(
    endpoint,
    V1_NAME_WRAPPER,
    encodeFunctionData({
      abi: nameWrapperSetFusesSnippet,
      functionName: 'setFuses',
      args: [node, fuses],
    }),
  )
}

/** Read the live BaseRegistrar `owner()` off the fork; null if the call fails. */
export async function readRegistrarOwner(
  endpoint: string,
): Promise<`0x${string}` | null> {
  try {
    const result = (await rpcCall(endpoint, 'eth_call', [
      {
        to: V1_BASE_REGISTRAR,
        data: encodeFunctionData({
          abi: baseRegistrarOwnerSnippet,
          functionName: 'owner',
        }),
      },
      'latest',
    ])) as string
    if (typeof result !== 'string' || result.length < 66) return null
    return `0x${result.slice(-40)}` as `0x${string}`
  } catch {
    return null
  }
}

/** True if `account` is an authorized controller on the BaseRegistrar. */
export async function isController(
  endpoint: string,
  account: string,
): Promise<boolean> {
  try {
    const result = (await rpcCall(endpoint, 'eth_call', [
      {
        to: V1_BASE_REGISTRAR,
        data: encodeFunctionData({
          abi: baseRegistrarControllersSnippet,
          functionName: 'controllers',
          args: [account as `0x${string}`],
        }),
      },
      'latest',
    ])) as string
    return typeof result === 'string' && /[1-9a-f]/.test(result.slice(2))
  } catch {
    return false
  }
}

/**
 * Ensure DEFAULT_ACCOUNT is ready: fund it, clear any EOF contract code, and
 * re-authorize it as a controller on the official BaseRegistrar.
 *
 * ENS revoked all V1 controllers at ~block 10927919 as part of the V2 migration
 * cutover, so on a fresh Anvil fork no one can call BaseRegistrar.register().
 * We fix this by impersonating the BaseRegistrar owner and calling addController().
 *
 * The owner is read live off the fork (`owner()`) rather than hardcoded: it was
 * transferred on Sepolia, and impersonating a stale owner makes `addController`
 * revert silently, so DEFAULT_ACCOUNT never becomes a controller and every
 * `register()` reverts — producing phantom names that exist only in the
 * subgraph mock. We verify the grant landed and throw loudly if it didn't.
 */
export async function ensureFunded(endpoint: string): Promise<void> {
  const TARGET = '0x56BC75E2D63100000' // 100 ETH in wei
  // Clear EOF code so Anvil treats the account as a plain EOA
  await rpcCall(endpoint, 'anvil_setCode', [DEFAULT_ACCOUNT, '0x'])
  await rpcCall(endpoint, 'anvil_setBalance', [DEFAULT_ACCOUNT, TARGET])
  const actual = (await rpcCall(endpoint, 'eth_getBalance', [
    DEFAULT_ACCOUNT,
    'latest',
  ])) as string
  if (BigInt(actual) < BigInt('0x16345785D8A0000') /* 0.1 ETH */) {
    throw new Error(
      `anvil_setBalance did not work — balance is ${actual} (hex). Try running fund-account.sh manually.`,
    )
  }

  if (!(await isController(endpoint, DEFAULT_ACCOUNT))) {
    // Read the LIVE registrar owner off the fork — it has been transferred on
    // Sepolia, so the hardcoded constant is only a fallback if the read fails.
    const registrarOwner =
      (await readRegistrarOwner(endpoint)) ?? V1_BASE_REGISTRAR_OWNER

    // Impersonate the BaseRegistrar owner to re-authorize DEFAULT_ACCOUNT as a controller
    await rpcCall(endpoint, 'anvil_impersonateAccount', [registrarOwner])
    try {
      await sendTxFrom(
        endpoint,
        registrarOwner,
        V1_BASE_REGISTRAR,
        encodeFunctionData({
          abi: baseRegistrarAddControllerSnippet,
          functionName: 'addController',
          args: [DEFAULT_ACCOUNT],
        }),
      )
    } finally {
      await rpcCall(endpoint, 'anvil_stopImpersonatingAccount', [
        registrarOwner,
      ])
    }

    // Anvil includes reverted impersonated txs without throwing, so verify the
    // grant actually landed rather than trusting the send. If it didn't, the
    // owner we impersonated is wrong for this fork — fail loudly instead of
    // silently registering phantom names later.
    if (!(await isController(endpoint, DEFAULT_ACCOUNT))) {
      throw new Error(
        `Failed to authorize ${DEFAULT_ACCOUNT} as a BaseRegistrar controller ` +
          `(impersonated owner ${registrarOwner}). The registrar owner on this ` +
          `fork may have changed again — check BaseRegistrar.owner().`,
      )
    }
  }

  // This must run even when the V1 controller grant already exists: Anvil and
  // the names cookie can survive a deployment-address update during HMR.
  await ensureV2MigrationControllerRoles(endpoint)
}

const ROOT_RESOURCE = 0n
const V2_ROLES_STORAGE_SLOT = 2n
const ROLE_REGISTER_RESERVED = 1n << 4n

const V2_ROOT_ROLES_SLOT = keccak256(
  encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'uint256' }],
    [ROOT_RESOURCE, V2_ROLES_STORAGE_SLOT],
  ),
)

function v2ControllerRoleStorageSlot(account: Address): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'bytes32' }],
      [account, V2_ROOT_ROLES_SLOT],
    ),
  )
}

/** Ensure both migration controllers can register reserved names on the fork. */
async function ensureV2MigrationControllerRoles(
  endpoint: string,
): Promise<void> {
  for (const controller of V2_MIGRATION_CONTROLLERS) {
    const storageSlot = v2ControllerRoleStorageSlot(controller)
    const stored = await rpcCall(endpoint, 'eth_getStorageAt', [
      V2_ETH_REGISTRY_ADDR,
      storageSlot,
      'latest',
    ])
    if (typeof stored !== 'string' || !stored.startsWith('0x')) {
      throw new Error(
        `Unable to read V2 roles for migration controller ${controller}`,
      )
    }

    const roles = BigInt(stored)
    const rolesWithReservedRegistration = roles | ROLE_REGISTER_RESERVED
    if (rolesWithReservedRegistration === roles) continue

    await rpcCall(endpoint, 'anvil_setStorageAt', [
      V2_ETH_REGISTRY_ADDR,
      storageSlot,
      toHex(rolesWithReservedRegistration, { size: 32 }),
    ])
  }
}

/**
 * Create a RESERVED slot in the V2 ETH registry for a name by impersonating
 * the ETH_REGISTRAR account (which holds ROLE_REGISTRAR on the registry).
 * Skips silently if the slot is already reserved.
 * For grace-period names (expiryDate in the past), also skips — those slots
 * would immediately be AVAILABLE and migration controllers can't use them.
 */
/**
 * @param resolver Resolver recorded on the V2 reservation. MUST be the same
 * resolver the fixture set on V1, because the explorer reads a name's resolver
 * from the V2 side: if the two disagree it renders that V2 address and reports
 * "Records set 0" for a name whose V1 records are perfectly fine. Real Sepolia
 * names hide this because their V1 resolver usually *is* V1_PUBLIC_RESOLVER,
 * which is what this used to hardcode.
 */
export async function reserveInV2(
  endpoint: string,
  label: string,
  expiryDate: number,
  resolver: Address = V1_PUBLIC_RESOLVER,
): Promise<void> {
  const now = await getBlockTimestamp(endpoint)
  if (expiryDate <= now) return // expired slot = AVAILABLE, controllers can't migrate
  const currentStatus = await getV2NameStatus(endpoint, label)
  if (currentStatus === V2_NAME_STATUS.RESERVED) return
  if (currentStatus === V2_NAME_STATUS.REGISTERED) return
  if (currentStatus !== V2_NAME_STATUS.AVAILABLE) {
    throw new Error(`Unable to read the V2 registry status for ${label}.eth`)
  }

  await reserveKnownAvailableNameInV2(endpoint, label, expiryDate, resolver)
}

async function reserveKnownAvailableNameInV2(
  endpoint: string,
  label: string,
  expiryDate: number,
  resolver: Address = V1_PUBLIC_RESOLVER,
): Promise<void> {
  await rpcCall(endpoint, 'anvil_impersonateAccount', [V2_ETH_REGISTRAR_ADDR])
  try {
    const data = encodeFunctionData({
      abi: userRegistryRegisterSnippet,
      functionName: 'register',
      args: [
        label,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        resolver,
        0n,
        BigInt(expiryDate),
      ],
    })
    await sendTxFrom(
      endpoint,
      V2_ETH_REGISTRAR_ADDR,
      V2_ETH_REGISTRY_ADDR,
      data,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (
      !msg.includes('LabelAlreadyReserved') &&
      !msg.includes('AlreadyRegistered')
    )
      throw err
  } finally {
    await rpcCall(endpoint, 'anvil_stopImpersonatingAccount', [
      V2_ETH_REGISTRAR_ADDR,
    ])
  }

  const updatedStatus = await getV2NameStatus(endpoint, label)
  if (
    updatedStatus !== V2_NAME_STATUS.RESERVED &&
    updatedStatus !== V2_NAME_STATUS.REGISTERED
  ) {
    throw new Error(
      `Failed to reserve ${label}.eth in the active V2 registry (status ${String(updatedStatus)})`,
    )
  }
}

/**
 * Top-level dispatch — creates the V1 name on Anvil, reserves it in V2,
 * and returns { label, expiryDate } for the active names list.
 */
/**
 * Create every node of a preset that declares descendants, driven by
 * `walkPreset` so the chain and the subgraph mock cannot disagree about what
 * exists.
 *
 * Ordering is load-bearing in two places:
 *
 *  - the 2LD's own fuses are burned BEFORE any descendant, because the
 *    NameWrapper refuses to burn PARENT_CANNOT_CONTROL on a child unless the
 *    parent already has CANNOT_UNWRAP;
 *  - `walkPreset` yields parent-first, so a descendant's parent always exists
 *    by the time `setSubnodeOwner` is called for it.
 */
/** Write each descendant on chain, parent-first (the walk already orders them). */
async function createDescendants(
  endpoint: string,
  descendants: readonly PresetNode[],
): Promise<void> {
  for (const node of descendants) {
    if (node.wrapped) {
      await createWrappedSubnameWithFuses(
        endpoint,
        node.parentNode,
        node.label,
        node.fuses,
        node.holder,
      )
    } else {
      await createRegistryOnlySubname(
        endpoint,
        node.parentNode,
        node.label,
        node.holder,
      )
    }
  }
}

/**
 * Point every node that declares a resolver at it, and write records where the
 * node asks for them.
 *
 * A node can declare a resolver WITHOUT records — that is exactly the
 * `unsupported-resolver` fixture. It still has to be set on chain, or the
 * subgraph mock would report a resolver the chain does not have, which is the
 * mock/chain divergence this whole walk exists to prevent.
 */
async function writeNodeResolvers(
  endpoint: string,
  nodes: readonly PresetNode[],
): Promise<void> {
  for (const node of nodes) {
    if (node.resolver === 'none') continue
    if (node.resolver === 'custom') await ensureCustomResolverDeployed(endpoint)
    const resolver =
      node.resolver === 'custom' ? V1_CUSTOM_RESOLVER : V1_RECORD_RESOLVER
    if (node.records) {
      await writeV1Records(endpoint, node.node, node.wrapped, resolver)
    } else {
      await setV1Resolver(endpoint, node.node, node.wrapped, resolver)
    }
  }
}

async function createPresetTreeOnAnvil(
  endpoint: string,
  label: string,
  type: PresetType,
): Promise<{ label: string; expiryDate: number }> {
  const shape = PRESET_SHAPES[type]
  const nodes = walkPreset(label, type)
  const [root, ...descendants] = nodes
  if (!root) throw new Error(`walkPreset(${type}) produced no root`)

  await registerV1Name(endpoint, label, shape.parentWrapped)
  // `wrapETH2LD` burns PCC|IS_DOT_ETH itself; only the owner-controlled bits
  // are settable, and only on a wrapped name.
  const ownerBits = childSettableFuses(shape.parentFuses)
  if (shape.parentWrapped && ownerBits !== 0) {
    await setNameFuses(endpoint, label, ownerBits)
  }

  await createDescendants(endpoint, descendants)
  await writeNodeResolvers(endpoint, nodes)

  const ts = await getBlockTimestamp(endpoint)
  const expiryDate = ts + ONE_YEAR
  // Reserve with the SAME resolver the 2LD's records went to, so the explorer
  // reads the resolver the records are actually on rather than reporting zero.
  await reserveInV2(
    endpoint,
    label,
    // The grace preset outlives its V1 expiry; reserve the way production
    // pre-migration does, or the V2 slot lapses first and the name reads as
    // unregistered rather than in grace.
    type === 'reassign-grace'
      ? expiryDate + PREMIGRATION_BONUS_PERIOD
      : expiryDate,
    root.records ? recordResolverFor(type) : undefined,
  )
  await finishReassignPreset(endpoint, type, nodes)
  return { label, expiryDate }
}

/**
 * The #1144 reassign presets whose defining write comes AFTER the tree
 * exists, which `PresetNodeShape` cannot express — the same reason
 * `manager-only` is an imperative arm rather than a shape.
 */
async function finishReassignPreset(
  endpoint: string,
  type: PresetType,
  nodes: readonly PresetNode[],
): Promise<void> {
  const [root, child] = nodes
  if (!root || !child) return
  switch (type) {
    // Unwrap the child onto account 1: the parent stays wrapped, the child
    // becomes a plain registry node held by somebody else.
    case 'reassign-mismatch':
      await sendTx(
        endpoint,
        V1_NAME_WRAPPER,
        encodeFunctionData({
          abi: parseAbi([
            'function unwrap(bytes32 parentNode, bytes32 labelhash, address controller)',
          ]),
          functionName: 'unwrap',
          args: [child.parentNode, labelhash(child.label), V1_DISTINCT_MANAGER],
        }),
      )
      return
    // Hand the parent's controller away, keeping its ERC-721.
    case 'reassign-registrant-only':
      await sendTx(
        endpoint,
        V1_ENS_REGISTRY,
        encodeFunctionData({
          abi: parseAbi(['function setOwner(bytes32 node, address owner)']),
          functionName: 'setOwner',
          args: [root.node, V1_THIRD_ACCOUNT],
        }),
      )
      return
    // 30 days into the 2LD's 90-day grace period. The children's wrapper
    // expiry is the 2LD's plus grace, so they are still live.
    case 'reassign-grace':
      await increaseTime(endpoint, ONE_YEAR + 30 * 86_400)
      return
  }
}

/**
 * Where the panel's **Open** button lands. A transfer preset built around a
 * subname opens the SUBNAME — the 2LD is only there to be its parent, and
 * making the tester edit the URL invites testing the wrong name.
 */
export const ownershipTargetFor = (name: {
  label: string
  type: PresetType
}): string => {
  const [root, firstChild] = walkPreset(name.label, name.type)
  return PRESET_FAMILY[name.type] === 'transfer' && firstChild
    ? firstChild.fullName
    : (root?.fullName ?? `${name.label}.eth`)
}

export async function createV1NameOnAnvil(
  endpoint: string,
  label: string,
  type: PresetType,
): Promise<{ label: string; expiryDate: number }> {
  await ensureFunded(endpoint)
  // Every preset with descendants goes through one walk-driven path. The
  // per-preset arms this replaced each restated the same three steps and could
  // only ever reach depth 1, because the builders hardcoded the parent as a 2LD.
  if (presetHasSubname(type))
    return createPresetTreeOnAnvil(endpoint, label, type)
  switch (type) {
    case 'unwrapped': {
      await registerV1Name(endpoint, label, false)
      const ts = await getBlockTimestamp(endpoint)
      const expiryDate = ts + ONE_YEAR
      await reserveInV2(endpoint, label, expiryDate)
      return { label, expiryDate }
    }
    // Registrant and controller in different hands, with YOU holding only the
    // controller. `BaseRegistrar.safeTransferFrom` moves the ERC-721 and
    // pointedly does NOT touch the ENSRegistry — which is the whole reason
    // `reclaim` exists as a separate call, and why a V1 transfer needs two
    // writes rather than one.
    case 'manager-only': {
      await registerV1Name(endpoint, label, false)
      const ts = await getBlockTimestamp(endpoint)
      const expiryDate = ts + ONE_YEAR
      // Reserved in V2 like every other preset. An earlier revision skipped
      // this on the theory that a reserved slot would route the page to the V2
      // component — tested, and false. What it actually did was make the name
      // invisible: `resolveEnsOwner` needs the V2 reservation to resolve a V1
      // name at all, so the portal answered "Name not registered" for a name
      // plainly on chain. Measured: V2 status 0 -> not registered, status 1 ->
      // renders correctly.
      await reserveInV2(endpoint, label, expiryDate)
      await sendTx(
        endpoint,
        V1_BASE_REGISTRAR,
        encodeFunctionData({
          abi: parseAbi([
            'function safeTransferFrom(address from, address to, uint256 tokenId)',
          ]),
          functionName: 'safeTransferFrom',
          args: [
            DEFAULT_ACCOUNT,
            V1_DISTINCT_MANAGER,
            BigInt(labelhash(label)),
          ],
        }),
      )
      return { label, expiryDate }
    }
    // The mirror of `manager-only`: keep the ERC-721, hand the ENSRegistry
    // controller to a third account. `setOwner` on the legacy registry does
    // not touch the registrar, so the registrant stays put — which is why the
    // transfer is still allowed and why `reclaim` has real work to do.
    case 'owner-not-manager': {
      await registerV1Name(endpoint, label, false)
      const ts = await getBlockTimestamp(endpoint)
      const expiryDate = ts + ONE_YEAR
      await reserveInV2(endpoint, label, expiryDate)
      await sendTx(
        endpoint,
        V1_ENS_REGISTRY,
        encodeFunctionData({
          abi: parseAbi(['function setOwner(bytes32 node, address owner)']),
          functionName: 'setOwner',
          args: [nodeForPath([label]), V1_THIRD_ACCOUNT],
        }),
      )
      return { label, expiryDate }
    }
    case 'wrapped': {
      await registerV1Name(endpoint, label, true)
      const ts = await getBlockTimestamp(endpoint)
      const expiryDate = ts + ONE_YEAR
      await reserveInV2(endpoint, label, expiryDate)
      return { label, expiryDate }
    }
    case 'locked': {
      await registerV1Name(endpoint, label, true)
      await setNameFuses(endpoint, label, CANNOT_UNWRAP)
      const ts = await getBlockTimestamp(endpoint)
      const expiryDate = ts + ONE_YEAR
      await reserveInV2(endpoint, label, expiryDate)
      return { label, expiryDate }
    }
    case 'locked-all': {
      await registerV1Name(endpoint, label, true)
      await setNameFuses(endpoint, label, ALL_CHILD_FUSES)
      const ts = await getBlockTimestamp(endpoint)
      const expiryDate = ts + ONE_YEAR
      await reserveInV2(endpoint, label, expiryDate)
      return { label, expiryDate }
    }
    case 'grace': {
      await registerV1Name(endpoint, label, true)
      await setNameFuses(endpoint, label, CANNOT_UNWRAP)
      const ts = await getBlockTimestamp(endpoint)
      const expiryDate = ts
      await increaseTime(endpoint, ONE_YEAR + 45 * 86_400)
      return { label, expiryDate }
    }
    case 'grace-renewable-wrapped': {
      // Like `grace` (v1 name pushed 45 days into its 90-day grace window), but
      // the v2 slot is RESERVED with an expiry that OUTLASTS the v1 expiry.
      // `ETHRenewerV1.isRenewable` gates on the v2 reservation, not the v1 grace
      // clock, so this is the only state that is BOTH in-grace AND renewable.
      // WRAPPED variant: renewal extends the BaseRegistrar but NOT the
      // NameWrapper's stored expiry, so after renewal the ERC-1155 token stays
      // expired and migration reverts (ERC1155 insufficient balance) — use this
      // to reproduce that; use the unwrapped variant for the migrate happy-path.
      await registerV1Name(endpoint, label, true)
      await setNameFuses(endpoint, label, CANNOT_UNWRAP)
      const ts = await getBlockTimestamp(endpoint)
      const expiryDate = ts + ONE_YEAR // true v1 expiry (in the past after the advance below)
      // Reserve at v1 expiry + bonus, exactly as production pre-migration does, so
      // the renewable window is the real 90 days (not indefinite).
      await reserveInV2(endpoint, label, expiryDate + PREMIGRATION_BONUS_PERIOD)
      await increaseTime(endpoint, ONE_YEAR + 45 * 86_400)
      return { label, expiryDate }
    }
    case 'grace-renewable-unwrapped': {
      // Unwrapped counterpart of `grace-renewable-wrapped`: renewable in grace
      // (v2 reservation outlasts the v1 expiry) but held directly as the ERC-721
      // in the BaseRegistrar — so renewal revives the same token migration
      // transfers, and renew→migrate completes end-to-end.
      await registerV1Name(endpoint, label, false)
      const ts = await getBlockTimestamp(endpoint)
      const expiryDate = ts + ONE_YEAR
      // Reserve at v1 expiry + bonus, matching production pre-migration.
      await reserveInV2(endpoint, label, expiryDate + PREMIGRATION_BONUS_PERIOD)
      await increaseTime(endpoint, ONE_YEAR + 45 * 86_400)
      return { label, expiryDate }
    }
    case 'records':
    case 'custom-resolver': {
      // Unwrapped on purpose: the registry owner is this account, so setResolver
      // and the record writes all authorise directly. The two presets differ
      // ONLY in which resolver the records go to, so any difference in the
      // migration outcome is attributable to resolver recognition alone.
      await registerV1Name(endpoint, label, false)
      if (type === 'custom-resolver') {
        await ensureCustomResolverDeployed(endpoint)
      }
      await writeV1Records(
        endpoint,
        nodeForLabel(label),
        false,
        recordResolverFor(type),
      )
      const ts = await getBlockTimestamp(endpoint)
      const expiryDate = ts + ONE_YEAR
      // Reserve with the SAME resolver the records went to, so the explorer
      // (which reads the resolver off V2) shows them instead of reporting zero.
      await reserveInV2(endpoint, label, expiryDate, recordResolverFor(type))
      return { label, expiryDate }
    }
    case 'locked-no-transfer':
    case 'locked-no-resolver': {
      // Isolate ONE extra fuse on top of a locked 2LD. `Locked+All` burns all
      // seven at once, so it cannot show which fuse caused an outcome:
      // CANNOT_TRANSFER is what actually makes it ineligible.
      await registerV1Name(endpoint, label, true)
      await setNameFuses(
        endpoint,
        label,
        childSettableFuses(PRESET_SHAPES[type].parentFuses),
      )
      const ts = await getBlockTimestamp(endpoint)
      const expiryDate = ts + ONE_YEAR
      await reserveInV2(endpoint, label, expiryDate)
      return { label, expiryDate }
    }
    case 'managed': {
      // Registrant stays DEFAULT_ACCOUNT (holds the ERC-721); reclaim() moves the
      // V1 registry owner to a different address, which is what makes
      // `classifyNames` report a managerAddress and what the migration then has
      // to restore on V2.
      await registerV1Name(endpoint, label, false)
      await reclaimV1Manager(endpoint, label, V1_DISTINCT_MANAGER)
      const ts = await getBlockTimestamp(endpoint)
      const expiryDate = ts + ONE_YEAR
      await reserveInV2(endpoint, label, expiryDate)
      return { label, expiryDate }
    }
  }
  // Unreachable: `presetHasSubname` handled every descendant preset above and
  // the switch is exhaustive over the rest. A new PresetType that forgets both
  // lands here rather than silently returning undefined.
  throw new Error(`createV1NameOnAnvil: unhandled preset "${type}"`)
}

// --- Copy-target state ------------------------------------------------------

/**
 * Whether a preset's copy targets are still clean enough to migrate.
 *
 * A copy is re-created inside a `UserRegistry` whose address is derived from
 * `namehash(parentName)`, so re-migrating the SAME name lands in the same slot
 * every time. `copyMigrationReadiness` then fails closed — `subregistry-conflict`
 * if the .eth registry already points at something, `v2-name-history` if the
 * child already has a state entry there — and the app surfaces none of that:
 * the Upgrade button simply stays disabled under "Gas estimate unavailable".
 *
 * Reading it here turns a dead button into a visible reason.
 */
export type CopyTargetState = 'pristine' | 'registry-deployed' | 'registered'

/**
 * Read whether the 2LD already has a subregistry in the .eth registry.
 *
 * This is `assertNewRegistrySlot`'s first check. A non-zero answer means a
 * previous run of this same label already deployed the parent's UserRegistry,
 * and a fresh-plan migration of it will be refused.
 */
export async function readCopyTargetState(
  endpoint: string,
  label: string,
): Promise<CopyTargetState> {
  const data = encodeFunctionData({
    abi: parseAbi([
      'function getSubregistry(string label) view returns (address)',
    ]),
    functionName: 'getSubregistry',
    args: [label],
  })
  const result = (await rpcCall(endpoint, 'eth_call', [
    { to: V2_ETH_REGISTRY_ADDR, data },
    'latest',
  ])) as string | null
  if (!result || result === '0x') return 'pristine'
  const subregistry = `0x${result.slice(-40)}`
  if (/^0x0+$/.test(subregistry)) return 'pristine'
  return 'registry-deployed'
}

/**
 * Clear the deterministic UserRegistry slot for `label` so a copy preset can be
 * migrated again.
 *
 * This wipes the CODE at the predicted proxy address. It does not, and cannot,
 * undo the `.eth` registry's subregistry pointer or the child's state entry —
 * those live in the parent registry, which is the point of `v2-name-history`
 * being a fail-closed check. For a genuine reset, re-seed the preset under a
 * fresh label (every press of a preset button mints one), which lands in a
 * different slot because the salt is keyed on `namehash(parentName)`.
 */
export async function resetCopyTarget(
  endpoint: string,
  registry: Address,
): Promise<void> {
  await rpcCall(endpoint, 'anvil_setCode', [registry, '0x'])
}

// --- Subgraph mock ----------------------------------------------------------

/**
 * Build a minimal V1 subgraph domain object for a panel-created name.
 * Injected into getNamesForAddress responses so the migration UI finds the name.
 */
export function buildMockDomain(name: ActiveName): unknown {
  const lh = labelhash(name.label)
  const node = namehashFromLabelAndParent(lh, ETH_NODE)
  // Shape comes from PRESET_SHAPES so the mock cannot drift from what
  // `createV1NameOnAnvil` actually writes on-chain.
  const shape = PRESET_SHAPES[name.type]
  const isWrapped = shape.parentWrapped
  const fuses = shape.parentFuses
  const owner = DEFAULT_ACCOUNT.toLowerCase()
  // `owner` is the V1 registry owner == the manager. For `managed` it is
  // deliberately not the registrant, which is what classifyNames keys on.
  const registryOwner =
    name.type === 'managed' ? V1_DISTINCT_MANAGER.toLowerCase() : owner
  const now = Math.floor(Date.now() / 1000)

  return {
    id: node,
    labelName: name.label,
    labelhash: lh,
    name: `${name.label}.eth`,
    isMigrated: false,
    createdAt: String(now - 3600),
    resolvedAddress: null,
    // A record-bearing preset must report a resolver even when unwrapped —
    // `classifyNames` reads `resolver.address` as `v1ResolverAddress`, and the
    // profile fetch multicalls that address for the record values. It must also
    // be the SAME resolver the records were written to, and a recognised one, or
    // the strategy degrades to `keep-v1` and nothing is replayed.
    resolver: resolverRefFor(
      presetHasParentRecords(name.type),
      isWrapped,
      recordResolverFor(name.type),
    ),
    owner: { id: isWrapped ? V1_NAME_WRAPPER.toLowerCase() : registryOwner },
    registrant: { id: owner },
    wrappedOwner: isWrapped ? { id: owner } : null,
    parent: { name: 'eth', id: ETH_NODE, wrappedDomain: null },
    registration: {
      registrationDate: String(now - 3600),
      expiryDate: String(name.expiryDate),
    },
    wrappedDomain: isWrapped
      ? { expiryDate: String(name.expiryDate), fuses }
      : null,
  }
}

/**
 * One descendant of a preset, at any depth, shaped from its `walkPreset` entry.
 *
 * Every field here is what makes `classifyName` take one branch rather than
 * another, and each was previously derived from a depth-1-only assumption:
 *
 * - `owner.id` is the NameWrapper for a wrapped node and the EOA otherwise.
 *   `classifyWithoutActiveWrapper` reads it as the REGISTRY owner, which is the
 *   whole gate in front of the `registry-child` copy branch.
 * - `parent.wrappedDomain.fuses` carries the immediate parent's real fuses —
 *   the only way `classifyUnlockedWrapper` can tell `detached-child` (a token
 *   migration under a locked parent) from `unlocked-child` (a copy).
 * - `registration` and `registrant` are 2LD-only. Supplying them on a child
 *   makes `hasExpiredDotEthRegistration` treat it as a .eth registration.
 * - a null resolver is a real, ELIGIBLE state for a copy.
 */
export function buildMockDescendantDomain(
  name: ActiveName,
  node: PresetNode,
): unknown {
  const now = Math.floor(Date.now() / 1000)
  const owner = DEFAULT_ACCOUNT.toLowerCase()
  const resolver =
    node.resolver === 'none'
      ? null
      : node.resolver === 'custom'
        ? V1_CUSTOM_RESOLVER
        : V1_RECORD_RESOLVER

  return {
    id: node.node,
    labelName: node.label,
    labelhash: labelhash(node.label),
    name: node.fullName,
    isMigrated: false,
    createdAt: String(now - 3600),
    resolvedAddress: null,
    resolver: resolver ? { id: resolver, address: resolver } : null,
    owner: { id: node.wrapped ? V1_NAME_WRAPPER.toLowerCase() : owner },
    registrant: null,
    wrappedOwner: node.wrapped ? { id: owner } : null,
    parent: {
      name: node.parentFullName,
      id: node.parentNode,
      wrappedDomain: node.parentWrapped
        ? {
            expiryDate: String(name.expiryDate),
            fuses: node.parentFuses,
          }
        : null,
    },
    registration: null,
    wrappedDomain: node.wrapped
      ? { expiryDate: String(name.expiryDate), fuses: node.fuses }
      : null,
  }
}

/** Every subgraph domain a single active name contributes (2LD, plus child). */
export function buildMockDomains(name: ActiveName): unknown[] {
  // `offer: false` nodes exist on chain but are deliberately withheld from the
  // injection — that is how a name whose parent is missing from the selection
  // is built, and it is the whole point of the `copy-orphan` preset.
  return walkPreset(name.label, name.type)
    .filter((node) => node.offer)
    .map((node) =>
      node.depth === 0
        ? buildMockDomain(name)
        : buildMockDescendantDomain(name, node),
    )
}

/**
 * Profile-key rows for the `getProfilesForDomains` query, which the migration
 * flow uses to learn WHICH records a name has before multicalling the resolver
 * for their values. Without this the hosted subgraph is asked about Anvil-only
 * names, returns nothing, and record replay silently has nothing to replay.
 */
type MockProfileRow = {
  id: string
  resolver: {
    texts: string[]
    coinTypes: number[]
    /**
     * contenthash and ABI content types were added to `getProfilesForDomains`
     * when contenthash/ABI preservation landed. They are how the migration
     * learns those records EXIST — omit them and both are silently skipped, so
     * a stale mock here looks exactly like the preservation fix not working.
     */
    contentHash: string | null
    abiChangeds: { contentType: number }[]
  }
}

export function buildMockProfileRows(name: ActiveName): MockProfileRow[] {
  const rows: MockProfileRow[] = []
  const keys = () => ({
    texts: [...QA_RECORD_TEXT_KEYS],
    coinTypes: [...QA_RECORD_COIN_TYPES],
    contentHash: QA_RECORD_CONTENTHASH,
    abiChangeds: [{ contentType: Number(QA_RECORD_ABI.contentType) }],
  })
  for (const node of walkPreset(name.label, name.type)) {
    if (node.records && node.offer)
      rows.push({ id: node.node, resolver: keys() })
  }
  return rows
}

// --- Anvil on-chain sync helpers --------------------------------------------

const V2_NAME_STATUS = {
  AVAILABLE: 0,
  RESERVED: 1,
  REGISTERED: 2,
} as const

const V2_GET_STATUS_ABI = [
  {
    type: 'function',
    name: 'getStatus',
    stateMutability: 'view',
    inputs: [{ name: 'anyId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const

function baseRegistrarReadCall(
  selector: `0x${string}`,
  label: string,
): RpcReadCall {
  const tokenIdPadded = labelhash(label).slice(2).padStart(64, '0')
  return {
    method: 'eth_call',
    params: [
      { to: V1_BASE_REGISTRAR, data: `${selector}${tokenIdPadded}` },
      'latest',
    ],
  }
}

function v2StatusReadCall(label: string): RpcReadCall {
  return {
    method: 'eth_call',
    params: [
      {
        to: V2_ETH_REGISTRY_ADDR,
        data: encodeFunctionData({
          abi: V2_GET_STATUS_ABI,
          functionName: 'getStatus',
          args: [BigInt(labelhash(label))],
        }),
      },
      'latest',
    ],
  }
}

function decodeV2NameStatus(result: unknown): number | null {
  try {
    if (typeof result !== 'string' || result === '0x') return null
    return Number(BigInt(result))
  } catch {
    return null
  }
}

async function getV2NameStatuses(
  endpoint: string,
  labels: readonly string[],
): Promise<(number | null)[]> {
  const results = await rpcReadBatch(
    endpoint,
    labels.map((label) => v2StatusReadCall(label)),
  )
  return results.map(decodeV2NameStatus)
}

async function getV2NameStatus(
  endpoint: string,
  label: string,
): Promise<number | null> {
  return (await getV2NameStatuses(endpoint, [label]))[0] ?? null
}

/**
 * Returns true if the .eth label is registered in the official BaseRegistrar on
 * the Anvil fork (ownerOf returns a non-zero address). This is the same
 * contract preflightChecks.ts uses for eligibility, so alignment is critical.
 */
export async function isNameOnAnvil(
  endpoint: string,
  label: string,
): Promise<boolean> {
  return (await getNamesOnAnvil(endpoint, [label]))[0] ?? false
}

/** Read V1 registration existence in bounded JSON-RPC batches. */
export async function getNamesOnAnvil(
  endpoint: string,
  labels: readonly string[],
): Promise<boolean[]> {
  const results = await rpcReadBatch(
    endpoint,
    labels.map((label) => baseRegistrarReadCall('0x6352211e', label)),
  )
  return results.map(
    (result) =>
      typeof result === 'string' && result.length > 2 && result !== '0x',
  )
}

/**
 * Live BaseRegistrar expiry (unix seconds) for a .eth label on the Anvil fork,
 * or null if unregistered/unreadable. The panel stores each name's expiryDate at
 * creation, which goes STALE after an in-app renewal (or time-travel) — and the
 * subgraph mock feeds `registration.expiryDate` into migration eligibility
 * (`classifyName` → `hasExpiredDotEthRegistration`). Reading it live keeps the
 * mock in step with on-chain state so a renewed grace name correctly becomes
 * migratable instead of staying classified `expired-registration`.
 */
export async function getOnchainExpiry(
  endpoint: string,
  label: string,
): Promise<number | null> {
  return (await getOnchainExpiries(endpoint, [label]))[0] ?? null
}

/** Read live BaseRegistrar expiries in bounded JSON-RPC batches. */
export async function getOnchainExpiries(
  endpoint: string,
  labels: readonly string[],
): Promise<(number | null)[]> {
  const results = await rpcReadBatch(
    endpoint,
    labels.map((label) => baseRegistrarReadCall('0xd6e4fa86', label)),
  )
  return results.map((result) => {
    try {
      if (typeof result !== 'string' || result === '0x') return null
      const expiry = Number(BigInt(result))
      return expiry > 0 ? expiry : null
    } catch {
      return null
    }
  })
}

function fixtureReservationExpiry(name: ActiveName): number | null {
  if (name.type === 'grace') return null
  if (
    name.type === 'grace-renewable-wrapped' ||
    name.type === 'grace-renewable-unwrapped'
  ) {
    return name.expiryDate + PREMIGRATION_BONUS_PERIOD
  }
  return name.expiryDate
}

interface ExistingFixtureReservation {
  readonly nameIndex: number
  readonly label: string
  readonly expiryDate: number
}

async function getExistingFixtureReservationStatuses(
  endpoint: string,
  names: readonly ActiveName[],
  existingNames: readonly boolean[],
): Promise<
  Map<number, ExistingFixtureReservation & { readonly status: number | null }>
> {
  const candidates = names.flatMap((name, nameIndex) => {
    if (!existingNames[nameIndex]) return []
    const expiryDate = fixtureReservationExpiry(name)
    return expiryDate == null
      ? []
      : [{ nameIndex, label: name.label, expiryDate }]
  })
  if (candidates.length === 0) return new Map()

  const now = await getBlockTimestamp(endpoint)
  const activeCandidates = candidates.filter(
    ({ expiryDate }) => expiryDate > now,
  )
  const statuses = await getV2NameStatuses(
    endpoint,
    activeCandidates.map(({ label }) => label),
  )

  return new Map(
    activeCandidates.map((candidate, index) => [
      candidate.nameIndex,
      { ...candidate, status: statuses[index] ?? null },
    ]),
  )
}

async function ensureExistingFixtureReservation(
  endpoint: string,
  reservation: ExistingFixtureReservation & { readonly status: number | null },
): Promise<void> {
  if (reservation.status === V2_NAME_STATUS.RESERVED) return
  if (reservation.status === V2_NAME_STATUS.REGISTERED) return
  if (reservation.status !== V2_NAME_STATUS.AVAILABLE) {
    throw new Error(
      `Unable to read the V2 registry status for ${reservation.label}.eth`,
    )
  }
  await reserveKnownAvailableNameInV2(
    endpoint,
    reservation.label,
    reservation.expiryDate,
  )
}

/**
 * For any active names missing from the Anvil fork (fork was reset), re-create
 * them and return an updated list with fresh expiryDates.
 */
export async function ensureNamesOnAnvil(
  endpoint: string,
  names: ActiveName[],
): Promise<ActiveName[]> {
  const result: ActiveName[] = []
  const existingNames = await getNamesOnAnvil(
    endpoint,
    names.map((name) => name.label),
  )

  if (existingNames.some(Boolean))
    await ensureV2MigrationControllerRoles(endpoint)

  const existingReservations = await getExistingFixtureReservationStatuses(
    endpoint,
    names,
    existingNames,
  )

  for (const [index, name] of names.entries()) {
    const exists = existingNames[index] ?? false
    if (exists) {
      const reservation = existingReservations.get(index)
      if (reservation)
        await ensureExistingFixtureReservation(endpoint, reservation)
      result.push(name)
    } else {
      const { label, expiryDate } = await createV1NameOnAnvil(
        endpoint,
        name.label,
        name.type,
      )
      result.push({ ...name, label, expiryDate })
    }
  }
  return result
}

// --- localStorage helpers ---------------------------------------------------

// Panel-created names are persisted in a COOKIE rather than localStorage so the
// list is shared across the portal (:3001) and manager (:3000) dev servers —
// cookies are scoped by host, not port, whereas localStorage is per-origin.
// This lets the subgraph mock in one app inject names created in the other,
// which is required for the manager migration list to see portal-created names.
// Cookie-safe name (no colons — those are separators the cookie grammar
// disallows in a name, even though some browsers tolerate them).
const NAMES_COOKIE_NAME = 'ens_migration_tool_v1_names'
const NAMES_COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

function readNamesCookie(): string | null {
  const prefix = `${NAMES_COOKIE_NAME}=`
  for (const part of document.cookie.split('; ')) {
    if (part.startsWith(prefix))
      return decodeURIComponent(part.slice(prefix.length))
  }
  return null
}

export function readStoredNames(): ActiveName[] {
  try {
    const raw = readNamesCookie()
    if (!raw) return []
    return JSON.parse(raw) as ActiveName[]
  } catch {
    return []
  }
}

export function writeStoredNames(names: ActiveName[]): void {
  try {
    // No domain attribute → defaults to the current host (localhost), shared
    // across ports. SameSite=Lax keeps it same-site only.
    const value = encodeURIComponent(JSON.stringify(names))
    document.cookie = `${NAMES_COOKIE_NAME}=${value}; path=/; max-age=${NAMES_COOKIE_MAX_AGE}; SameSite=Lax`
  } catch {
    /* storage disabled */
  }
}

export function readStoredPos(): Pos | null {
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Pos>
    if (typeof parsed.left === 'number' && typeof parsed.top === 'number') {
      return { left: parsed.left, top: parsed.top }
    }
    return null
  } catch {
    return null
  }
}

export function clampPos(pos: Pos, el: HTMLElement | null): Pos {
  if (typeof window === 'undefined') return pos
  const width = el?.offsetWidth ?? 280
  const height = el?.offsetHeight ?? 320
  const maxLeft = Math.max(4, window.innerWidth - width - 4)
  const maxTop = Math.max(4, window.innerHeight - height - 4)
  return {
    left: Math.min(Math.max(4, pos.left), maxLeft),
    top: Math.min(Math.max(4, pos.top), maxTop),
  }
}
