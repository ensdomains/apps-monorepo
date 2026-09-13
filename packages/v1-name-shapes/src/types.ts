/**
 * The vocabulary for describing a V1 name's shape.
 *
 * Ported from ens-app-v3's `src/hooks/nameType/getNameType.ts`, which is the
 * closest thing to a settled taxonomy for V1 names: four axes (TLD type, depth,
 * wrap level, registration status) collapsed into 24 `NameType` strings. We
 * port the **axes**, not the strings, because the portal's surfaces differ from
 * ens-app-v3's and a shape here has to carry things a `NameType` cannot — most
 * importantly *who the connected wallet is* relative to the name.
 *
 * What we deliberately do not port is ens-app-v3's expected **abilities**.
 * Those are assertions about its own hooks, verified against its own mocks;
 * asserting that the portal agrees with them would be asserting one app's
 * rendering against another's, which is the bottom of the oracle hierarchy in
 * `e2e/docs/e2e-build-goal.md` §4. Contract-level rules are different — which
 * contract and method may legally move a name is a NameWrapper/BaseRegistrar
 * fact, independently checkable — and those we do port.
 */

/** Wallet slots from the e2e accounts fixture, resolved to addresses at runtime. */
export type Actor = 'user' | 'user2' | 'user3'

/**
 * The wrap ladder, in ens-app-v3's priority order (`getWrapLevel`): a name that
 * has burned `CANNOT_UNWRAP` reports `locked` even though `PARENT_CANNOT_CONTROL`
 * is also burned, because locked is the stronger claim.
 *
 * - `unwrapped` — a 2LD held as the registrar's ERC-721 (registrant) with a
 *   separate registry controller; a subname held directly in the registry with
 *   no NameWrapper token at all.
 * - `wrapped` — a NameWrapper token with `PARENT_CANNOT_CONTROL` **not** burned,
 *   so the parent can still take it back. Subnames only: `wrapETH2LD` always
 *   burns PCC on a 2LD, so a "merely wrapped" 2LD does not exist.
 * - `emancipated` — PCC burned, `CANNOT_UNWRAP` not.
 * - `locked` — PCC + `CANNOT_UNWRAP`.
 */
export type WrapClass = 'unwrapped' | 'wrapped' | 'emancipated' | 'locked'

/**
 * Which hat the connected wallet wears. ens-app-v3 encodes this as the
 * `:owner` / `:manager` / `:unowned` suffixes on its mock states; it is an
 * axis in its own right because the same on-chain name renders differently
 * depending on who is looking.
 *
 * `manager` and `registrant` exist only for an unwrapped 2LD, which is the one
 * V1 shape that splits ownership across two contracts — and the split that
 * produced E2E-011.
 */
export type Role =
  /** Holds the name itself: the registrant, or the wrapper owner. */
  | 'owner'
  /** Unwrapped 2LD: the ENSRegistry controller, but not the ERC-721 holder. */
  | 'manager'
  /** Unwrapped 2LD: the ERC-721 holder, but not the controller. */
  | 'registrant'
  /** Holds the PARENT; the name itself belongs to somebody else (#1144). */
  | 'parent'
  /** Connected, but holds nothing anywhere in the chain of ancestry. */
  | 'stranger'

/** Registrar state of the `.eth` 2LD at the root of the shape's path. */
export type Registration = 'active' | 'grace' | 'expired'

/** One level of a name, written parent-first. */
export type NodeSpec = {
  readonly wrap: WrapClass
  /** Owner-controlled fuses beyond what `wrap` implies — CANNOT_TRANSFER etc. */
  readonly extraFuses?: number
  /** Who holds this level. Defaults to `user`. */
  readonly holder?: Actor
  /** Unwrapped 2LD only: the registry controller, when it differs from `holder`. */
  readonly controller?: Actor
}

/**
 * A write that happens *after* the declarative tree exists, because no
 * declarative shape can express it. The dev-tools drawer already has three of
 * these open-coded in `finishReassignPreset`; naming them here is what lets the
 * drawer and the e2e fixtures share one vocabulary.
 */
export type SeedTail =
  /** `BaseRegistrar.safeTransferFrom` — hand the ERC-721 away, keep the controller. */
  | 'split-registrant'
  /** `ENSRegistry.setOwner` — hand the controller away, keep the ERC-721. */
  | 'split-controller'
  /** `NameWrapper.unwrap` the child: wrapped parent over a registry child. */
  | 'unwrap-child'
  /** `NameWrapper.unwrapETH2LD` the 2LD: unwrapped parent under a wrapped child. */
  | 'unwrap-parent-2ld'
  /** `NameWrapper.unwrap` the 3LD: a mixed-shape 4LD, neither level a 2LD. */
  | 'unwrap-parent-subname'
  /** Advance the clock into the 2LD's 90-day grace window. */
  | 'to-grace'
  /** Advance the clock past grace entirely. */
  | 'past-grace'

export type Shape = {
  /**
   * Permanent slot number. It is the numeric half of every scenario id this
   * shape owns (`VO24` is the Ownership tab of shape 24), so it must never be
   * renumbered and never reused — deleting a shape leaves a hole.
   */
  readonly n: number
  readonly id: string
  /** Parent-first: `path[0]` is always the `.eth` 2LD. Length === depth - 1. */
  readonly path: readonly [NodeSpec, ...NodeSpec[]]
  readonly role: Role
  readonly registration: Registration
  readonly tails?: readonly SeedTail[]
  /**
   * The rule this shape is the witness for. Mandatory: a shape that cannot say
   * which behaviour it pins is a cell that will be asserted, maintained and
   * never diagnosed. No rationale, no shape.
   */
  readonly rationale: string
  /** ens-app-v3's `NameType` for the same state. Traceability only, never asserted. */
  readonly v3NameType: string
  /** Set when the state cannot be built on the fork; becomes an EXEMPT ledger row. */
  readonly unseedable?: { readonly reason: string }
}

/** A portal route that renders something about a name. */
export type Tab = {
  readonly id: string
  /** Scenario-id prefix; also decides the tier in `e2e/coverage/scenarios.ts`. */
  readonly prefix: string
  /** Route for a given name, relative to the portal origin. */
  readonly path: (name: string) => string
  /** What this tab is for, in the matrix doc. */
  readonly title: string
  /**
   * True when the tab refuses every V1 name outright with fixed copy. Those
   * cells do not vary by shape, so the matrix asserts the refusal on one
   * representative shape per protocol rather than on all of them.
   */
  readonly v2Only?: boolean
}
