/**
 * Machine-readable scenario registry — the definition of "all tests".
 *
 * Every row here comes from `e2e/docs/e2e-test-catalogue.md` Part 3 (the
 * scenario space) or, for the `HW*` rows, from `e2e-master-test-plan.md` §2
 * (harness). The catalogue is the prose; this file is the part a script can
 * count. They must stay in sync: adding a scenario to the catalogue without
 * adding it here means the reconciler will never notice it is missing.
 *
 * Rebuilt 2026-08-11 against the catalogue. Rows that predate it carry their
 * superseded id in `planId`. Where the two disagreed on what an id *meant*
 * (B10, H4/H8–H11, J7, K3–K10, L2–L4) the catalogue won and the displaced row
 * moved to its new suite — none of them were tagged, so no coverage moved with
 * them. See `handoff.md` for the full mapping.
 *
 * A scenario reaches a terminal state (PASS / DEFECT / EXEMPT) only through
 * evidence the reconciler can verify — see `reconcile.ts`. This file supplies
 * exactly one of those three: the written EXEMPT reason.
 *
 * ID namespacing note: the plan reuses the letter `H` for two different things
 * — §2 harness items H1–H10 and §5.H profile/dashboard scenarios H1–H11. Here
 * the harness items are `HW1`–`HW10` ("harness work") so the two never collide
 * in a `@scenario:` tag. The `planId` field carries the plan's own label.
 */

export const PHASES = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const
export type Phase = (typeof PHASES)[number]

/**
 * Risk tier — the axis the work is actually ordered by, per
 * `e2e-build-goal.md` §8. Ordered by *cost of being wrong*, not by dependency
 * convenience.
 *
 *   R0  irreversible & one-shot   migration, transfer, detach, fuse burns
 *   R1  financial                 registration/renewal pricing, payments
 *   R2  authorization             roles, registry/resolver permissions
 *   R3  display correctness       profile, dashboard, search, resolution
 *   R4  resilience & quality      fault injection, i18n, a11y, perf
 *   HW  harness                   not a scenario tier; tracked separately so
 *                                 bootstrap iterations show movement (§16.6)
 *
 * `phase` (P0–P6) is retained for traceability to the superseded
 * `e2e-master-test-plan.md`. It is no longer the ratchet key.
 */
export const TIERS = ['HW', 'R0', 'R1', 'R2', 'R3', 'R4'] as const
export type Tier = (typeof TIERS)[number]

/**
 * Tier by scenario-id prefix, from `e2e-test-catalogue.md` Part 3. A row may
 * override it (`{ tier: 'R0' }`) where a single suite spans two tiers — E, J, U
 * and X each do.
 */
const AREA_TIER: Record<string, Tier> = {
  HW: 'HW',
  // R0 — irreversible
  F: 'R0',
  G: 'R0',
  GW: 'R0',
  GS: 'R0',
  GR: 'R0',
  GM: 'R0',
  GA: 'R0',
  GU: 'R0',
  I: 'R0',
  // R1 — financial
  A: 'R1',
  B: 'R1',
  Y: 'R1',
  // R2 — authorization
  C: 'R2',
  D: 'R2',
  E: 'R2',
  J: 'R2',
  // R3 — display
  H: 'R3',
  N: 'R3',
  R: 'R3',
  S: 'R3',
  T: 'R3',
  U: 'R3',
  X: 'R3',
  Z: 'R3',
  MD: 'R3',
  // R4 — resilience & quality
  K: 'R4',
  L: 'R4',
}

/** Longest alphabetic prefix of an id — `GW3` → `GW`, `A21` → `A`. */
export const tierForId = (id: string): Tier => {
  const prefix = /^[A-Z]+/.exec(id)?.[0] ?? ''
  const tier = AREA_TIER[prefix]
  if (!tier) throw new Error(`No tier mapping for scenario id prefix "${id}"`)
  return tier
}

export type App = 'manager' | 'portal' | 'cross-app' | 'shared' | 'metadata'

export type Kind = 'harness' | 'scenario'

export interface Exemption {
  /** Why this scenario cannot or should not be tested end-to-end. */
  reason: string
  /** Who signed it off — a person, not a role. */
  approvedBy: string
  /** ISO date the exemption was written. */
  date: string
}

export interface Scenario {
  /** Stable id, used verbatim in a `@scenario:<id>` test tag. */
  id: string
  kind: Kind
  /** Risk tier — the ordering axis and the ratchet key. */
  tier: Tier
  /** Superseded master-plan phase. Traceability only; not the ratchet key. */
  phase: Phase
  /** Plan section this row lives in, e.g. `5.C`. */
  section: string
  /** The plan's own label for this row, when it differs from `id`. */
  planId?: string
  area: string
  app: App
  title: string
  /** The rule that decides pass/fail. Abbreviated from the plan's O column. */
  oracle: string
  /**
   * Harness rows only: the modules this item must provide, relative to `e2e/`.
   * Terminal when every module exists and at least one is imported by a spec.
   */
  modules?: string[]
  /** Written exemption. Presence makes the scenario terminal as EXEMPT. */
  exempt?: Exemption
}

const s = (
  id: string,
  phase: Phase,
  section: string,
  area: string,
  app: App,
  title: string,
  oracle: string,
  extra: Partial<Scenario> = {},
): Scenario => ({
  id,
  kind: 'scenario',
  tier: tierForId(id),
  phase,
  section,
  area,
  app,
  title,
  oracle,
  ...extra,
})

/**
 * Compact row builder for the catalogue-derived areas. Same contract as `s`,
 * but the section/area/app/phase are hoisted out of every row because within a
 * suite they never vary.
 */
const suite = (
  section: string,
  area: string,
  app: App,
  phase: Phase,
  defs: Array<
    [id: string, title: string, oracle: string, extra?: Partial<Scenario>]
  >,
): Scenario[] =>
  defs.map(([id, title, oracle, extra]) =>
    s(id, phase, section, area, app, title, oracle, extra),
  )

// ── P0 · §2 Harness ──────────────────────────────────────────────────────
// Terminal when the helper exists AND at least one committed spec imports it
// (goal doc P0 exit criterion). `oracle` names the module the reconciler
// looks for; `title` names the plan item.

const harness: Scenario[] = [
  {
    id: 'HW1',
    kind: 'harness',
    tier: 'HW',
    phase: 'P0',
    section: '2',
    planId: 'H1',
    area: 'roles',
    app: 'shared',
    title: 'makeV2Name role parameterisation + assertRoleBitmap oracle',
    oracle:
      'fixtures/makeV2Name.ts exports role granting; helpers/role-assertions.ts',
    modules: ['fixtures/makeV2Name.ts', 'helpers/role-assertions.ts'],
  },
  {
    id: 'HW2',
    kind: 'harness',
    tier: 'HW',
    phase: 'P0',
    section: '2',
    planId: 'H2',
    area: 'subnames',
    app: 'shared',
    title:
      'makeSubname fixture — N-deep V2 subnames with per-level owner and roles',
    oracle: 'fixtures/makeSubname.ts',
    modules: ['fixtures/makeSubname.ts'],
  },
  {
    id: 'HW3',
    kind: 'harness',
    tier: 'HW',
    phase: 'P0',
    section: '2',
    planId: 'H3',
    area: 'wallets',
    app: 'shared',
    title:
      'Multi-wallet fixture — owner/manager/stranger switchable without reload',
    oracle: 'fixtures/wallets.ts',
    modules: ['fixtures/wallets.ts'],
  },
  {
    id: 'HW4',
    kind: 'harness',
    tier: 'HW',
    phase: 'P0',
    section: '2',
    planId: 'H4',
    area: 'time',
    app: 'shared',
    title:
      'Deterministic time presets — atExpiry/inGrace/atGraceEnd/inPremium/afterPremium',
    oracle: 'fixtures/time-presets.ts built on fixtures/time.ts',
    modules: ['fixtures/time-presets.ts'],
  },
  {
    id: 'HW5',
    kind: 'harness',
    tier: 'HW',
    phase: 'P0',
    section: '2',
    planId: 'H5',
    area: 'isolation',
    app: 'shared',
    title: 'Snapshot/revert per test (evm_snapshot / evm_revert)',
    oracle: 'fixtures/chain-snapshot.ts',
    modules: ['fixtures/chain-snapshot.ts'],
  },
  {
    id: 'HW6',
    kind: 'harness',
    tier: 'HW',
    phase: 'P0',
    section: '2',
    planId: 'H6',
    area: 'indexer',
    app: 'shared',
    title:
      'Panoptes seeding path — real indexer fixture for indexer-oracle tests',
    oracle: 'fixtures/panoptes.ts',
    modules: ['fixtures/panoptes.ts'],
  },
  {
    id: 'HW7',
    kind: 'harness',
    tier: 'HW',
    phase: 'P0',
    section: '2',
    planId: 'H7',
    area: 'cross-app',
    app: 'cross-app',
    title:
      'Cross-app fixture — one context, two base URLs, shared wallet and chain state',
    oracle: 'fixtures/playwright.cross-app.fixture.ts',
    modules: ['fixtures/playwright.cross-app.fixture.ts'],
  },
  {
    id: 'HW8',
    kind: 'harness',
    tier: 'HW',
    phase: 'P0',
    section: '2',
    planId: 'H8',
    area: 'console',
    app: 'shared',
    title: 'ConsoleMonitor transaction-id catalogue',
    oracle: 'helpers/transaction-ids.ts exported map',
    modules: ['helpers/transaction-ids.ts'],
  },
  {
    id: 'HW9',
    kind: 'harness',
    tier: 'HW',
    phase: 'P0',
    section: '2',
    planId: 'H9',
    area: 'faults',
    app: 'shared',
    title:
      'Error-injection helpers — RPC/indexer/orchestrator failure, wallet rejection, revert',
    oracle: 'helpers/fault-injection.ts',
    modules: ['helpers/fault-injection.ts'],
  },
  {
    id: 'HW10',
    kind: 'harness',
    tier: 'HW',
    phase: 'P0',
    section: '2',
    planId: 'H10',
    area: 'premigration',
    app: 'shared',
    title:
      'Premigration state builder — all V1 names RESERVED in V2, ENSV1Resolver wildcard',
    oracle: 'fixtures/premigration.ts',
    modules: ['fixtures/premigration.ts'],
  },
]

