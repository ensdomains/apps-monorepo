/**
 * What each cell of the matrix must render.
 *
 * Two rules hold this file together.
 *
 * **Values are named, not written.** A row says it must show the `registrant`,
 * and the test resolves that against an independent chain read at assert time.
 * Hardcoding an address would break rule 7 and be wrong anyway, since every
 * seeded name is fresh; asking the app what it thinks the owner is would be
 * asking the bug to confirm itself.
 *
 * **A known-wrong cell keeps the correct expectation** and adds `defect`. The
 * generator wraps it in `test.fail()`, so the row is terminal as DEFECT in the
 * ledger instead of red noise — and the day the app is fixed, the test reports
 * "expected to fail but passed", which is the signal to close the defect.
 * Weakening the expectation to match the bug would delete the only record of
 * what correct looks like (ground rule 1).
 *
 * The connected wallet is always `user`. Shapes are authored so that `user`
 * occupies the role under test — the owner, the manager, the parent, or nobody
 * at all for a stranger shape — which keeps every test's setup identical.
 */

import type { ShapeId } from '@ens-apps/v1-name-shapes'

/** A fact about the name, read off the chain rather than out of the app. */
export type AddressRef =
  | 'registrant'
  | 'controller'
  | 'wrapperOwner'
  | 'parentHolder'

export type RowExpectation =
  | {
      readonly kind: 'address-row'
      readonly label: string
      readonly shows: AddressRef
    }
  | { readonly kind: 'absent'; readonly label: string }

export type CtaExpectation = {
  /** Accessible name, as `getByRole('link', { name })`. */
  readonly name: string
  readonly state: 'enabled' | 'absent'
}

export type TabExpectation = {
  /** Used verbatim as the generated test's title. */
  readonly title: string
  /** Copy the whole tab must refuse with. */
  readonly refusal?: string
  readonly rows?: readonly RowExpectation[]
  readonly ctas?: readonly CtaExpectation[]
  /** Transfer tab: whether the recipient form is reachable for this shape. */
  readonly form?: 'visible' | 'absent'
  /** Strings that must be visible on the tab. */
  readonly text?: readonly string[]
  /** The tab's own page heading — distinct from the sidebar link of the same name. */
  readonly heading?: string
  /** Strings that must NOT appear — a claim the tab has no business making. */
  readonly notText?: readonly string[]
  /** Fuses tab: which fuses must read burnt, by their displayed name. */
  readonly fuses?: {
    readonly burnt: readonly string[]
    readonly unburnt?: readonly string[]
  }
  /**
   * Records and Address tabs: what the seeded records must render as.
   *
   * Keys only — the values are read off the resolver at run time, so the
   * assertion is "the page agrees with the chain", not "the page agrees with a
   * string I typed next to the fixture that wrote it".
   */
  readonly records?: {
    /** Text keys whose rendered value must equal the chain's. */
    readonly texts?: readonly string[]
    /** The Mainnet address row must equal the chain's `addr(60)`. */
    readonly ethAddress?: 'shown' | 'missing'
  }
  /** Known wrong today. The expectation above stays correct. */
  readonly defect?: { readonly id: string; readonly actual: string }
  /** Not yet decided — the generator emits no test and the row stays open. */
  readonly todo?: string
}

type TabId = string

/**
 * Cells written so far. A missing entry is not a passing cell: the generator
 * emits nothing for it and its ledger row stays `not-started`, which is the
 * honest state for "we have not said what this should do yet".
 */

/**
 * The read-only tabs, which vary by wrap class rather than by who is looking.
 *
 * Written as a builder because nine shapes x eight tabs of near-identical
 * entries is a table, not eight decisions — and a table copied nine times is a
 * table that drifts. What genuinely differs per shape stays explicit at the
 * call site: which token contract holds the name, and which fuse the shape
 * exists to isolate.
 */
