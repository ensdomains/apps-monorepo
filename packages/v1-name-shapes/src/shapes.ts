import type { Shape } from './types'

/**
 * Owner-controlled child fuses. Protocol constants, not deployment addresses —
 * safe to write here, and this package is deliberately dependency-free.
 */
export const FUSES = {
  CANNOT_UNWRAP: 1,
  CANNOT_BURN_FUSES: 2,
  CANNOT_TRANSFER: 4,
  CANNOT_SET_RESOLVER: 8,
  CANNOT_SET_TTL: 16,
  CANNOT_CREATE_SUBDOMAIN: 32,
  CANNOT_APPROVE: 64,
} as const

/**
 * Every V1 shape the portal has to render correctly.
 *
 * Slot numbers are grouped by depth (1–19 two-level, 20–39 three-level, 40+
 * four-level) and are **permanent**: they are the numeric half of every
 * scenario id. Gaps are deliberate — they leave room to add a shape to a group
 * without renumbering the ones after it, which would silently re-point existing
 * ledger rows at different behaviour.
 *
 * Depth is not a free axis. ens-app-v3 collapses every subname to one class, so
 * a 4LD differs from a 3LD only through its *parent's* state, which is already
 * an axis here. The four-level shapes therefore exist to probe three specific
 * code paths, and each says which one in its `rationale`:
 *
 *   1. `getV1NameState` reads exactly **one** level of parent;
 *   2. `getEth2LDAncestor` jumps straight to the `.eth` 2LD, skipping levels;
 *   3. `isRegistrable`/expiry reads only ever look at the `.eth` 2LD.
 */