// ── P1 · §5.C Roles and permissions ──────────────────────────────────────

const rolesC: Scenario[] = [
  s(
    'C1',
    'P1',
    '5.C',
    'roles',
    'portal',
    'Roles table lists every holder of every role',
    'matches on-chain roles()/hasRoles() per account',
  ),
  s(
    'C2',
    'P1',
    '5.C',
    'roles',
    'portal',
    'Grant a single role to a second wallet',
    'on-chain bitmap changes; grantee UI gains the gated action',
  ),
  s(
    'C3',
    'P1',
    '5.C',
    'roles',
    'portal',
    'Grant several roles in one transaction',
    'buildRoleTransactions emits one batched call; bitmap matches exactly',
  ),
  s(
    'C4',
    'P1',
    '5.C',
    'roles',
    'portal',
    'Revoke a role',
    'bitmap cleared; grantee action disappears after invalidation',
  ),
  s(
    'C5',
    'P1',
    '5.C',
    'roles',
    'portal',
    'Grant/revoke without the corresponding _ADMIN role',
    'test_revokeRoles_asOwnerLackingAdmin — action hidden, direct nav not-authorized',
  ),
  s(
    'C6',
    'P1',
    '5.C',
    'roles',
    'portal',
    'Owner with admin vs root performing the same grant',
    'test_grantRoles_withAdminAsOwner, test_grantRoles_asRoot — both succeed',
  ),
  s(
    'C7',
    'P1',
    '5.C',
    'roles',
    'portal',
    'Roles while the name is expired',
    'test_grantRoles_whileExpired / test_revokeRoles_whileExpired',
  ),
  s(
    'C8',
    'P1',
    '5.C',
    'roles',
    'portal',
    'Roles while the name is reserved',
    'test_grantRoles_whileReserved',
  ),
  s(
    'C9',
    'P1',
    '5.C',
    'roles',
    'portal',
    'setApprovalForAll operator gains the blended role set',
    'test_setApprovalForAll_setResolver/_setSubregistry/_blendedRoles',
  ),
  s(
    'C10',
    'P1',
    '5.C',
    'roles',
    'portal',
    'Max-assignee boundary',
    'test_transferWithMaxAssignees — UI surfaces the cap',
  ),
  s(
    'C11',
    'P1',
    '5.C',
    'roles',
    'portal',
    'Role history table',
    'RoleHistoryTable — every grant/revoke with actor + block, in order',
  ),
  s(
    'C12',
    'P1',
    '5.C',
    'roles',
    'portal',
    'Roles survive a transfer / are reset by it',
    'test_transferAbortsAfterRevoke, test_transferRegistryControl',
  ),
  s(
    'C13',
    'P1',
    '5.C',
    'roles',
    'portal',
    'Registry-level roles vs name-level roles are independent',
    'granting one does not grant the other',
  ),
  s(
    'C14',
    'P1',
    '5.C',
    'roles',
    'portal',
    'Resolver-level roles per profile key',
    'test_authorizeTextRoles/AddrRoles/DataRoles/NameRoles incl. anyName',
  ),
]

// ── P1 · §5.D Registry / subnames ────────────────────────────────────────

const registryD: Scenario[] = [
  s(
    'D1',
    'P1',
    '5.D',
    'registry',
    'portal',
    'Deploy a subregistry for a name that has none',
    'getSubregistry() non-zero; MigrateRegistryPrompt → RegistryInfo',
  ),
  s(
    'D2',
    'P1',
    '5.D',
    'subnames',
    'portal',
    'Create a subname (3LD)',
    'appears in SubnamesTable and on-chain; getState() = registered',
  ),
  s(
    'D3',
    'P1',
    '5.D',
    'subnames',
    'portal',
    'Create a 4LD under a 3LD that owns its own registry',
    'nested registry resolution correct (parity ownership.4LD)',
  ),
  s(
    'D4',
    'P1',
    '5.D',
    'subnames',
    'portal',
    'Create a subname without ROLE_REGISTRAR',
    'test_Revert_unauthorized_registration — blocked',
  ),
  s(
    'D5',
    'P1',
    '5.D',
    'subnames',
    'portal',
    'Delete a subname',
    'test_unregister_registered — unregister succeeds, row disappears',
  ),
  s(
    'D6',
    'P1',
    '5.D',
    'subnames',
    'portal',
    'Delete without ROLE_UNREGISTER',
    'test_unregister_notAuthorized — blocked',
  ),
  s(
    'D7',
    'P1',
    '5.D',
    'subnames',
    'portal',
    "Subname expiry cannot exceed the parent's",
    'test_domain_expiry, test_register_cannotSetPastExpiry',
  ),
  s(
    'D8',
    'P1',
    '5.D',
    'subnames',
    'portal',
    'Parent expires → children behaviour',
    'children unresolvable; UI shows the parent-expired reason',
  ),
  s(
    'D9',
    'P1',
    '5.D',
    'registry',
    'portal',
    'setSubregistry / detach registry',
    'test_setSubregistry, _notAuthorized, _whileReserved',
  ),
  s(
    'D10',
    'P1',
    '5.D',
    'registry',
    'portal',
    'Registry labels table + label count',
    'useRegistryLabels / useRegistryLabelCount vs on-chain enumeration',
  ),
  s(
    'D11',
    'P1',
    '5.D',
    'registry',
    'portal',
    'Registry tree navigation, ≥3 levels',
    'RegistryTree renders the real hierarchy; each node links to its page',
  ),
  s(
    'D12',
    'P1',
    '5.D',
    'registry',
    'portal',
    'Registry history / events table',
    'useRegistryEvents rows match emitted events',
  ),
  s(
    'D13',
    'P1',
    '5.D',
    'registry',
    'portal',
    'Registry add/edit user sheets',
    'RegistryAddUserSheet/RegistryEditUserSheet grant/revoke reaches chain',
  ),
  s(
    'D14',
    'P1',
    '5.D',
    'registry',
    'portal',
    'Registry upgrade path',
    'test_upgrade / test_Revert_unauthorized_upgrade; ApprovedUpgradeGate',
  ),
]

// ── P1 · §5.E Resolvers and records ──────────────────────────────────────

const resolversE: Scenario[] = [
  s(
    'E1',
    'P1',
    '5.E',
    'records',
    'shared',
    'Set/update/delete text records (multiple keys in one save)',
    'on-chain text() matches; PendingChangesBar step count = changed keys',
  ),
  s(
    'E2',
    'P1',
    '5.E',
    'records',
    'shared',
    'Set addresses for multiple coin types incl. non-EVM',
    'addr() per coinType; test_setAddr_zeroEVM_fallbacks',
  ),
  s(
    'E3',
    'P1',
    '5.E',
    'records',
    'shared',
    'Invalid address input: too short / too long / wrong checksum',
    'test_setAddr_invalidEVM_tooShort/tooLong — rejected client-side',
  ),
  s(
    'E4',
    'P1',
    '5.E',
    'records',
    'shared',
    'Contenthash, pubkey, ABI, interface',
    'each set + read back; test_setABI_invalidContentType_*',
  ),
  s(
    'E5',
    'P1',
    '5.E',
    'records',
    'shared',
    'Record edits without the per-key role',
    'test_setText_notAuthorized etc. — blocked',
  ),
  s(
    'E6',
    'P1',
    '5.E',
    'resolver',
    'portal',
    'Change resolver',
    'getResolver() updated; records read through the new resolver',
  ),
  s(
    'E7',
    'P1',
    '5.E',
    'resolver',
    'portal',
    'Change resolver blocked when ROLE_SET_RESOLVER absent',
    'incl. migrated CANNOT_SET_RESOLVER names — button hidden / route guarded',
  ),
  s(
    'E8',
    'P1',
    '5.E',
    'resolver',
    'portal',
    'Detach resolver (set to zero)',
    'getResolver() = 0; profile shows the no-resolver state',
  ),
  s(
    'E9',
    'P1',
    '5.E',
    'resolver',
    'portal',
    'Resolver aliases — none, root, exact, subdomain, recursive',
    'test_alias_*',
  ),
  s(
    'E10',
    'P1',
    '5.E',
    'resolver',
    'portal',
    'Alias creation without ROLE_SET_ALIAS',
    'test_alias_notAuthorized — blocked',
  ),
  s(
    'E11',
    'P1',
    '5.E',
    'resolver',
    'portal',
    'Resolver nodes list + node detail sheet',
    '/resolver/$address/nodes matches on-chain node set',
  ),
  s(
    'E12',
    'P1',
    '5.E',
    'records',
    'shared',
    'Multicall record save — partial failure',
    'test_multicall_getters_partialError surfaced, not swallowed',
  ),
  s(
    'E13',
    'P1',
    '5.E',
    'resolver',
    'shared',
    'Wildcard / ENSV1Resolver fallback for an unmigrated name',
    'resolution still returns V1 data (case study)',
  ),
  s(
    'E14',
    'P1',
    '5.E',
    'resolver',
    'portal',
    'Resolver upgrade',
    'test_upgrade, canUpgradeFrom — admin-only; post-upgrade records intact',
  ),
  s(
    'E15',
    'P1',
    '5.E',
    'resolver',
    'shared',
    'Records on a name whose resolver is a V1 PublicResolver',
    'post-migration CANNOT_SET_RESOLVER — reads work, writes gated',
  ),
]