const readOnlyTabs = ({
  token,
  fuses,
}: {
  /** The contract the Token tab must name. */
  readonly token: 'BaseRegistrar' | 'NameWrapper'
  /** Fuses tab: the burnt fuse to look for, or the not-wrapped message. */
  readonly fuses: TabExpectation
}): Record<string, TabExpectation> => ({
  fuses,
  token: {
    title: `names the ${token} as the contract holding the token`,
    text: [token],
  },
  records: {
    title: "shows a V1 name's text record with the value the resolver holds",
    heading: 'Records',
    // Only `com.twitter` is asserted, and that is a statement about key
    // *discovery*, not about the resolver. For a V1 name the portal learns
    // which keys exist from the public V1 subgraph (`v1-graphql.ens.dev`),
    // which cannot know about a name seeded on a local fork — so the key set
    // collapses to the six the app hardcodes, and `com.twitter` is the one of
    // those the matrix seeds. The seeded `url` record is deliberately not
    // asserted: its absence here is the fork's, not the app's.
    records: { texts: ['com.twitter'] },
  },
  subnames: {
    title: 'renders the subnames tab for a V1 name',
    heading: 'Subnames',
    text: ['No subnames yet'],
  },
  registry: {
    title: 'renders the registry tab for a V1 name',
    heading: 'Registry',
  },
  history: {
    title: 'renders the history tab for a V1 name',
    heading: 'History',
    text: ['No history yet'],
  },
  address: {
    title: 'resolves a V1 name to the ETH address its resolver holds',
    heading: 'Address Resolution',
    // The seeded address is `user3`, which no shape ever gives a name to — so
    // an assertion that drifted onto an ownership row would fail rather than
    // pass on the holder's address by coincidence.
    records: { ethAddress: 'shown' },
  },
  resolver: {
    title: 'renders the resolver tab, and offers a V1 name no resolver edit',
    // The route refuses V1 outright ("Not Available for V1 Names"), so the tab
    // withholding the control is consistent — it is the silence that is worth
    // pinning, in case a later change starts offering a CTA that dead-ends.
    heading: 'Resolver',
    ctas: [{ name: 'Change resolver', state: 'absent' }],
  },
})

/** The fuses tab for a name that is not wrapped and so has none. */
const NO_FUSES: TabExpectation = {
  title:
    'explains that an unwrapped V1 name has no fuses, and offers migration',
  text: ['This name is not wrapped, so it has no fuses to show.'],
}

/**
 * The fuses tab for a wrapped name.
 *
 * Asserted on the Burnt column, not on the fuse's presence: the table lists all
 * eight fuses whatever their state, so "the name appears" would pass for every
 * shape and distinguish nothing. Names are the displayed ones — the page
 * renders "Cannot Transfer", not CANNOT_TRANSFER.
 */
const burntFuse = (
  fuse: string,
  unburnt: readonly string[] = [],
): TabExpectation => ({
  title: `shows ${fuse} as burnt, and the fuses it does not burn as unburnt`,
  heading: 'Fuses',
  fuses: { burnt: ['Parent Cannot Control', fuse], unburnt },
})

/** The fuses tab for a wrapped name, stating both halves explicitly. */
const fuseState = (
  burnt: readonly string[],
  unburnt: readonly string[],
): TabExpectation => ({
  title:
    burnt.length > 0
      ? `shows ${burnt.join(' and ')} burnt, and the rest unburnt`
      : 'shows a wrapped subname with no fuses burnt',
  heading: 'Fuses',
  fuses: { burnt, unburnt },
})

/**
 * The three V2-only tabs, carried by one witness per depth. They branch on
 * nothing but `protocolVersion`, so asserting them on all 31 shapes would be
 * 31 copies of one fact — but their copy is the only thing standing between a
 * V1 owner and silence, so it is asserted rather than assumed.
 */
const v2OnlyRefusals: Record<string, TabExpectation> = {
  roles: {
    title: 'refuses role management for a V1 name, and says why',
    refusal: 'Roles unavailable',
  },
  'create-subname': {
    title: 'refuses subname creation for a V1 name, and says why',
    refusal: 'This feature is only available for ENSv2 names.',
  },
  'change-resolver': {
    title: 'refuses a resolver change for a V1 name, and says why',
    refusal: 'Not Available for V1 Names',
  },
}

/**
 * The read-only tabs for a **subname**.
 *
 * Same surfaces as a 2LD, but the token tab is where depth bites: a
 * registry-only subname owns no token at all, while a wrapped one is an
 * ERC-1155 in the NameWrapper like any other wrapped name.
 */