const SHAPE_LIST = [
  // ── Two-level ─────────────────────────────────────────────────────────
  {
    n: 1,
    id: '2ld-unwrapped:owner',
    path: [{ wrap: 'unwrapped' }],
    role: 'owner',
    registration: 'active',
    rationale:
      'The baseline: registrant and controller are the same wallet, so every surface should name it once and agree with itself.',
    v3NameType: 'eth-unwrapped-2ld',
  },
  {
    n: 2,
    id: '2ld-unwrapped:manager',
    path: [{ wrap: 'unwrapped', holder: 'user2', controller: 'user' }],
    role: 'manager',
    registration: 'active',
    tails: ['split-registrant'],
    rationale:
      'The connected wallet controls records but does not hold the token. This is the half of the registrant/controller split that E2E-011 renders as "Owner", and the shape ens-app-v3 offers Sync Manager for.',
    v3NameType: 'eth-unwrapped-2ld:manager',
  },
  {
    n: 3,
    id: '2ld-unwrapped:registrant',
    path: [{ wrap: 'unwrapped', holder: 'user', controller: 'user2' }],
    role: 'registrant',
    registration: 'active',
    tails: ['split-controller'],
    rationale:
      'The mirror of slot 2: the connected wallet holds the ERC-721 while somebody else manages records. The owner row must show this wallet, and record editing must not be offered to it.',
    v3NameType: 'eth-unwrapped-2ld:owner',
  },
  {
    n: 4,
    id: '2ld-unwrapped:stranger',
    path: [{ wrap: 'unwrapped', holder: 'user2', controller: 'user2' }],
    role: 'stranger',
    registration: 'active',
    rationale:
      'Nothing is offered to a wallet that holds nothing — the negative control for every affordance the owner shapes assert.',
    v3NameType: 'eth-unwrapped-2ld:unowned',
  },
  {
    n: 5,
    id: '2ld-emancipated:owner',
    path: [{ wrap: 'emancipated' }],
    role: 'owner',
    registration: 'active',
    rationale:
      'A wrapped 2LD: one ERC-1155 owner, no manager row at all, and the legacy registry owner is the NameWrapper rather than a person.',
    v3NameType: 'eth-emancipated-2ld',
  },
  {
    n: 6,
    id: '2ld-emancipated:stranger',
    path: [{ wrap: 'emancipated', holder: 'user2' }],
    role: 'stranger',
    registration: 'active',
    rationale:
      'The wrapped negative control. Distinct from slot 4 because ownership is read from the NameWrapper, not the registrar.',
    v3NameType: 'eth-emancipated-2ld:unowned',
  },
  {
    n: 7,
    id: '2ld-locked:owner',
    path: [{ wrap: 'locked' }],
    role: 'owner',
    registration: 'active',
    rationale:
      'CANNOT_UNWRAP burned. The fuses tab must show it, and nothing may offer to unwrap.',
    v3NameType: 'eth-locked-2ld',
  },
  {
    n: 8,
    id: '2ld-locked-no-transfer:owner',
    path: [{ wrap: 'locked', extraFuses: FUSES.CANNOT_TRANSFER }],
    role: 'owner',
    registration: 'active',
    rationale:
      'One fuse away from slot 7, and the difference is a permanent refusal: the owner still owns it and can never move it. Isolated from Locked+All so the outcome is attributable to this fuse alone.',
    v3NameType: 'eth-locked-2ld',
  },
  {
    n: 9,
    id: '2ld-locked-no-resolver:owner',
    path: [{ wrap: 'locked', extraFuses: FUSES.CANNOT_SET_RESOLVER }],
    role: 'owner',
    registration: 'active',
    rationale:
      'CANNOT_SET_RESOLVER is the fuse that makes the transfer flow withhold its resolver-detach option, and it is what forces migration onto keep-v1. Untested at E2E level today.',
    v3NameType: 'eth-locked-2ld',
  },
  {
    n: 10,
    id: '2ld-unwrapped:grace:owner',
    path: [{ wrap: 'unwrapped' }],
    role: 'owner',
    registration: 'grace',
    tails: ['to-grace'],
    rationale:
      'In grace the registrar reverts ownerOf, so every surface that reads ownership has to fall back somewhere. The 2LD in its own grace has never been asserted — only ancestor grace, via F39.',
    v3NameType: 'eth-unwrapped-2ld:grace-period',
  },
  {
    n: 11,
    id: '2ld-unwrapped:expired:owner',
    path: [{ wrap: 'unwrapped' }],
    role: 'owner',
    registration: 'expired',
    tails: ['past-grace'],
    rationale:
      'Past grace the name is anyone’s to register. Surfaces must say so rather than showing a stale owner.',
    v3NameType: 'eth-unwrapped-2ld',
  },

  // ── Three-level ───────────────────────────────────────────────────────
  {
    n: 20,
    id: '3ld-registry+unwrapped-2ld:owner',
    path: [{ wrap: 'unwrapped' }, { wrap: 'unwrapped' }],
    role: 'owner',
    registration: 'active',
    rationale:
      'A registry-only subname: no token of any kind, ownership is a registry entry. The token tab has no ERC-721 to describe, which is where it currently invents one.',
    v3NameType: 'eth-unwrapped-subname',
  },
  {
    n: 21,
    id: '3ld-registry+unwrapped-2ld:parent',
    path: [{ wrap: 'unwrapped' }, { wrap: 'unwrapped', holder: 'user2' }],
    role: 'parent',
    registration: 'active',
    rationale:
      'The parent-initiated path #1144 added: the connected wallet holds the parent, not the name, and may reassign it with setSubnodeOwner.',
    v3NameType: 'eth-unwrapped-subname',
  },
  {
    n: 22,
    id: '3ld-registry+unwrapped-2ld:stranger',
    path: [
      { wrap: 'unwrapped', holder: 'user2' },
      { wrap: 'unwrapped', holder: 'user2' },
    ],
    role: 'stranger',
    registration: 'active',
    rationale:
      'Neither the subname nor its parent belongs to the connected wallet — the negative control for the parent path.',
    v3NameType: 'eth-unwrapped-subname',
  },
  {
    n: 23,
    id: '3ld-wrapped+emancipated-2ld:owner',
    path: [{ wrap: 'emancipated' }, { wrap: 'wrapped' }],
    role: 'owner',
    registration: 'active',
    rationale:
      'A wrapped subname whose PCC is not burned: the holder owns it, and the parent can still take it back. Both facts have to be visible.',
    v3NameType: 'eth-wrapped-subname',
  },
  {
    n: 24,
    id: '3ld-wrapped+emancipated-2ld:parent',
    path: [{ wrap: 'emancipated' }, { wrap: 'wrapped', holder: 'user2' }],
    role: 'parent',
    registration: 'active',
    rationale:
      'The wrapped half of the parent path: NameWrapper.setSubnodeOwner, which must preserve the child’s fuses and expiry.',
    v3NameType: 'eth-wrapped-subname',
  },
  {
    n: 25,
    id: '3ld-emancipated+locked-2ld:owner',
    path: [{ wrap: 'locked' }, { wrap: 'emancipated' }],
    role: 'owner',
    registration: 'active',
    rationale:
      'Emancipated: the parent has genuinely given up control until expiry, so no surface may imply the parent can reclaim it.',
    v3NameType: 'eth-emancipated-subname',
  },
  {
    n: 26,
    id: '3ld-emancipated+locked-2ld:parent',
    path: [{ wrap: 'locked' }, { wrap: 'emancipated', holder: 'user2' }],
    role: 'parent',
    registration: 'active',
    rationale:
      'The parent of an emancipated subname holds nothing over it. This is E2E-013’s shape: the refusal is right, its suggested way out is not.',
    v3NameType: 'eth-emancipated-subname',
  },
  {
    n: 27,
    id: '3ld-locked+locked-2ld:owner',
    path: [{ wrap: 'locked' }, { wrap: 'locked' }],
    role: 'owner',
    registration: 'active',
    rationale:
      'A locked child under a locked parent — the shape migration routes through the parent’s WrapperRegistry rather than re-creating.',
    v3NameType: 'eth-locked-subname',
  },
  {
    n: 28,
    id: '3ld-registry+emancipated-2ld:parent',
    path: [{ wrap: 'emancipated' }, { wrap: 'unwrapped', holder: 'user2' }],
    role: 'parent',
    registration: 'active',
    rationale:
      'Wrapped parent over an unwrapped child. Reassigning across that line would force-wrap the child, so the app must refuse — the wrapper-mismatch case, reachable today only through an imperative unwrap.',
    v3NameType: 'eth-unwrapped-subname',
  },
  {
    n: 29,
    id: '3ld-wrapped+unwrapped-2ld:owner',
    path: [{ wrap: 'unwrapped' }, { wrap: 'wrapped' }],
    role: 'owner',
    registration: 'active',
    tails: ['unwrap-parent-2ld'],
    rationale:
      'The reverse mismatch — a wrapped child under an unwrapped parent — from the holder’s side. Untested in either direction today.',
    v3NameType: 'eth-wrapped-subname',
  },
  {
    n: 30,
    id: '3ld-wrapped+unwrapped-2ld:parent',
    path: [{ wrap: 'unwrapped' }, { wrap: 'wrapped', holder: 'user2' }],
    role: 'parent',
    registration: 'active',
    tails: ['unwrap-parent-2ld'],
    rationale:
      'The same mismatch from the parent’s side: an unwrapped parent cannot reach a wrapped child without force-unwrapping it.',
    v3NameType: 'eth-wrapped-subname',
  },
  {
    n: 31,
    id: '3ld-registry+unwrapped-2ld:parent-registrant-only',
    path: [
      { wrap: 'unwrapped', controller: 'user2' },
      { wrap: 'unwrapped', holder: 'user3' },
    ],
    role: 'parent',
    registration: 'active',
    tails: ['split-controller'],
    rationale:
      'The connected wallet holds the parent’s ERC-721 but not its controller, and reassigning a subname is the controller’s power. E2E-012’s shape.',
    v3NameType: 'eth-unwrapped-subname',
  },
  {
    n: 32,
    id: '3ld-wrapped+emancipated-2ld:grace:parent',
    path: [{ wrap: 'emancipated' }, { wrap: 'wrapped', holder: 'user2' }],
    role: 'parent',
    registration: 'grace',
    tails: ['to-grace'],
    rationale:
      'E2E-014: with the 2LD in grace the wrapper refuses the parent’s move, and the app currently tells the parent it is not the owner instead of offering a renewal.',
    v3NameType: 'eth-wrapped-subname',
  },
  {
    n: 33,
    id: '3ld-wrapped+emancipated-2ld:expired:parent',
    path: [{ wrap: 'emancipated' }, { wrap: 'wrapped', holder: 'user2' }],
    role: 'parent',
    registration: 'expired',
    tails: ['past-grace'],
    rationale:
      'Past the ancestor’s grace, whoever registers the 2LD next owns everything beneath it — so nothing under it is worth transferring.',
    v3NameType: 'eth-wrapped-subname',
  },

  // ── Four-level ────────────────────────────────────────────────────────
  {
    n: 40,
    id: '4ld-locked+locked-3ld+locked-2ld:owner',
    path: [{ wrap: 'locked' }, { wrap: 'locked' }, { wrap: 'locked' }],
    role: 'owner',
    registration: 'active',
    rationale:
      'Depth probe 1: the simplest four-level name renders at all. Nothing in the suite has ever loaded one.',
    v3NameType: 'eth-locked-subname',
  },
  {
    n: 41,
    id: '4ld-locked+locked-3ld:parent',
    path: [
      { wrap: 'locked' },
      { wrap: 'locked' },
      { wrap: 'locked', holder: 'user2' },
    ],
    role: 'parent',
    registration: 'active',
    rationale:
      'Depth probe 1: the parent is itself a subname, not a 2LD, so deriveParent takes its non-registrar arm — the arm E2E-014 shows is the fragile one.',
    v3NameType: 'eth-locked-subname',
  },
  {
    n: 42,
    id: '4ld-registry+registry-3ld+unwrapped-2ld:owner',
    path: [{ wrap: 'unwrapped' }, { wrap: 'unwrapped' }, { wrap: 'unwrapped' }],
    role: 'owner',
    registration: 'active',
    rationale:
      'Depth probe 2: two registry levels, so the level getEth2LDAncestor skips is non-trivial and a one-level parent read is demonstrably not enough.',
    v3NameType: 'eth-unwrapped-subname',
  },
  {
    n: 43,
    id: '4ld-registry+registry-3ld:parent',
    path: [
      { wrap: 'unwrapped' },
      { wrap: 'unwrapped' },
      { wrap: 'unwrapped', holder: 'user2' },
    ],
    role: 'parent',
    registration: 'active',
    rationale:
      'Depth probe 2, parent side: setSubnodeOwner two levels below the 2LD.',
    v3NameType: 'eth-unwrapped-subname',
  },
  {
    n: 44,
    id: '4ld-wrapped+wrapped-3ld+emancipated-2ld:grace:owner',
    path: [{ wrap: 'emancipated' }, { wrap: 'wrapped' }, { wrap: 'wrapped' }],
    role: 'owner',
    registration: 'grace',
    tails: ['to-grace'],
    rationale:
      'Depth probe 3: expiry is only ever read from the .eth 2LD, so a four-level name under a 2LD in grace is where that assumption breaks if it is going to.',
    v3NameType: 'eth-wrapped-subname',
  },
  {
    n: 45,
    id: '4ld-registry+wrapped-3ld:parent',
    path: [
      { wrap: 'emancipated' },
      { wrap: 'wrapped' },
      { wrap: 'unwrapped', holder: 'user2' },
    ],
    role: 'parent',
    registration: 'active',
    rationale:
      'Wrapper mismatch where neither level is a 2LD — the highest-value four-level shape, and the only one needing new fixture work.',
    v3NameType: 'eth-unwrapped-subname',
  },

  // ── Declared unseedable ───────────────────────────────────────────────
  // Present so the matrix states them as gaps rather than implying coverage by
  // omission. Each becomes an EXEMPT row in the ledger.
  {
    n: 60,
    id: '3ld-pcc-expired',
    path: [{ wrap: 'locked' }, { wrap: 'emancipated' }],
    role: 'parent',
    registration: 'active',
    rationale:
      'An emancipated subname whose own expiry has passed while its parent is still live — the state ens-app-v3 calls pcc-expired and offers a reclaim for.',
    v3NameType: 'eth-pcc-expired-subname',
    unseedable: {
      reason:
        'NameWrapper._normaliseExpiry clamps a child’s expiry to its parent’s, so a child cannot lapse while its parent is active. Reachable only by expiring the parent, which is a different shape (33).',
    },
  },
  {
    n: 61,
    id: 'dns-names',
    path: [{ wrap: 'unwrapped' }],
    role: 'owner',
    registration: 'active',
    rationale:
      'Every non-.eth name routes to the V1 path, and the transfer feature carries DNS-specific copy no test has ever run.',
    v3NameType: 'dns-unwrapped-2ld',
    unseedable: {
      reason:
        'No DNSRegistrar seeding machinery exists anywhere in e2e/. Out of scope by decision; the portal surface is tracked by catalogue suite Z.',
    },
  },
] as const satisfies readonly Shape[]

/**
 * Every id, as a literal union — so a typo in an expectations key or a
 * generated spec is a compile error rather than a silently absent cell.
 */
export type ShapeId = (typeof SHAPE_LIST)[number]['id']

/**
 * The same table, widened to `Shape`.
 *
 * `as const` above narrows each entry to its own literal type, which is what
 * makes `ShapeId` exact — but it also means optional fields (`unseedable`,
 * `tails`, `controller`) do not exist on the entries that omit them, so
 * iterating the union cannot read them. Consumers get this widened view;
 * `ShapeId` keeps the precision.
 */
export const SHAPES: readonly Shape[] = SHAPE_LIST

/** The shapes a test can actually build. */
export const seedableShapes = (): readonly Shape[] =>
  SHAPES.filter((s) => !s.unseedable)

export const shapeById = (id: ShapeId): Shape => {
  const shape = SHAPES.find((s) => s.id === id)
  if (!shape) throw new Error(`unknown shape "${id}"`)
  return shape
}

/** Depth in labels: a 2LD is 2, a 3LD is 3. */
export const depthOf = (shape: Shape): number => shape.path.length + 1