// ── P2 · §5.A Registration ───────────────────────────────────────────────

const registrationA: Scenario[] = [
  s(
    'A1',
    'P2',
    '5.A',
    'registration',
    'manager',
    'Register available 2LD, 1 year, USDC — EOA path',
    'ConsoleMonitor stage spine; getState() = registered; expiry = now + 1y',
  ),
  s(
    'A2',
    'P2',
    '5.A',
    'registration',
    'manager',
    'Register via Rhinestone HCA',
    'HCA stage spine computingHcaBudget → … → verifyingRegistration → success',
  ),
  s(
    'A3',
    'P2',
    '5.A',
    'registration',
    'manager',
    'Duration variants: 28d, 1y, 2y, 5y, custom date',
    'price recomputes; on-chain expiry matches each selection exactly',
  ),
  s(
    'A4',
    'P2',
    '5.A',
    'registration',
    'manager',
    'Duration below minimum',
    'test_register_durationTooShort never reached — UI blocks first',
  ),
  s(
    'A5',
    'P2',
    '5.A',
    'registration',
    'manager',
    'Payment token switching',
    'quoted total changes by the oracle ratio; non-payment tokens absent',
  ),
  s(
    'A6',
    'P2',
    '5.A',
    'registration',
    'manager',
    'Insufficient balance / allowance',
    'test_register_insufficientBalance/Allowance; no commitment consumed',
  ),
  s(
    'A7',
    'P2',
    '5.A',
    'registration',
    'manager',
    'Commitment too new — reveal before min age',
    'UI holds in commitmentCooldown, does not submit early',
  ),
  s(
    'A8',
    'P2',
    '5.A',
    'registration',
    'manager',
    'Commitment too old — advance past max age',
    'UI restarts the commit leg rather than reverting',
  ),
  s(
    'A9',
    'P2',
    '5.A',
    'registration',
    'manager',
    'Commitment replay: same label+secret twice',
    'test_commit_unexpiredCommitment, test_commit_consumed',
  ),
  s(
    'A10',
    'P2',
    '5.A',
    'registration',
    'manager',
    'Register a name that is already registered',
    'search shows unavailable; register route redirects to profile',
  ),
  s(
    'A11',
    'P2',
    '5.A',
    'registration',
    'manager',
    'Register a reserved (premigrated) name',
    'test_register_premigrated — "not yet migrated" reason',
  ),
  s(
    'A12',
    'P2',
    '5.A',
    'registration',
    'manager',
    'Register during grace of an expired name',
    'test_register_duringGrace — unavailable; renew offered to prior owner',
  ),
  s(
    'A13',
    'P2',
    '5.A',
    'registration',
    'manager',
    'Register after grace, inside premium',
    'test_register_afterGrace — available at base + premium',
  ),
  s(
    'A14',
    'P2',
    '5.A',
    'registration',
    'manager',
    'Register after the premium window',
    'test_register_afterPremium — available at base only',
  ),
  s(
    'A15',
    'P2',
    '5.A',
    'registration',
    'manager',
    'Label validation: <3 chars, emoji, confusables, uppercase, unnormalised',
    'normalisation applied or rejected with the right message',
  ),
  s(
    'A16',
    'P2',
    '5.A',
    'registration',
    'manager',
    'Register while disconnected',
    'connect prompt; flow resumes at the same step after connecting',
  ),
  s(
    'A17',
    'P2',
    '5.A',
    'registration',
    'manager',
    'Wallet rejects the signature at commit / approve / reveal',
    'machine lands in error with retry; no orphaned commitment',
  ),
  s(
    'A18',
    'P2',
    '5.A',
    'registration',
    'manager',
    'Refresh / navigate away mid-flow, then return',
    'resumable state restored',
  ),
  s(
    'A19',
    'P2',
    '5.A',
    'registration',
    'manager',
    'Post-registration auto-setup',
    'syncingEthRecord → waitingForEthRecordSync → settingPrimaryName → success',
  ),
  s(
    'A20',
    'P2',
    '5.A',
    'registration',
    'manager',
    'Register with a referrer in the URL',
    'referrer reaches the contract call',
  ),
  s(
    'A21',
    'P2',
    '5.A',
    'registration',
    'portal',
    'Register 3LD directly',
    'offered only where the parent registry grants ROLE_REGISTRAR',
  ),
]

// ── P2 · §5.B Renewal, extension, grace ──────────────────────────────────

const renewalB: Scenario[] = [
  s(
    'B1',
    'P2',
    '5.B',
    'renewal',
    'manager',
    'Extend an owned active name by 28d / 1y / picked date',
    'new expiry = old + duration; test_renew arithmetic',
  ),
  s(
    'B2',
    'P2',
    '5.B',
    'renewal',
    'manager',
    'Extend an unowned name (anyone may renew)',
    'test_renew_available — succeeds, not role-gated in the base case',
  ),
  s(
    'B3',
    'P2',
    '5.B',
    'renewal',
    'manager',
    'Extend a name in grace, day 1 and day 27',
    'test_renew_duringGrace — expiry from the original expiry, not now',
  ),
  s(
    'B4',
    'P2',
    '5.B',
    'renewal',
    'manager',
    'Extend after grace',
    'test_renew_afterGrace — blocked / shown as available',
  ),
  s(
    'B5',
    'P2',
    '5.B',
    'renewal',
    'manager',
    'Renew cannot reduce expiry',
    'test_renew_cannotReduceExpiry — UI never offers a shorter target',
  ),
  s(
    'B6',
    'P2',
    '5.B',
    'grace',
    'manager',
    'Grace banner + badge appear at expiry, disappear at renewal',
    'GracePeriodBanner/Badge; resolveDashboardGraceBanner states',
  ),
  s(
    'B7',
    'P2',
    '5.B',
    'grace',
    'manager',
    'Dashboard grace banner aggregates N expiring names',
    'count and CTA match resolveDashboardGraceBanner',
  ),
  s(
    'B8',
    'P2',
    '5.B',
    'renewal',
    'manager',
    'Bulk renew 2, 5, 20 names incl. mixed active/grace',
    'BulkRenewDialog line items; on-chain expiry advanced for every name',
  ),
  s(
    'B9',
    'P2',
    '5.B',
    'renewal',
    'manager',
    'Bulk renew with one name failing',
    'FailureStep lists the failure; the others still renewed',
  ),
  s(
    'B10',
    'P2',
    '5.B',
    'renewal',
    'manager',
    'Bulk renew pricing',
    'total = Σ per-name oracle price (bulk-renew/utils/pricing.ts), computed over RPC before submitting',
  ),
  s(
    'B11',
    'P2',
    '5.B',
    'renewal',
    'manager',
    'Renew deep link /renew/$name — connected, disconnected, unregistered',
    'parity: v3 renew deep link redirect',
  ),
  s(
    'B12',
    'P2',
    '5.B',
    'renewal',
    'manager',
    'Renew with insufficient balance/allowance',
    'test_renew_insufficientBalance/Allowance — blocked with the right copy',
  ),
  s(
    'B13',
    'P2',
    '5.B',
    'renewal',
    'portal',
    'Renew a subname without ROLE_RENEW where the registry requires it',
    'test_renew_notAuthorized — blocked',
  ),
  s(
    'B14',
    'P2',
    '5.B',
    'renewal',
    'manager',
    'V1 renewal via ETHRenewerV1 — active · in-grace-still-in-grace · in-grace-out-of-grace · after-grace',
    'the four ETHRenewerV1.test_renew_* contract branches, each asserted on the resulting expiry',
  ),
  ...suite('5.B', 'renewal', 'manager', 'P2', [
    [
      'B15',
      'syncWrapper for wrapped and unwrapped V1 names',
      'the NameWrapper expiry is synced post-renew for the wrapped case and is a no-op for the unwrapped case',
    ],
    [
      'B16',
      'V1 continuity bonus at day 61 and day 63',
      'inside the 62-day window the bonus applies; outside it does not — assert both boundaries',
      { planId: 'B15 (superseded plan)' },
    ],
    [
      'B17',
      'Renew, then migrate, in one session',
      'the V1 renewal makes a grace name eligible and migration then succeeds (see GA6)',
    ],
    [
      'B18',
      'Extend from every entry point: profile, dashboard row, address page, deep link',
      'the same on-chain expiry results from all four routes',
    ],
  ]),
]