const subnameReadOnlyTabs = ({
  token,
  fuses,
}: {
  readonly token: TabExpectation
  readonly fuses: TabExpectation
}): Record<string, TabExpectation> => ({
  fuses,
  token,
  records: {
    title: "shows a V1 subname's text record with the value the resolver holds",
    heading: 'Records',
    records: { texts: ['com.twitter'] },
    defect: {
      id: 'E2E-017',
      actual:
        'says "No records set" — the same record on a V1 2LD renders correctly',
    },
  },
  subnames: {
    title: 'renders the subnames tab for a V1 subname',
    heading: 'Subnames',
  },
  registry: {
    title: 'renders the registry tab for a V1 subname',
    heading: 'Registry',
  },
  history: {
    title: 'renders the history tab for a V1 subname',
    heading: 'History',
  },
  address: {
    title: 'resolves a V1 subname to the ETH address its resolver holds',
    heading: 'Address Resolution',
    records: { ethAddress: 'shown' },
    defect: {
      id: 'E2E-017',
      actual:
        'the Mainnet row is empty for a subname whose resolver has addr(60)',
    },
  },
  resolver: {
    title: 'renders the resolver tab for a V1 subname',
    heading: 'Resolver',
    ctas: [{ name: 'Change resolver', state: 'absent' }],
  },
})

/**
 * The token tab for a registry-only subname, which owns no token at all.
 *
 * The page answers with an ERC-721 on the BaseRegistrar whose id is
 * `labelhash(leaf label)` — an id in the *2LD* namespace. Measured on the fork:
 * `ownerOf` on that id reverts, so the page names a token that does not exist,
 * and it would name somebody else's the moment that 2LD is registered.
 */
const NO_TOKEN: TabExpectation = {
  title: 'does not claim a BaseRegistrar token for a name that has none',
  heading: 'Token Info',
  // The positive anchor matters: `notText` is an absence check, and an absence
  // check on a page that has not finished rendering passes vacuously. One of
  // these cells reported "expected to fail, but passed" exactly once, because
  // the heading was up while the contract row was still loading. Waiting for a
  // row that every token tab renders makes the absence mean something.
  text: ['Token Standard'],
  notText: ['BaseRegistrar'],
  defect: {
    id: 'E2E-016',
    actual:
      'claims ERC-721 on the BaseRegistrar with token id labelhash(leaf label) — a 2LD id that reverts on ownerOf today, and belongs to a different name if that 2LD is ever registered',
  },
}

/** The token tab for a wrapped subname: a real ERC-1155 in the NameWrapper. */
const WRAPPED_TOKEN: TabExpectation = {
  title: 'names the NameWrapper as the contract holding the token',
  heading: 'Token Info',
  text: ['NameWrapper', 'ERC-1155'],
}

/** Ownership rows for a registry-only subname: one address, in both roles. */
const registrySubnameRows: readonly RowExpectation[] = [
  { kind: 'address-row', label: 'Owner', shows: 'controller' },
  { kind: 'address-row', label: 'Manager', shows: 'controller' },
]

export const EXPECTATIONS: Partial<
  Record<ShapeId, Partial<Record<TabId, TabExpectation>>>
