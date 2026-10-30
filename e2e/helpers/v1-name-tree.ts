/**
 * The ENSv1 name shapes the migration specs describe: a flat list of `.eth`
 * 2LDs, or a tree with subnames to any depth. `serveV1Names` (v1-names.ts)
 * takes either and makes the manager see them through bigname.
 */
import type {
  V1AddressRecord,
  V1NameType,
  V1TextRecord,
} from '../fixtures/makeV1Name.js'

/** Records a node carries on its V1 resolver. */
export type MockV1Records = {
  texts?: V1TextRecord[]
  addresses?: V1AddressRecord[]
  /** Presence, not value — this is how migration learns a contenthash EXISTS. */
  contentHash?: string | null
  abiContentTypes?: number[]
}

/**
 * How a node exists in V1. This is a discriminated union rather than a set of
 * optional flags because the three shapes are genuinely disjoint on chain, and
 * every one of them makes `classifyName` take a different branch:
 *
 * - `registration`  a `.eth` 2LD held by the BaseRegistrar (optionally wrapped)
 * - `wrapped-child` a NameWrapper subname — an ERC-1155 under its parent's node
 * - `registry-child` a subname owned directly in the legacy registry, no token
 */
export type MockV1NodeKind =
  | {
      readonly kind: 'registration'
      /** Mirrors `makeV1Name`'s `type`. */
      readonly type?: V1NameType
      /**
       * Owner-controlled fuse bits only. PARENT_CANNOT_CONTROL and IS_DOT_ETH
       * are burned by `wrapETH2LD` itself and are OR'd in here, matching what
       * the NameWrapper actually reports.
       */
      readonly ownerFuses?: number
      /**
       * The NameWrapper's expiry, which for a wrapped `.eth` 2LD is the
       * REGISTRAR expiry plus the 90-day grace period — `wrapETH2LD` adds it.
       * The two are different numbers and the app compares this one exactly:
       * `assertUnlockedMigratingRootFresh` re-reads `NameWrapper.getData` before
       * planning a copy and rejects the whole migration with
       * `source-expiry-changed` if it disagrees with the subgraph.
       *
       * It defaults to `expiryDate + 90 days`, which is the right SHAPE but
       * cannot be exact — the registration expiry is set by the block timestamp
       * at registration, not by the clock here. So any test that migrates a copy
       * under a wrapped parent must read the real value off chain and pass it
       * (`readWrapperExpiry` in `makeV1Subname.ts`).
       */
      readonly wrapperExpiry?: number
    }
  | {
      readonly kind: 'wrapped-child'
      /**
       * The FULL fuse bitmap the NameWrapper reports for this child. Nothing is
       * OR'd in. A subname is not a `.eth` 2LD, so IS_DOT_ETH must not be set,
       * and PARENT_CANNOT_CONTROL is exactly the bit that decides
       * `detached-child` (migrate) versus `unlocked-child` (copy). The old mock
       * OR'd both bits into every name unconditionally, which is what made the
       * copy path impossible to express.
       */
      readonly fuses: number
    }
  | { readonly kind: 'registry-child' }

export type MockV1Node = MockV1NodeKind & {
  /** ONE label. Never a dotted path — the tree supplies the ancestry. */
  readonly label: string
  /**
   * Unix seconds. For a `registration` this is the registration *and* wrapper
   * expiry. For a `wrapped-child` it is `wrappedDomain.expiryDate`, which the
   * classifier reads as a copy's `sourceExpiry` — so it must be settable
   * independently of the parent to test `expired-registration`.
   */
  readonly expiryDate?: number
  readonly registrationDate?: number
  /**
   * `null` is meaningful and is the default for a child: the classifier's
   * `hasSupportedCopyResolver(null)` is `true`, so a resolver-less subname is
   * eligible to copy. Point this at an unrecognised address to build an
   * `unsupported-resolver` fixture.
   */
  readonly resolver?: string | null
  readonly records?: MockV1Records
  /** Defaults to the tree's owner. */
  readonly ownerAddress?: string
  /** `registration` nodes only — differs from the owner for the managed case. */
  readonly registrantAddress?: string
  /** `registration` nodes only — no live ENSv2 entry (premigration missing). */
  readonly unreserved?: boolean
  readonly children?: readonly MockV1Node[]
}

export type MockV1Tree = {
  readonly ownerAddress: string
  readonly roots: readonly MockV1Root[]
}

/**
 * A root normally hangs off `eth`. Overriding that is how an ORPHAN is
 * expressed: a subname whose parent genuinely exists on chain but is
 * deliberately absent from the injection, so `hasCompleteCopyRoute` cannot
 * reach a migrating 2LD ancestor and the name is demoted to `missing-parent`.
 *
 * The parent's fuses are unknowable in that case — the subgraph would report
 * them, but the point of the fixture is that we are not reporting the parent at
 * all — so `parentWrappedFuses` is whatever the caller declares.
 */
export type MockV1Root = MockV1Node & {
  /** Full parent name, e.g. `absent.eth`. Defaults to `eth`. */
  readonly parentName?: string
  /** The absent parent's wrapper fuses, if it is wrapped. */
  readonly parentFuses?: number
}

/**
 * The original flat form: one `.eth` 2LD per entry. Still supported verbatim so
 * `migration.spec.ts`, `migration-fuses.spec.ts` and `migration-premium.spec.ts`
 * need no changes.
 */
export type MockV1Name = {
  /** Full name including .eth (e.g. "migtest-123.eth") */
  name: string
  /** EOA address that owns this V1 name */
  ownerAddress: string
  /** V1 name type — must match what was passed to makeV1Name */
  type?: V1NameType
  /**
   * Override the full fuse bitmap injected into the subgraph mock.
   * When provided, overrides the default fuses derived from `type`.
   * The NameWrapper always auto-adds PARENT_CANNOT_CONTROL | IS_DOT_ETH for .eth
   * 2LDs, so pass only the owner-controlled bits (e.g. FUSES.CANNOT_UNWRAP | FUSES.CANNOT_BURN_FUSES).
   * The mock will OR in PARENT_CANNOT_CONTROL and IS_DOT_ETH automatically.
   */
  fuses?: number
  /** Registration expiry timestamp (Unix seconds). Defaults to now + 1 year. */
  expiryDate?: number
  /** V1 records set on this name (used to mock getProfilesForDomains) */
  records?: MockV1Records
  /** Subnames beneath this 2LD, to any depth. */
  children?: readonly MockV1Node[]
}