// ── R0 · §G Migration V1→V2 — the deepest matrix ─────────────────────────
//
// Rebuilt 2026-08-11 from `e2e-test-catalogue.md` §G. Supersedes the flat
// G1–G27 / GB1–GB8 numbering of `e2e-master-test-plan.md` §5.G, whose rows
// conflated wrap level with fuse burn and had no slot for the record-kind
// matrix where the highest-severity findings live. The old ids are carried in
// `planId` so the superseded plan stays traceable.
//
// Rows come from `getNameType`'s 13 `.eth` types × `classifyNames`' 5 token
// types and 8 ineligibility reasons.
//
// Note: `wrapETH2LD` always burns PARENT_CANNOT_CONTROL, so a wrapped `.eth`
// 2LD is at minimum emancipated — `eth-wrapped-2ld` is not a real state and
// deliberately has no row.

const migrationGW: Scenario[] = suite('G.GW', 'migration', 'manager', 'P3', [
  [
    'GW1',
    'Unwrapped 2LD',
    'classified `unwrapped`; ERC-721 → UnlockedMigrationController; reclaimed on BaseRegistrar, resolver cleared, token in Graveyard, V2 getState()=registered',
    { planId: 'G1' },
  ],
  [
    'GW2',
    'Emancipated 2LD (PARENT_CANNOT_CONTROL only)',
    'classified `unlocked`; ERC-1155 → UnlockedMigrationController; unwrapped to Graveyard, NameWrapper is ENSRegistry owner, resolver cleared',
    { planId: 'G2' },
  ],
  [
    'GW3',
    'Locked 2LD',
    'classified `locked-2ld` → LockedMigrationController; NOT unwrapped; WrapperRegistry deployed and set as the V2 subregistry',
    { planId: 'G3' },
  ],
  [
    'GW4',
    'Desynced 2LD (wrapper and registrar owners disagree)',
    'currently a silent drop — the UI must say something; totality per INV3',
  ],
  [
    'GW5',
    'Locked + CANNOT_TRANSFER burnt alone',
    'ineligible with reason `not-transferable`, surfaced in the list; fixture must isolate the fuse — Locked+All conflates seven',
    { planId: 'G12' },
  ],
  [
    'GW6',
    'Locked + CANNOT_SET_RESOLVER burnt alone',
    'migrates with strategy `keep-v1`; assertV2Resolver(label, v1Resolver) — the V1 resolver is preserved; no ROLE_SET_RESOLVER granted',
    { planId: 'GB3' },
  ],
  [
    'GW7',
    'Locked + CANNOT_BURN_FUSES burnt alone',
    'assertLacksRoles(*_ADMIN) — no admin roles granted; portal hides grant/revoke',
    { planId: 'GB1' },
  ],
  [
    'GW8',
    'Locked + CANNOT_CREATE_SUBDOMAIN burnt alone',
    'no ROLE_REGISTRAR on the deployed subregistry; portal create-subname blocked',
    { planId: 'GB4' },
  ],
  [
    'GW9',
    'Locked + CAN_EXTEND_EXPIRY burnt alone',
    'ROLE_RENEW granted on the V2 token; extend offered to the name owner',
    { planId: 'GB5' },
  ],
  [
    'GW10',
    'Locked + CANNOT_SET_TTL burnt alone',
    'ignored by the fuse→role mapping; nothing breaks, no role difference',
    { planId: 'GB7' },
  ],
  [
    'GW11',
    'Locked + CANNOT_APPROVE with a non-null getApproved()',
    'reason `FrozenTokenApproval` is declared but never emitted — assert whether it proceeds or reverts on chain (INV3 dead-reason site)',
    { planId: 'G13' },
  ],
  [
    'GW12',
    'All child fuses burnt (Locked+All)',
    'ineligible via CANNOT_TRANSFER; the UI names that fuse specifically, not a generic failure',
    { planId: 'GB8' },
  ],
])

const migrationGS: Scenario[] = suite('G.GS', 'migration', 'manager', 'P3', [
  [
    'GS1',
    'Locked 2LD + locked child, both selected',
    'both migrate and the parent is ordered first (test_migrate_parentAndChildren)',
    { planId: 'G9' },
  ],
  [
    'GS2',
    'Locked 2LD + emancipated child',
    'child classified `detached-child`; registered via the parent WrapperRegistry',
    { planId: 'G5' },
  ],
  // GS3/GS4/GS10 previously described the pre-subname-migration product, where
  // these three shapes were all rejected. They are now the COPY route: the name
  // has no transferable token, so it is re-created in a deterministic
  // per-parent `UserRegistry` rather than migrated.
  [
    'GS3',
    'Wrapped subname with PCC not burned, under an unlocked 2LD',
    'eligible as `copy`/`unlocked-child` — re-created in the parent UserRegistry, carrying its NameWrapper wrappedDomain.expiryDate as the V2 expiry (NOT the sentinel)',
  ],
  [
    'GS4',
    'Unwrapped subname (registry-only)',
    'eligible as `copy`/`registry-child` — ownership proven via LegacyRegistry.owner(namehash), re-created with expiry MAX_UINT64 since it has no V1 expiry of its own',
  ],
  [
    'GS5',
    'PCC-expired subname',
    'define expected behaviour from the case study first, then assert it',
  ],
  [
    'GS6',
    'Three levels: locked 2LD → locked child → locked grandchild',
    'parent-first ordering across all three; recursive WrapperRegistry derivation',
    { planId: 'G4' },
  ],
  [
    'GS7',
    'Child selected without its parent',
    'impossible by construction — a descendant row is not interactive (no button role, no aria-pressed) and toggling its root toggles the whole subtree, so a child can never be selected or deselected on its own',
    { planId: 'G6' },
  ],
  [
    'GS8',
    'Locked 2LD with many children',
    'ordering × batching: every child lands, parent first, batch boundaries respected',
  ],
  [
    'GS9',
    'Subname whose parent is absent from the selection',
    'not offered at all — `hasCompleteCopyRoute` walks up from the copy and, finding no classified `unwrapped`/`unlocked` 2LD ancestor, demotes it to ineligible `missing-parent`. Assert alongside a control name that IS offered, or the absence passes vacuously',
    { planId: 'G6' },
  ],
  [
    'GS10',
    'Unlocked 3LD',
    'migratable as a `copy` under an unwrapped/unlocked 2LD (superseded case study §Unlocked.4, which predates the copy route); still NOT migratable under a locked 2LD — see GS15',
    { planId: 'G7' },
  ],
  // GS12-GS18 are the copy route's own state space, which had no rows before
  // the subname-migration PR because the route did not exist.
  [
    'GS12',
    'Copy child whose V1 expiry has already passed',
    'ineligible `expired-registration`. Note the escape: a parent-controlled NameWrapper subname legitimately carries a ZERO expiry, so zero-and-no-PCC must NOT be treated as expired',
  ],
  [
    'GS13',
    'Copy child whose label is empty, >255 bytes, or contains a dot',
    'ineligible `invalid-label`. Only the length case can exist on chain — a dotted label cannot, so testing it requires the mock to knowingly diverge',
  ],
  [
    'GS14',
    'Three levels of copy: unwrapped 2LD → registry 3LD → registry 4LD',
    'a UserRegistry per copy parent, chained — resolution walks ETHRegistry → UserRegistry(2LD) → UserRegistry(3LD), and every level renders in the recursive selection tree',
  ],
  [
    'GS15',
    'Subname under a LOCKED 2LD',
    'NOT a copy — stays on the `locked-child`/`detached-child` WrapperRegistry token route. Both routes leave a non-zero subregistry, so the oracle must be the factory implementation pointer, not mere non-zero-ness',
  ],
  [
    'GS16',
    'Copy child whose V1 resolver is not a known public resolver',
    'ineligible `unsupported-resolver` — a copy always rewrites the resolver to the owner PermissionedResolver and cannot carry an unknown one across. The PARENT must still migrate',
  ],
  [
    'GS17',
    'Copy re-run against a dirty deterministic UserRegistry slot',
    '`copyMigrationReadiness` fails closed with `subregistry-conflict` / `v2-name-history` / `uncertified-registry` rather than writing over prior state',
  ],
  [
    'GS18',
    'Copy child owned by a different address than the migrating parent',
    'not offered — classification keys the registry-child branch on `domain.owner.id` matching the connected wallet',
  ],
  [
    'GS11',
    'Mixed batch: 7 unwrapped + 8 unlocked + 9 locked',
    'test_migrate_7unwrapped_8unlocked_9locked — all 24 in one flow, each landing in its own controller',
    { planId: 'G8' },
  ],
])

const migrationGR: Scenario[] = suite('G.GR', 'migration', 'manager', 'P3', [
  [
    'GR1',
    'Text records + ETH addr on a known resolver',
    'each key read back from the new V2 resolver post-migration',
    { planId: 'G23' },
  ],
  ['GR2', 'Records on a subname', 'same replay assertion one level down'],
  [
    'GR3',
    'Custom / unknown resolver',
    'strategy `keep-v1`; V2 points at the V1 resolver and nothing is replayed',
  ],
  [
    'GR4',
    'Contenthash',
    'INV2: known lost — migration reports success while destroying it. Assert the before/after contenthash independently of the app model',
  ],
  ['GR5', 'ABI record', 'INV2: known lost — assert before/after'],
  ['GR6', 'Pubkey record', 'INV2: known lost — assert before/after'],
  [
    'GR7',
    'interfaceImplementer record',
    'INV2: known lost — assert before/after',
  ],
  [
    'GR8',
    'Multicoin addresses (BTC coinType 0 + ETH 60)',
    'both replayed; addr() per coinType on the new resolver',
  ],
  [
    'GR9',
    'Text key outside the portal default key set',
    'replayed — the carry list must not be the UI default list',
  ],
  [
    'GR10',
    '~50 records',
    'all replayed across multicall chunk boundaries; none dropped at the seam',
  ],
  [
    'GR11',
    'Resolver set with zero records',
    'no-op, no failure, no empty write',
  ],
  [
    'GR12',
    'Resolver outside the hardcoded 9-address known list',
    'silently degrades to `keep-v1` — the UI must state that records will not be carried',
  ],
])