> = {
  // ── Unwrapped 2LDs: the registrant/controller split ───────────────────
  //
  // The four shapes below are the same name held four ways, which is what
  // makes them evidence rather than anecdote: where registrant and controller
  // are one wallet the rows are right, and where they diverge the Owner row
  // follows the controller. One variable, one outcome.
  '2ld-unwrapped:owner': {
    ...readOnlyTabs({ token: 'BaseRegistrar', fuses: NO_FUSES }),
    ...v2OnlyRefusals,
    overview: {
      title: 'names the registrant as owner',
      rows: [{ kind: 'address-row', label: 'Owner', shows: 'registrant' }],
    },
    ownership: {
      title: 'names the registrant as owner and the controller as manager',
      rows: [
        { kind: 'address-row', label: 'Owner', shows: 'registrant' },
        { kind: 'address-row', label: 'Manager', shows: 'controller' },
      ],
      ctas: [{ name: 'Transfer', state: 'enabled' }],
    },
    transfer: {
      title: 'offers the form to the wallet that holds both halves',
      form: 'visible',
    },
  },

  '2ld-unwrapped:manager': {
    ...readOnlyTabs({ token: 'BaseRegistrar', fuses: NO_FUSES }),
    overview: {
      title: 'names the registrant as owner, not the wallet that manages it',
      rows: [{ kind: 'address-row', label: 'Owner', shows: 'registrant' }],
      defect: {
        id: 'E2E-011',
        actual:
          'the overview Owner row shows the controller — the same flattening as the Ownership tab, on a second page',
      },
    },
    ownership: {
      title: 'keeps the registrant and the manager apart',
      rows: [
        { kind: 'address-row', label: 'Owner', shows: 'registrant' },
        { kind: 'address-row', label: 'Manager', shows: 'controller' },
      ],
      defect: {
        id: 'E2E-011',
        actual:
          'the Owner row shows the controller, so the same address appears as both Owner and Manager and the real owner is absent',
      },
    },
    transfer: {
      title: 'refuses a wallet that manages the name but does not hold it',
      refusal: 'You manage this name but don\u2019t own it',
      form: 'absent',
    },
  },

  '2ld-unwrapped:registrant': {
    ...readOnlyTabs({ token: 'BaseRegistrar', fuses: NO_FUSES }),
    overview: {
      title: 'names the registrant as owner, not the wallet that manages it',
      rows: [{ kind: 'address-row', label: 'Owner', shows: 'registrant' }],
      defect: {
        id: 'E2E-011',
        actual:
          'the overview Owner row shows the controller, so the wallet that actually holds the name is absent from its own page',
      },
    },
    ownership: {
      title: 'names the holder of the ERC-721 as owner',
      rows: [
        { kind: 'address-row', label: 'Owner', shows: 'registrant' },
        { kind: 'address-row', label: 'Manager', shows: 'controller' },
      ],
      defect: {
        id: 'E2E-011',
        actual:
          'both rows show the controller; the registrant — the only account the registrar will let transfer the name — appears nowhere',
      },
    },
    transfer: {
      title: 'offers the form to the registrant, who alone can move the token',
      form: 'visible',
    },
  },

  '2ld-unwrapped:stranger': {
    ...readOnlyTabs({ token: 'BaseRegistrar', fuses: NO_FUSES }),
    overview: {
      title: 'names the holder even when the viewer is nobody',
      rows: [{ kind: 'address-row', label: 'Owner', shows: 'registrant' }],
    },
    ownership: {
      title: 'names the holder, and offers a stranger no transfer',
      rows: [
        { kind: 'address-row', label: 'Owner', shows: 'registrant' },
        { kind: 'address-row', label: 'Manager', shows: 'controller' },
      ],
      ctas: [{ name: 'Transfer', state: 'absent' }],
    },
    transfer: {
      title: 'refuses a wallet with no claim on the name',
      refusal: 'Not authorized',
      form: 'absent',
    },
  },

  // ── Wrapped 2LDs: one holder, read from the NameWrapper ───────────────
  '2ld-emancipated:owner': {
    ...readOnlyTabs({
      token: 'NameWrapper',
      fuses: burntFuse('Is Dot ETH', ['Cannot Unwrap', 'Cannot Transfer']),
    }),
    overview: {
      title: 'names the wrapper owner',
      rows: [{ kind: 'address-row', label: 'Owner', shows: 'wrapperOwner' }],
    },
    ownership: {
      title: 'names the wrapper owner, and offers the transfer',
      rows: [{ kind: 'address-row', label: 'Owner', shows: 'wrapperOwner' }],
      ctas: [{ name: 'Transfer', state: 'enabled' }],
    },
    transfer: {
      title: 'offers the form for a wrapped name with no blocking fuse',
      form: 'visible',
    },
  },

  '2ld-emancipated:stranger': {
    ...readOnlyTabs({
      token: 'NameWrapper',
      fuses: burntFuse('Is Dot ETH', ['Cannot Unwrap', 'Cannot Transfer']),
    }),
    overview: {
      title: 'names the wrapper owner to a viewer who holds nothing',
      rows: [{ kind: 'address-row', label: 'Owner', shows: 'wrapperOwner' }],
    },
    ownership: {
      title: 'offers a stranger no transfer of a wrapped name',
      rows: [{ kind: 'address-row', label: 'Owner', shows: 'wrapperOwner' }],
      ctas: [{ name: 'Transfer', state: 'absent' }],
    },
    transfer: {
      title: 'refuses a stranger to a wrapped name',
      refusal: 'Not authorized',
      form: 'absent',
    },
  },

  '2ld-locked:owner': {
    ...readOnlyTabs({
      token: 'NameWrapper',
      fuses: burntFuse('Cannot Unwrap', [
        'Cannot Transfer',
        'Cannot Set Resolver',
      ]),
    }),
    overview: {
      title: 'names the wrapper owner of a locked name',
      rows: [{ kind: 'address-row', label: 'Owner', shows: 'wrapperOwner' }],
    },
    // The single witness for E2E-015. The other wrapped shapes assert their
    // Owner row in a test that PASSES, which is what keeps that assertion
    // meaningful — inside a `test.fail()` cell a correct Owner row would be
    // indistinguishable from a wrong one.
    ownership: {
      title: 'does not present the NameWrapper contract as the manager',
      rows: [
        { kind: 'address-row', label: 'Owner', shows: 'wrapperOwner' },
        { kind: 'absent', label: 'Manager' },
      ],
      defect: {
        id: 'E2E-015',
        actual:
          'the Manager row renders the NameWrapper contract address, which is nobody\u2019s account; ens-app-v3 shows no manager row at all for a wrapped name',
      },
    },
    transfer: {
      title: 'offers the form for a locked name that may still move',
      form: 'visible',
    },
  },

  '2ld-locked-no-transfer:owner': {
    ...readOnlyTabs({
      token: 'NameWrapper',
      fuses: burntFuse('Cannot Transfer', ['Cannot Set Resolver']),
    }),
    ownership: {
      title: 'names the wrapper owner of a name that can never move',
      rows: [{ kind: 'address-row', label: 'Owner', shows: 'wrapperOwner' }],
      ctas: [{ name: 'Transfer', state: 'absent' }],
    },
    transfer: {
      title: 'refuses permanently once CANNOT_TRANSFER is burned',
      refusal: 'Transfer permanently disabled',
      form: 'absent',
    },
  },

  '2ld-locked-no-resolver:owner': {
    ...readOnlyTabs({
      token: 'NameWrapper',
      fuses: burntFuse('Cannot Set Resolver', ['Cannot Transfer']),
    }),
    ownership: {
      title: 'still offers the transfer when only the resolver fuse is burned',
      rows: [{ kind: 'address-row', label: 'Owner', shows: 'wrapperOwner' }],
      ctas: [{ name: 'Transfer', state: 'enabled' }],
    },
    transfer: {
      title: 'CANNOT_SET_RESOLVER does not block the move itself',
      form: 'visible',
    },
  },

  // ── Three-level ───────────────────────────────────────────────────────
  '3ld-registry+unwrapped-2ld:owner': {
    ...subnameReadOnlyTabs({ token: NO_TOKEN, fuses: NO_FUSES }),
    overview: {
      title: 'names the registry owner of a subname that has no token',
      rows: [{ kind: 'address-row', label: 'Owner', shows: 'controller' }],
    },
    ownership: {
      title: 'names the registry owner, and offers the transfer it can perform',
      rows: [{ kind: 'address-row', label: 'Owner', shows: 'controller' }],
      ctas: [{ name: 'Transfer', state: 'enabled' }],
    },
    transfer: {
      title: 'offers the form to a registry subname\u2019s holder',
      form: 'visible',
    },
  },

  '3ld-registry+unwrapped-2ld:parent': {
    ...subnameReadOnlyTabs({ token: NO_TOKEN, fuses: NO_FUSES }),
    overview: {
      title: 'names the subname holder, not the wallet that holds its parent',
      rows: [{ kind: 'address-row', label: 'Owner', shows: 'controller' }],
    },
    ownership: {
      title:
        'names the holder, and offers the parent the reassign it can perform',
      rows: registrySubnameRows,
      ctas: [{ name: 'Transfer', state: 'enabled' }],
    },
    transfer: {
      title: 'offers the parent the reassign path #1144 added',
      form: 'visible',
    },
  },

  '3ld-registry+unwrapped-2ld:stranger': {
    ...subnameReadOnlyTabs({ token: NO_TOKEN, fuses: NO_FUSES }),
    ownership: {
      title: 'offers a stranger no transfer of a subname',
      rows: registrySubnameRows,
      ctas: [{ name: 'Transfer', state: 'absent' }],
    },
    transfer: {
      title: 'refuses a wallet holding neither the subname nor its parent',
      refusal: 'Not authorized',
      form: 'absent',
    },
  },

  '3ld-wrapped+emancipated-2ld:owner': {
    ...subnameReadOnlyTabs({
      token: WRAPPED_TOKEN,
      fuses: fuseState([], ['Parent Cannot Control', 'Cannot Unwrap']),
    }),
    overview: {
      title: 'names the wrapper owner of a wrapped subname',
      rows: [{ kind: 'address-row', label: 'Owner', shows: 'wrapperOwner' }],
    },
    ownership: {
      title: 'names the wrapper owner, and offers the holder the transfer',
      rows: [{ kind: 'address-row', label: 'Owner', shows: 'wrapperOwner' }],
      ctas: [{ name: 'Transfer', state: 'enabled' }],
    },
    transfer: {
      title: 'offers the holder of a wrapped subname the form',
      form: 'visible',
    },
  },

  '3ld-wrapped+emancipated-2ld:parent': {
    ...subnameReadOnlyTabs({
      token: WRAPPED_TOKEN,
      fuses: fuseState([], ['Parent Cannot Control', 'Cannot Unwrap']),
    }),
    // The subname witness for E2E-015. A wrapped name's registry slot is the
    // NameWrapper by construction, so rendering it as "Manager" presents a
    // contract as an account at every depth, not only on a 2LD.
    ownership: {
      title: 'does not present the NameWrapper contract as the manager',
      rows: [
        { kind: 'address-row', label: 'Owner', shows: 'wrapperOwner' },
        { kind: 'absent', label: 'Manager' },
      ],
      defect: {
        id: 'E2E-015',
        actual:
          'the Manager row renders the NameWrapper contract address for a wrapped subname, as it does for a wrapped 2LD',
      },
    },
    transfer: {
      title: 'lets the parent reassign a wrapped subname it does not hold',
      form: 'visible',
    },
  },

  '3ld-emancipated+locked-2ld:owner': {
    ...subnameReadOnlyTabs({
      token: WRAPPED_TOKEN,
      fuses: fuseState(['Parent Cannot Control'], ['Cannot Unwrap']),
    }),
    ownership: {
      title: 'names the holder of an emancipated subname',
      rows: [{ kind: 'address-row', label: 'Owner', shows: 'wrapperOwner' }],
      ctas: [{ name: 'Transfer', state: 'enabled' }],
    },
    transfer: {
      title: 'offers the holder of an emancipated subname the form',
      form: 'visible',
    },
  },

  '3ld-emancipated+locked-2ld:parent': {
    ...subnameReadOnlyTabs({
      token: WRAPPED_TOKEN,
      fuses: fuseState(['Parent Cannot Control'], ['Cannot Unwrap']),
    }),
    ownership: {
      title: 'offers the parent no transfer of an emancipated subname',
      rows: [{ kind: 'address-row', label: 'Owner', shows: 'wrapperOwner' }],
      ctas: [{ name: 'Transfer', state: 'absent' }],
    },
    transfer: {
      title:
        'refuses the parent once the subname has burned PARENT_CANNOT_CONTROL',
      refusal: 'This subname is out of the parent\u2019s control',
      form: 'absent',
    },
  },

  '3ld-locked+locked-2ld:owner': {
    ...subnameReadOnlyTabs({
      token: WRAPPED_TOKEN,
      fuses: fuseState(['Parent Cannot Control', 'Cannot Unwrap'], []),
    }),
    ownership: {
      title: 'names the holder of a locked subname',
      rows: [{ kind: 'address-row', label: 'Owner', shows: 'wrapperOwner' }],
      ctas: [{ name: 'Transfer', state: 'enabled' }],
    },
    transfer: {
      title: 'offers the holder of a locked subname the form',
      form: 'visible',
    },
  },

  '3ld-registry+unwrapped-2ld:parent-registrant-only': {
    ...subnameReadOnlyTabs({ token: NO_TOKEN, fuses: NO_FUSES }),
    ownership: {
      title:
        'offers no transfer to a parent registrant who cannot write the registry',
      rows: registrySubnameRows,
      ctas: [{ name: 'Transfer', state: 'absent' }],
    },
    transfer: {
      title: 'tells the parent registrant to reclaim the manager role first',
      refusal: 'Reclaim the parent first',
      form: 'absent',
    },
  },

  // ── The wrapper line ──────────────────────────────────────────────────
  // Crossing it in either direction is refused, because reassigning across it
  // would force-wrap or force-unwrap the child. Both directions are asserted:
  // ens-app-v3 refuses both, and neither has ever been exercised here.
  '3ld-registry+emancipated-2ld:parent': {
    ...subnameReadOnlyTabs({ token: NO_TOKEN, fuses: NO_FUSES }),
    ownership: {
      title: 'offers no transfer across the wrapper line',
      rows: registrySubnameRows,
      ctas: [{ name: 'Transfer', state: 'absent' }],
    },
    transfer: {
      title: 'refuses a wrapped parent over an unwrapped subname',
      refusal: 'Can\u2019t reassign this subname from here',
      form: 'absent',
    },
  },

  '3ld-wrapped+unwrapped-2ld:owner': {
    ...subnameReadOnlyTabs({
      token: WRAPPED_TOKEN,
      fuses: fuseState([], ['Parent Cannot Control', 'Cannot Unwrap']),
    }),
    ownership: {
      title: 'names the holder of a wrapped subname under an unwrapped parent',
      rows: [{ kind: 'address-row', label: 'Owner', shows: 'wrapperOwner' }],
      ctas: [{ name: 'Transfer', state: 'enabled' }],
    },
    transfer: {
      title: 'lets the holder move it, whatever the parent is wrapped in',
      form: 'visible',
    },
  },

  '3ld-wrapped+unwrapped-2ld:parent': {
    ...subnameReadOnlyTabs({
      token: WRAPPED_TOKEN,
      fuses: fuseState([], ['Parent Cannot Control', 'Cannot Unwrap']),
    }),
    ownership: {
      title:
        'offers no transfer across the wrapper line, in the other direction',
      rows: [{ kind: 'address-row', label: 'Owner', shows: 'wrapperOwner' }],
      ctas: [{ name: 'Transfer', state: 'absent' }],
    },
    transfer: {
      title: 'refuses an unwrapped parent over a wrapped subname',
      refusal: 'Can\u2019t reassign this subname from here',
      form: 'absent',
    },
  },

  // ── Four levels ───────────────────────────────────────────────────────
  // Depth is not a free axis — every subname is one class to the app — so these
  // exist to probe the three places depth actually bites: the single level of
  // parent `getV1NameState` reads, the ancestor jump that skips levels, and the
  // expiry read that only ever looks at the .eth 2LD.
  '4ld-locked+locked-3ld+locked-2ld:owner': {
    ...subnameReadOnlyTabs({
      token: WRAPPED_TOKEN,
      fuses: fuseState(['Parent Cannot Control', 'Cannot Unwrap'], []),
    }),
    ownership: {
      title: 'names the holder of a locked name three levels down',
      rows: [{ kind: 'address-row', label: 'Owner', shows: 'wrapperOwner' }],
      ctas: [{ name: 'Transfer', state: 'enabled' }],
    },
    transfer: {
      title: 'offers the holder the form at depth four',
      form: 'visible',
    },
  },

  '4ld-locked+locked-3ld:parent': {
    ...subnameReadOnlyTabs({
      token: WRAPPED_TOKEN,
      fuses: fuseState(['Parent Cannot Control', 'Cannot Unwrap'], []),
    }),
    ownership: {
      title:
        'offers the parent no transfer of an emancipated name at depth four',
      rows: [{ kind: 'address-row', label: 'Owner', shows: 'wrapperOwner' }],
      ctas: [{ name: 'Transfer', state: 'absent' }],
    },
    // The parent here is itself a subname, so `deriveParent` takes its
    // non-registrar arm — the arm E2E-014 shows is the fragile one.
    transfer: {
      title: 'refuses a parent that is itself a subname, on the same grounds',
      refusal: 'This subname is out of the parent\u2019s control',
      form: 'absent',
    },
  },

  '4ld-registry+registry-3ld+unwrapped-2ld:owner': {
    ...subnameReadOnlyTabs({ token: NO_TOKEN, fuses: NO_FUSES }),
    ownership: {
      title: 'names the registry owner two levels below the 2LD',
      rows: registrySubnameRows,
      ctas: [{ name: 'Transfer', state: 'enabled' }],
    },
    transfer: {
      title: 'offers the holder the form two levels below the 2LD',
      form: 'visible',
    },
  },

  '4ld-registry+registry-3ld:parent': {
    ...subnameReadOnlyTabs({ token: NO_TOKEN, fuses: NO_FUSES }),
    ownership: {
      title: 'offers the reassign to a parent two levels below the 2LD',
      rows: registrySubnameRows,
      ctas: [{ name: 'Transfer', state: 'enabled' }],
    },
    // `getV1NameState` reads exactly one level of parent and jumps to the .eth
    // 2LD for expiry, skipping this shape's middle level entirely. If that
    // shortcut were wrong anywhere, it would be here.
    transfer: {
      title: 'lets a parent reassign a subname two levels below the 2LD',
      form: 'visible',
    },
  },

  '4ld-registry+wrapped-3ld:parent': {
    ...subnameReadOnlyTabs({ token: NO_TOKEN, fuses: NO_FUSES }),
    ownership: {
      title: 'offers no transfer across the wrapper line at depth four',
      rows: registrySubnameRows,
      ctas: [{ name: 'Transfer', state: 'absent' }],
    },
    // The same refusal as the 3LD mismatch, but with no 2LD on either side of
    // the line — which is the only thing this shape adds, and the reason it is
    // the one four-level shape worth new fixture work.
    transfer: {
      title: 'refuses the mismatch when neither level is a 2LD',
      refusal: 'Can\u2019t reassign this subname from here',
      form: 'absent',
    },
  },

  // ── The clock ─────────────────────────────────────────────────────────
  // These move the fork clock forward permanently, so they live in their own
  // spec file and project, and sort last. Only the ownership-shaped tabs are
  // asserted: the read-only tabs are the same code as the active shapes, and
  // re-probing them is not worth another 29 days of shared clock.
  '2ld-unwrapped:grace:owner': {
    overview: {
      title: 'relabels the holder as the previous owner once a name lapses',
      // In grace the registrar's `ownerOf` reverts, so there is no registrant
      // left to read — the controller is all that remains, and the app says so
      // by renaming the row rather than showing a stale "Owner".
      rows: [
        { kind: 'address-row', label: 'Previous owner', shows: 'controller' },
      ],
    },
    ownership: {
      title: 'offers no transfer of a name in its grace period',
      rows: [
        { kind: 'address-row', label: 'Previous owner', shows: 'controller' },
      ],
      ctas: [{ name: 'Transfer', state: 'absent' }],
    },
    transfer: {
      title: 'refuses while the registration is lapsed but recoverable',
      refusal: 'This name is in its grace period',
      form: 'absent',
    },
  },

  '2ld-unwrapped:expired:owner': {
    overview: {
      title: 'says the name is available once grace has passed',
      text: ['is available'],
    },
    ownership: {
      title: 'treats a fully expired name as unregistered',
      refusal: 'Name not registered',
    },
    transfer: {
      title: 'refuses a name anyone can now register',
      refusal: 'This name has expired',
      form: 'absent',
    },
  },

  '3ld-wrapped+emancipated-2ld:grace:parent': {
    ownership: {
      title: 'names the subname holder while the 2LD above is in grace',
      rows: [{ kind: 'address-row', label: 'Owner', shows: 'wrapperOwner' }],
      ctas: [{ name: 'Transfer', state: 'absent' }],
    },
    transfer: {
      title:
        'tells the 2LD owner why the wrapper refuses, and offers a renewal',
      // Substring: the card names the 2LD, whose label is generated per run.
      refusal: 'is in its grace period',
      form: 'absent',
    },
  },

  '3ld-wrapped+emancipated-2ld:expired:parent': {
    transfer: {
      title: 'refuses once the 2LD above has lapsed past grace',
      refusal: 'has expired',
      form: 'absent',
    },
  },

  '4ld-wrapped+wrapped-3ld+emancipated-2ld:grace:owner': {
    ownership: {
      title: 'still names the holder three levels under a lapsing 2LD',
      rows: [{ kind: 'address-row', label: 'Owner', shows: 'wrapperOwner' }],
      ctas: [{ name: 'Transfer', state: 'enabled' }],
    },
    // The holder's own move is not blocked by an ancestor in grace — the
    // child's wrapper expiry is the 2LD's plus the grace window, so it is still
    // live. Only the parent's reassign is refused, which is the distinction
    // E2E-014 is about.
    transfer: {
      title: 'lets the holder move it while the .eth ancestor is in grace',
      form: 'visible',
    },
  },
}

export const expectationFor = (
  shapeId: ShapeId,
  tabId: TabId,
): TabExpectation | undefined => EXPECTATIONS[shapeId]?.[tabId]