const migrationGM: Scenario[] = suite('G.GM', 'migration', 'manager', 'P3', [
  [
    'GM1',
    'Unwrapped name whose manager ≠ registrant',
    'two extra confirmations: approve manager restoration, then revoke temporary HCA access',
  ],
  [
    'GM2',
    'Same, with ETHRegistry already approved',
    'confirmation count drops by one; the pre-existing approval is not revoked',
  ],
  [
    'GM3',
    'Granted V2 role bitmap after migration',
    'bitmap equals exactly ROLE_SET_RESOLVER and nothing else — assert the bitmap, not that the flow succeeded',
    { planId: 'GB8' },
  ],
  [
    'GM4',
    'Wrapped name with a distinct manager',
    '`managerAddress` is only derived on the unwrapped branch — confirm the manager is ignored deliberately, not accidentally',
  ],
  [
    'GM5',
    'Already-migrated name re-offered',
    '`domain.isMigrated` is never consulted and `already-migrated` is never emitted (INV3 dead-reason site)',
    { planId: 'G26' },
  ],
])

const migrationGA: Scenario[] = suite('G.GA', 'migration', 'manager', 'P3', [
  ['GA1', 'One missing token approval', 'a single per-token `approve` row'],
  [
    'GA2',
    'Two or more missing approvals',
    'coalesced into one operator `setApprovalForAll`',
  ],
  [
    'GA3',
    'Operator approval already present',
    'zero approval rows in the plan',
  ],
  [
    'GA4',
    'Two or more wrapped names',
    'coalesced into `safeBatchTransferFrom`, not N single transfers',
  ],
  [
    'GA5',
    'More than 29 names',
    'multi-batch ordering; blocked-env on the dev-panel cookie cap — needs a harness fix',
  ],
  [
    'GA6',
    'In V1 grace: renew, then migrate',
    'V1 renewal makes the name eligible and migration then succeeds (see B17)',
    { planId: 'G20' },
  ],
  [
    'GA7',
    'Migrate at V1 grace day 45 and day 89',
    'succeeds at both; the V2 expiry preserves the V1 expiry exactly',
    { planId: 'G17' },
  ],
  [
    'GA8',
    'Migrate after V1 grace has ended',
    'not offered; the name is shown available/premium instead',
    { planId: 'G19' },
  ],
  [
    'GA9',
    'Unmigrated name after V1 expiry',
    'registry frozen; ENSV1Resolver still resolves until the V2 expiry; Graveyard.clear() reachable',
    { planId: 'G21' },
  ],
  [
    'GA10',
    'Not owner / not approved / owner mismatch',
    'each of the three shows a distinct correct reason — never one generic message (test_migrate_*_notApproved, _notOperator, _notSameOwner)',
    { planId: 'G10, G11' },
  ],
  [
    'GA11',
    'Name-data mismatch (label ≠ tokenId)',
    'NameDataMismatch — assert the app can never construct it. Carried from the superseded plan; not in the catalogue',
    { planId: 'G14' },
  ],
  [
    'GA12',
    'Not reserved in V2 (premigration missing)',
    'test_*_notReserved — the UI must not offer a name the controller cannot claim. Carried from the superseded plan; not in the catalogue',
    { planId: 'G15' },
  ],
])

const migrationGU: Scenario[] = suite('G.GU', 'migration', 'manager', 'P3', [
  [
    'GU1',
    'Migration list = exactly the migratable names, with per-name status',
    'matches classifyNames on the same input, and no name appears in neither list (INV3 totality)',
    { planId: 'G22' },
  ],
  [
    'GU2',
    'Predicted vs actual wallet-confirmation count',
    'count computed from chain state read over RPC before clicking equals the confirmations actually requested',
  ],
  [
    'GU3',
    'EOA nonce delta across the run',
    'equals the predicted count — catches writes nobody asked for',
  ],
  [
    'GU4',
    'Edit profile immediately after migration',
    'writes land on the new V2 resolver — read back on chain, not from the success toast',
    { planId: 'G24' },
  ],
  [
    'GU5',
    'Commemorative NFT at /migration_.nft',
    'minted/displayed per features/migration/commemorative-nft rules',
    { planId: 'G25' },
  ],
  [
    'GU6',
    'Migration idempotence',
    'an already-migrated name is blocked, with the reason named (see GM5)',
    { planId: 'G26' },
  ],
  [
    'GU7',
    'Interrupted mid-batch (reload, close tab)',
    'resumable; no partial corruption; the user is told what already executed',
    { planId: 'G27' },
  ],
  [
    'GU8',
    'Migration via HCA vs EOA',
    'same end state on chain, different confirmation profile — both asserted',
  ],
  [
    'GU9',
    'Selection screen promise vs what actually migrates',
    'INV2: the copy claims "names, text records, and addresses" — it must not omit a record kind the user actually holds',
  ],
])

const migrationG: Scenario[] = [
  ...migrationGW,
  ...migrationGS,
  ...migrationGR,
  ...migrationGM,
  ...migrationGA,
  ...migrationGU,
]

// ── P4 · §6 Cross-app ────────────────────────────────────────────────────

const crossAppX: Scenario[] = [
  s(
    'X1',
    'P4',
    '6',
    'cross-app',
    'cross-app',
    'Register in manager → open in portal',
    'same owner, expiry, resolver, registry, roles',
  ),
  s(
    'X2',
    'P4',
    '6',
    'cross-app',
    'cross-app',
    'Migrate in manager → inspect in portal',
    'V2 registry/subregistry, role set per fuse mapping, WrapperRegistry when locked',
  ),
  s(
    'X3',
    'P4',
    '6',
    'cross-app',
    'cross-app',
    "Grant a role in portal → grantee's manager UI gains the action",
    'permission propagation across apps',
  ),
  s(
    'X4',
    'P4',
    '6',
    'cross-app',
    'cross-app',
    'Transfer in portal → both dashboards update',
    'indexer + on-chain agreement',
  ),
  s(
    'X5',
    'P4',
    '6',
    'cross-app',
    'cross-app',
    'Edit records in manager → portal records table agrees (and vice versa)',
    'resolver reads agree',
  ),
  s(
    'X6',
    'P4',
    '6',
    'cross-app',
    'cross-app',
    'Extend in manager → portal expiry, grace badge, premium state update',
    'shared time semantics',
  ),
  s(
    'X7',
    'P4',
    '6',
    'cross-app',
    'cross-app',
    "Create a subname in portal → appears in manager's name tree/dashboard",
    'indexer + on-chain agreement',
  ),
  s(
    'X8',
    'P4',
    '6',
    'cross-app',
    'cross-app',
    'Set primary name in manager → portal reverse-resolution tab reflects it',
    'reverse resolution agrees',
  ),
  s(
    'X9',
    'P4',
    '6',
    'cross-app',
    'cross-app',
    'Same name, two apps, two wallets simultaneously',
    'no cache bleed between contexts',
  ),
  s(
    'X10',
    'P4',
    '6',
    'cross-app',
    'cross-app',
    'Version disagreement: a name mid-migration',
    'both apps show a consistent "migrating" state',
  ),
]

// ── P5 · §5.F Ownership and transfer ─────────────────────────────────────

const transferF: Scenario[] = [
  s(
    'F1',
    'P5',
    '5.F',
    'transfer',
    'portal',
    'Transfer each migrated V1 type: unwrapped, unlocked, locked',
    'plan step count per buildTransferPlan; locked must not offer an unexecutable detach-registry',
  ),
  s(
    'F2',
    'P5',
    '5.F',
    'transfer',
    'portal',
    'Transfer with CANNOT_TRANSFER burnt in V1',
    'no ROLE_CAN_TRANSFER_ADMIN — "Transfer not available"',
  ),
  s(
    'F3',
    'P5',
    '5.F',
    'transfer',
    'portal',
    'Transfer of a subname',
    'offered: the Ownership tab shows the Transfer link and the route renders the form (WEB-128/#1120 removed the is2LD gate; the pre-#1120 refusal copy must be absent)',
  ),
  s(
    'F4',
    'P5',
    '5.F',
    'transfer',
    'portal',
    'Transfer while the name is expired',
    'test_transferWhileExpired reflected in the UI',
  ),
  s(
    'F5',
    'P5',
    '5.F',
    'transfer',
    'portal',
    'Transfer to an invalid receiver contract',
    'test_safeTransferFrom_invalidReceiver surfaced as an error, not a hang',
  ),
  s(
    'F6',
    'P5',
    '5.F',
    'transfer',
    'portal',
    'Batch transfer (multiple names)',
    'test_safeBatchTransferFrom* incl. one-error-aborts-all',
  ),
  s(
    'F7',
    'P5',
    '5.F',
    'transfer',
    'portal',
    'Transfer then role check',
    'new owner holds the contract-granted roles; old owner holds none',
  ),
  s(
    'F8',
    'P5',
    '5.F',
    'transfer',
    'portal',
    'Manager/owner split — "sync manager" equivalent',
    'V2 equivalent: registry control vs token owner',
  ),
]

// ── P5 · §5.H Profile, dashboard, search, history ────────────────────────

// ── R3 · §H Profile, dashboard, history ──────────────────────────────────
//
// Renumbered 2026-08-11 to `e2e-test-catalogue.md` §H. The superseded plan's
// H4/H8/H9/H10/H11 were search, primary name, resolution mismatch, token page
// and TLD page — each now lives in its own suite (S, R, R, T, Z), because the
// catalogue splits resolution and discovery out of the profile area. H7 is
// unchanged and keeps its existing spec tag.

const surfacesH: Scenario[] = suite('H', 'profile', 'shared', 'P5', [
  [
    'H1',
    'Profile per state: active, grace, expired, unregistered, reserved, subname, migrated-locked, unmigrated V1',
    'the badge/banner/CTA set is correct and distinct for each of the eight states',
  ],
  [
    'H2',
    'Dashboard lists owned names — V1 only, V2 only, mixed',
    'list is the deduped union with the correct protocol badge each (mergedNames)',
  ],
  [
    'H3',
    'Dashboard pagination, sorting, filtering at page 1 / N / N+1',
    'boundaries exact — no dropped or duplicated row at a page seam',
  ],
  [
    'H4',
    'Dashboard role-derived columns (v1NameRoles, v2NameRoles)',
    'the per-name role summary matches roles() read on chain',
  ],
  [
    'H5',
    'Address page tabs: names, resolution, reverse-resolution, history',
    'each tab matches its own source read independently',
  ],
  [
    'H6',
    'Name history /$name/history',
    'events in order with correct actors — needs the real indexer, not a route mock',
  ],
  [
    'H7',
    'Favourites: add, remove, a name you do not own',
    'persisted and survives reload',
  ],
  [
    'H8',
    'Recent-activity feed',
    'rows match the events actually emitted on chain (INV4 site)',
  ],
  [
    'H9',
    'Empty states: no names, no history, no subnames',
    'distinguishes *empty* from *unknown* — no confident negative without a chain cross-check (INV4)',
  ],
  [
    'H10',
    'Expiry rendering across all five registry states, in each locale',
    'absolute date and relative label both correct per state and locale',
  ],
  [
    'H11',
    'Profile of a name owned by a contract or an HCA',
    'owner rendered as a contract/smart account, not as a plain EOA',
  ],
])

// ── P5 · §5.I Fuses view ─────────────────────────────────────────────────

const fusesI: Scenario[] = [
  s(
    'I1',
    'P5',
    '5.I',
    'fuses',
    'portal',
    'Fuse list for a V1 wrapped name shows exactly the burnt fuses',
    'isFuseBurnt, useBurnedFuseCount vs on-chain',
  ),
  s(
    'I2',
    'P5',
    '5.I',
    'fuses',
    'portal',
    'Burn a fuse',
    'on-chain fuse set; irreversibility warning shown first',
  ),
  s(
    'I3',
    'P5',
    '5.I',
    'fuses',
    'portal',
    'Burn blocked by CANNOT_BURN_FUSES',
    'action absent',
  ),
  s(
    'I4',
    'P5',
    '5.I',
    'fuses',
    'portal',
    'Parent-controlled vs child-controlled fuses',
    'parity: v3 permissions.spec — PCC burn, extend-expiry grant, button sets',
  ),
  s(
    'I5',
    'P5',
    '5.I',
    'fuses',
    'portal',
    'Fuses view for a V2 name',
    'shows the role model instead of fuses — no false V1 UI',
  ),
]

// ── P5 · §5.J Wallet, auth, network ──────────────────────────────────────

const walletJ: Scenario[] = suite('J', 'wallet', 'shared', 'P5', [
  [
    'J1',
    'Connect, disconnect, reconnect, reload',
    'connection persisted across reload; no half-connected state',
  ],
  [
    'J2',
    'Account switch mid-session',
    'every name-scoped query invalidated and permissions re-evaluated for the new account',
  ],
  [
    'J3',
    'Wrong network → switch prompt → success',
    'the chain guard fires before any write',
  ],
  [
    'J4',
    'SIWE backend auth modal: sign, dismiss, token expiry',
    '_authenticated routes gated in all three cases',
  ],
  [
    'J5',
    'EOA vs HCA parity for register / renew / transfer / migrate',
    'identical end state on chain for all four flows',
  ],
  [
    'J6',
    'HCA failures: insufficient funding, permit rejected, bundle reverts, orchestrator down',
    'each produces a distinct actionable error, never a generic one',
    { tier: 'R4' },
  ],
  [
    'J7',
    'HCA deployment on first use',
    'the account is deployed exactly once and reused on the second flow',
  ],
  [
    'J8',
    'Signature rejection at every prompt in every flow',
    'no orphaned on-chain state anywhere — nonce delta 0 past the rejection point',
  ],
  [
    'J9',
    'Session across tabs — one wallet, two tabs',
    'no react-query cache bleed between contexts',
    { tier: 'R4' },
  ],
])

// ── R4 · §K Resilience & failure injection ───────────────────────────────
//
// Renumbered 2026-08-11 to `e2e-test-catalogue.md` §K. K3 is new (the
// indexer-stale case that actually happened), so the superseded plan's
// K3–K7 each shift by one. Its K8 (back/forward) and K9 (deep link while
// disconnected) moved to the app-shell suite as U7 and U6.

const resilienceK: Scenario[] = suite('K', 'resilience', 'shared', 'P6', [
  [
    'K1',
    'RPC 500 / timeout mid-flow',
    'error surfaced with retry; never a silent success',
  ],
  [
    'K2',
    'Indexer (Panoptes) down',
    'degrades to on-chain reads and the degraded state is visible to the user',
  ],
  [
    'K3',
    'Indexer up but stale/misconfigured — returns success with zero rows',
    'must not present a confident negative (INV4). This is the failure that already shipped once',
  ],
  [
    'K4',
    'Orchestrator (mockestrator) down on the HCA path',
    'a distinct actionable error',
  ],
  [
    'K5',
    'Transaction reverts after submission',
    'machine reaches `error` carrying the revert reason, not a generic failure',
  ],
  [
    'K6',
    'Dropped or replaced transaction (higher nonce)',
    'the UI recovers rather than waiting forever on a hash that will never land',
  ],
  [
    'K7',
    'Reorg on the fork',
    'state re-derived from chain, not from stale cache',
  ],
  [
    'K8',
    'Two tabs, conflicting writes on one name',
    'last-write-wins with no corruption; both tabs converge',
  ],
  [
    'K9',
    'Throttled network, double-click submit',
    'exactly one transaction — EOA nonce delta = 1',
  ],
  [
    'K10',
    'Console error budget',
    'zero unhandled errors or promise rejections per test',
  ],
  [
    'K11',
    'V1 subgraph down while migration is in progress',
    'eligibility degrades safely — never offers a name it could not classify',
  ],
  [
    'K12',
    'Backend (api-worker) down',
    'the notification UI degrades and the rest of the app stays usable',
  ],
])

// ── R4 · §L Cross-cutting quality ────────────────────────────────────────
//
// Renumbered 2026-08-11: the superseded plan's L2 conflated axe with
// keyboard-only operation; the catalogue splits them (L2/L3), shifting mobile
// to L4 and perf to L5.

const qualityL: Scenario[] = suite('L', 'quality', 'shared', 'P6', [
  [
    'L1',
    'i18n: en, de, es, ru, sv on register + profile + migration',
    'no missing-key markers and no layout overflow in any locale',
  ],
  [
    'L2',
    'axe on every top-level route, both apps',
    'no serious/critical violations, or an exemption naming each',
  ],
  [
    'L3',
    'Keyboard-only completion of register, transfer, role grant, migration',
    'every step reachable and operable without a pointer',
  ],
  [
    'L4',
    'Mobile viewport: dashboard, profile, register, transfer, migration',
    'the NameMobileCard path renders and no horizontal scroll appears',
  ],
  [
    'L5',
    'Performance budget per route',
    'recorded as a trend; fails only on a large regression',
  ],
  [
    'L6',
    'Number and date formatting per locale (parse-localized-number)',
    'round-trips — parse(format(x)) === x for every locale',
  ],
])

// ═════════════════════════════════════════════════════════════════════════
// Catalogue extension — 2026-08-11
//
// Rows the superseded `e2e-master-test-plan.md` did not have, from
// `e2e-test-catalogue.md` Part 3. Kept in one block rather than interleaved
// so the provenance of every row stays legible: everything below this line
// came from the catalogue, everything above it predates it.
// ═════════════════════════════════════════════════════════════════════════

const extraA: Scenario[] = suite('A', 'registration', 'manager', 'P2', [
  [
    'A22',
    'Two tabs registering the same label',
    'one wins; the loser is told the name is unavailable rather than hanging in a stuck flow',
  ],
  [
    'A23',
    'Discount tiers at each duration boundary',
    'applied price matches the discount table in register-v2/utils/discount.ts at every boundary',
  ],
  [
    'A24',
    'Price cooldown banner + premium decay chart',
    'the chart’s plotted premium at time T equals the oracle’s premium at T — two independent computations, not one array rendered twice',
  ],
  [
    'A25',
    'Registration progress UX (weave-registration, useRegistrationFillProgress)',
    'progress is monotonic, never regresses, and reaches 100% only on `success`',
  ],
])

const extraC: Scenario[] = suite('C', 'roles', 'portal', 'P1', [
  [
    'C15',
    'Role admin chain: A grants admin to B, B grants the role to C, A revokes B',
    'C’s role survives or not exactly as the contract specifies — read the bitmap, not the table',
  ],
  [
    'C16',
    'Self-revoke of the last admin',
    'the UI warns that it is irreversible before submitting (INV1 site)',
  ],
  [
    'C17',
    'Role change while a transaction for that role is in flight',
    'no lost update — the final bitmap reflects both writes or the second is refused',
  ],
])

const extraD: Scenario[] = suite('D', 'subnames', 'portal', 'P1', [
  [
    'D15',
    'Subname owned by someone other than the parent owner',
    'the parent cannot seize it; the child’s roles are independent',
  ],
  [
    'D16',
    '20+ subnames',
    'pagination and ordering stable across pages; no row lost at a seam',
  ],
  ['D17', 'Duplicate subname label', 'rejected with no partial state written'],
  [
    'D18',
    'Subname on a migrated locked parent (WrapperRegistry)',
    'creation gated by the CANNOT_CREATE_SUBDOMAIN → ROLE_REGISTRAR mapping',
  ],
])

const extraE: Scenario[] = suite('E', 'resolvers', 'portal', 'P1', [
  [
    'E16',
    'Large record set (~50 texts)',
    'all written; multicall chunking respected at the PROFILE_MULTICALL_CHUNK boundary',
  ],
  [
    'E17',
    'Record value edge cases: empty string (= delete), 1KB value, unicode, emoji, leading/trailing whitespace',
    'stored byte-exact, or normalised deliberately and documented as such',
  ],
  [
    'E18',
    'Social handle normalisation (@handle → handle)',
    'normalised on write, never silently dropped',
  ],
  [
    'E19',
    'Pending-changes bar: add, edit, revert, discard, save',
    'the staged set equals the submitted set exactly',
    { tier: 'R3' },
  ],
  [
    'E20',
    'Records written by the EOA vs by the HCA',
    'both land and the submitter is the expected account — regression: profile edits were submitted from the wrong account',
  ],
  [
    'E21',
    'Agent-registration / ENSIP-25 key rendering',
    'labelled and copyable card; the key round-trips through the resolver',
    { tier: 'R3' },
  ],
])

const extraF: Scenario[] = suite('F', 'transfer', 'portal', 'P5', [
  [
    'F9',
    'Each detach-toggle combination (2³ minus the impossible)',
    'step count matches the buildTransferPlan table, and every untouched target is byte-identical afterwards (INV2)',
  ],
  [
    'F10',
    'Recipient as ENS name, address, name-with-whitespace, self, zero address, unresolvable',
    'the preview resolves, or the correct rejection fires — one distinct outcome per input',
  ],
  [
    'F11',
    'Transfer, then the new owner operates the name',
    'the new owner can deploy a resolver and write a record',
  ],
  [
    'F12',
    'Transfer with the resolver kept → ETH address repointed at the recipient',
    'addr() reads back as the recipient, not the old owner',
  ],
  [
    'F13',
    'Non-owner and disconnected visitors',
    'not-authorized and connect-prompt respectively; neither offers the action (INV5)',
  ],
  [
    'F14',
    'Transfer interrupted after step 1 of N',
    'state is recoverable and the user is told exactly what already executed (INV1)',
  ],
  [
    'F15',
    'Transfer a subname end to end',
    "the token moves in the PARENT's subregistry, and the parent's own owner, resolver and subregistry pointer are byte-identical afterwards",
  ],
  [
    'F16',
    "Parent-authority warning enumerates exactly the powers the parent owner holds",
    'the rendered clauses match the three hasRoles reads (ROLE_UNREGISTER on the subname resource, ROLE_REGISTRAR at ROOT 0, ROLE_SET_SUBREGISTRY on the parent token), and a 2LD shows no such warning at all',
  ],
  [
    'F19',
    'Transfer a subname that only INHERITS its parent resolver',
    "neither the resolver-detach nor the set-eth-address option is offered, and the PARENT's resolver is byte-identical after the transfer",
  ],
  [
    'F20',
    'Transfer a subname that has its OWN resolver — the multi-step, irreversible plan',
    "detach-resolver runs before transfer-token and clears only the subname's own slot; the parent's resolver is byte-identical afterwards even when both slots hold the same contract. Also covers E2E-010: set-eth-addr must not report success once the name has no resolver of its own",
  ],
  [
    'F21',
    'Subname whose owner lacks ROLE_CAN_TRANSFER_ADMIN',
    '"Transfer not available" and no form — asserted with an owner who is NOT the subregistry deployer, since root roles would otherwise grant it back',
  ],
])

const extraI: Scenario[] = suite('I', 'fuses', 'portal', 'P5', [
  [
    'I6',
    'Burn a fuse that makes the name unmigratable (CANNOT_TRANSFER)',
    'the user is warned *before* burning that migration becomes permanently impossible (INV1)',
  ],
])

const extraX: Scenario[] = suite('6', 'cross-app', 'cross-app', 'P4', [
  [
    'X11',
    'Same name: indexer-backed view in one app vs chain-backed in the other',
    'they agree, or the divergence is visible to the user (INV4)',
  ],
  [
    'X12',
    'Burn a fuse in portal → manager migration eligibility changes',
    'e.g. CANNOT_TRANSFER makes the name drop out of the migratable list with the reason named',
    { tier: 'R0' },
  ],
  [
    'X13',
    'Deploy a subregistry in portal → manager subname creation becomes possible',
    'the affordance appears only after the subregistry exists on chain (INV5)',
    { tier: 'R2' },
  ],
  [
    'X14',
    'Detach a resolver in portal → manager profile shows no records, not stale ones',
    'cross-app cache invalidation — the manager must not serve the pre-detach record set',
  ],
  [
    'X15',
    'EOA in one app, HCA in the other, same underlying owner',
    'both recognise ownership and offer the same owner-gated affordances',
    { tier: 'R2' },
  ],
  [
    'X16',
    'Notification triggered by a portal action, read in manager',
    'event ingestion end-to-end through the api-worker',
  ],
])

// ── R3 · §N Notifications & api-worker ───────────────────────────────────
// Backend is `workers/api-worker` (Hono, JWT auth, queues, DLQ, SendGrid).
// Supersedes the plan's J7, which was a single row for the whole area.

const notificationsN: Scenario[] = suite(
  'N',
  'notifications',
  'manager',
  'P5',
  [
    [
      'N1',
      'Email channel: add, verify via link, resend, wrong code, expired code',
      'the channel reaches `verified` in the backend for the happy path and stays unverified for each negative',
    ],
    [
      'N2',
      'Telegram channel: link, auth payload validation, unlink',
      'utils/telegram/auth accepts only a valid payload',
    ],
    [
      'N3',
      'Push channel: permission grant, deny, subscribe, unsubscribe',
      'subscription persisted in the backend',
    ],
    [
      'N4',
      'Preferences per notification type',
      'saved and honoured at delivery',
    ],
    [
      'N5',
      'Inbox: list, unread count, filter badges, grouping, mark-read',
      'grouping matches utils/grouping on the same input',
    ],
    [
      'N6',
      'Notification dropdown',
      'unread count equals the inbox unread count',
    ],
    [
      'N7',
      'Each template renders: name-expiry, name-transferred, blog-post, alpha-welcome, ens-update',
      'correct name and date substitution in each',
    ],
    [
      'N8',
      'Expiry discovery → name-expiry notification (@time)',
      'advancing to N days pre-expiry produces exactly one notification, not duplicates on re-run',
    ],
    [
      'N9',
      'Name transferred → notification for both parties',
      'both delivered, ordered correctly relative to the transfer confirmation',
    ],
    [
      'N10',
      'Unauthenticated access to /notifications',
      'SIWE gate fires, then the flow resumes at the target route',
    ],
    [
      'N11',
      'Delivery failure → DLQ',
      'the notification is not lost — it lands in the dead-letter queue',
    ],
    [
      'N12',
      'Unsubscribe honoured end-to-end',
      'no delivery of any kind after opt-out',
    ],
  ],
)

// ── R1 · §Y Payments & auto-renewal — mock boundary only ─────────────────
// Both are UI-only today: payment/stores/payment-methods.ts is a persisted
// local store and auto-renewal/MOCKS.ts is three hardcoded names. Assert the
// mock contract, never chain. Re-scope when a backend lands.

const paymentsY: Scenario[] = suite('Y', 'payments', 'manager', 'P5', [
  [
    'Y1',
    'Add each payment-method type (card, Google Pay, Apple Pay, PayPal)',
    'the store contains it and it survives a reload',
  ],
  ['Y2', 'Remove a method', 'removed from the store'],
  ['Y3', 'Set default', 'moved to index 0 of the store'],
  [
    'Y4',
    'Empty state → first method added',
    'the list renders instead of the empty state',
  ],
  [
    'Y5',
    'Auto-renewal list renders the mock names with expiry + price',
    'matches MOCKS.RENEWALS exactly',
  ],
  [
    'Y6',
    'Auto-renewal enable/disable toggles',
    'state persists across reload',
    { planId: 'B10 (superseded plan)' },
  ],
  [
    'Y7',
    'Payment-method selection inside bulk renew',
    'the selected method reaches the summary step',
  ],
])

// ── R3 · §R Resolution: forward, reverse, primary, L2 ────────────────────
// Supersedes the plan's H8 (primary name) and H9 (mismatch).

const resolutionR: Scenario[] = suite('R', 'resolution', 'shared', 'P5', [
  [
    'R1',
    'Set primary name; unset',
    'addr() and the reverse record both read back correctly on chain',
    { planId: 'H8 (superseded plan)' },
  ],
  [
    'R2',
    'Primary name auto-set after registration',
    'see A19 — asserted on chain',
  ],
  [
    'R3',
    'Reverse resolution table per chain',
    'matches useReverseResolution per chainId, read independently',
  ],
  [
    'R4',
    'Set L2 reverse name (useSetL2ReverseName)',
    'requires the L2 connection; the wrong network produces a switch prompt, not a failed write',
  ],
  [
    'R5',
    'Forward/reverse mismatch',
    'useReverseMatch flags it explicitly rather than rendering the stale name as valid',
    { planId: 'H9 (superseded plan)' },
  ],
  [
    'R6',
    'Address resolution table: multiple coin types, unset, invalid',
    'per-coinType rendering distinguishes unset from invalid',
  ],
  [
    'R7',
    'Forward names for a resolved address',
    'the list matches the resolver’s records read on chain',
  ],
  [
    'R8',
    'Primary name for a name that later transfers',
    'the stale reverse record is surfaced, never silently shown as valid',
  ],
  [
    'R9',
    '/addr/$addr/resolution and /reverse-resolution sidebars',
    'the detail panel matches the row it opened from',
  ],
  [
    'R10',
    'Primary name from each entry point (manager settings, profile, portal)',
    'the same on-chain result from all three',
  ],
])

// ── R3 · §S Search & discovery ───────────────────────────────────────────
// Supersedes the plan's H4.

const searchS: Scenario[] = suite('S', 'search', 'shared', 'P5', [
  [
    'S1',
    'Search: exact name, partial, address, invalid, unnormalised, already-owned, available',
    'the correct category per buildSearchSuggestions for each of the seven inputs',
    { planId: 'H4 (superseded plan)' },
  ],
  [
    'S2',
    'Search result → correct destination per category',
    'routing exact for each category',
  ],
  [
    'S3',
    'Search modal: keyboard nav, escape, empty query',
    'SearchModalContent behaviour for each',
  ],
  [
    'S4',
    'Address search → address profile',
    'the /p/$name shim redirects an address to /$address',
  ],
  [
    'S5',
    'Search a name that exists only in V1',
    'shown with the V1 badge and a migration CTA, not as available',
  ],
  [
    'S6',
    'Search a reserved (premigrated) name',
    'shown as reserved, never as available',
  ],
  [
    'S7',
    'Debounce / race: type fast, results match the final query',
    'no stale result wins the race',
  ],
])

// ── R3 · §T Token, metadata, NFT ─────────────────────────────────────────
// Supersedes the plan's H10.

const tokenT: Scenario[] = suite('T', 'token', 'portal', 'P5', [
  [
    'T1',
    '/$name/token: tokenId, uri, renderer',
    'matches getTokenId and uri() read on chain',
    { planId: 'H10 (superseded plan)' },
  ],
  [
    'T2',
    'uri unset vs set with a renderer',
    'both render correctly and distinguishably',
  ],
  [
    'T3',
    'setURI without ROLE_SET_URI',
    'the action is not offered and direct navigation is blocked (INV5)',
    { tier: 'R2' },
  ],
  [
    'T4',
    'Token page for a migrated locked name',
    'the tokenId is the WrapperRegistry’s, not the parent’s',
    { tier: 'R0' },
  ],
  ['T5', 'Commemorative migration NFT', 'see GU5'],
  [
    'T6',
    'Token version id changes after regenerate/burn',
    'tokenVersionId / eacVersionId reflected in the UI',
  ],
])

// ── R3/R4 · §U App shell & chrome ────────────────────────────────────────
// U6 and U7 supersede the plan's K9 and K8.

const shellU: Scenario[] = suite('U', 'shell', 'shared', 'P6', [
  [
    'U1',
    'Landing page renders, CTAs route correctly',
    'each CTA lands on its documented route',
  ],
  [
    'U2',
    'Navigation: every nav item, active state, mobile menu',
    'active state matches the current route',
  ],
  [
    'U3',
    '404 for an unknown route, unknown name, unknown address',
    'three distinct not-found states, not one generic page',
  ],
  [
    'U4',
    'Legal pages render and are linked',
    'every /legal/* route reachable from the footer',
  ],
  [
    'U5',
    '/p/$name shim: name → /$name, address → /$address',
    'the redirect target is exact for both',
  ],
  [
    'U6',
    'Deep link to every route while disconnected',
    'connect prompt, then resume at the original target — not the home page',
    { tier: 'R4', planId: 'K9 (superseded plan)' },
  ],
  [
    'U7',
    'Browser back/forward through every multi-step flow',
    'no orphaned state in the transaction machine',
    { tier: 'R4', planId: 'K8 (superseded plan)' },
  ],
  [
    'U8',
    'Transaction modal / countdown UX',
    'shouldShowWaitCountdown and getActiveTransaction — the countdown appears only when it should',
  ],
  [
    'U9',
    'Theme / dark mode if present',
    'probe first — the affordance may not exist',
    { tier: 'R4' },
  ],
])

// ── R3 · §Z DNS & non-.eth TLDs ──────────────────────────────────────────
// Supersedes the plan's H11.

const dnsZ: Scenario[] = suite('Z', 'dns', 'portal', 'P5', [
  [
    'Z1',
    '/tld/$tld for .eth',
    'registry, owner and history all render from chain reads',
    { planId: 'H11 (superseded plan)' },
  ],
  [
    'Z2',
    '/tld/$tld for a DNS TLD',
    'the DNSTLDResolver path is taken and the DNSSEC-enabled flag is correct',
  ],
  [
    'Z3',
    'A DNS name’s profile',
    'resolves via the DNS resolver, or states plainly that it cannot',
  ],
  [
    'Z4',
    'DNS claim flow',
    'probe first — parity with v3 dnsclaim.spec.ts may be out of scope',
  ],
  ['Z5', 'Unsupported TLD', 'a clear unsupported state, never a crash'],
])

// ── §MD Metadata Service (WEB-1191) ───────────────────────────────────────
// The external metadata service (github.com/ensdomains/metadata-service-v2),
// run locally by `infra/docker-compose.yml`'s `metadata-service` container
// against the shared sepolia Anvil fork + a read-only mainnet fork
// (`anvil-mainnet`). Indexers are deliberately unreachable — every row here
// exercises the service's on-chain-fallback classification path
// (`src/services/metadata.ts` `statusFromSource`), not an indexer. See
// `e2e-build-goal.md` §2 and `projects/metadata/tests/*.spec.ts`.
const metadataMD: Scenario[] = suite('MD', 'metadata', 'metadata', 'P6', [
  [
    'MD1',
    'Mainnet v1 name resolves metadata correctly',
    'on-chain read (mainnet fork, legacy Registry.owner()) vs. /migration-status and unified metadata response',
  ],
  [
    'MD2',
    'Sepolia v1 name resolves metadata correctly',
    'on-chain read (sepolia fork, BaseRegistrar.ownerOf) vs. avatar/metadata/migration-status responses',
  ],
  [
    'MD3',
    'Sepolia v2 name resolves metadata correctly',
    'on-chain read (v2 ETH Registry) vs. avatar + both unified-metadata URL shapes (registry, namewrapper)',
  ],
  [
    'MD4',
    'Sepolia v1→v2 migration is observable',
    'MigrationHelper.migrate on-chain vs. /migration-status reporting "migrated" (with an un-migrated negative control)',
  ],
  [
    'MD5',
    'Cache invalidation via the webhook',
    'X-Cache-Status transitions (miss→hit→miss) plus changed response bytes, driven by a real signed POST /webhook',
  ],
  [
    'MD6',
    'Dispatch, graceful degradation, and webhook auth',
    '404/400/401/503 on the documented error paths; never a 500',
    { tier: 'R4' },
  ],
])

export const scenarios: Scenario[] = [
  ...harness,
  ...registrationA,
  ...extraA,
  ...renewalB,
  ...rolesC,
  ...extraC,
  ...registryD,
  ...extraD,
  ...resolversE,
  ...extraE,
  ...transferF,
  ...extraF,
  ...migrationG,
  ...surfacesH,
  ...fusesI,
  ...extraI,
  ...walletJ,
  ...resilienceK,
  ...qualityL,
  ...notificationsN,
  ...paymentsY,
  ...resolutionR,
  ...searchS,
  ...tokenT,
  ...shellU,
  ...dnsZ,
  ...crossAppX,
  ...extraX,
  ...metadataMD,
]

export const scenarioById = new Map(scenarios.map((row) => [row.id, row]))

/** Duplicate-id guard — a duplicate would silently double-count the ratchet. */
const duplicates = scenarios
  .map((row) => row.id)
  .filter((id, i, all) => all.indexOf(id) !== i)
if (duplicates.length > 0) {
  throw new Error(
    `Duplicate scenario ids in registry: ${[...new Set(duplicates)].join(', ')}`,
  )
}
