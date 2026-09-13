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
  /** Fuses tab: which fuses must read burnt, by their displayed name. */
  readonly fuses?: {
    readonly burnt: readonly string[]
    readonly unburnt?: readonly string[]
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
    title: 'renders the records tab for a V1 name',
    heading: 'Records',
    text: ['No records set'],
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
    title: 'renders address resolution for a V1 name',
    heading: 'Address Resolution',
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
  title: 'explains that an unwrapped V1 name has no fuses, and offers migration',
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
    ...readOnlyTabs({ token: 'NameWrapper', fuses: burntFuse('Is Dot ETH', ['Cannot Unwrap', 'Cannot Transfer']) }),
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
    ...readOnlyTabs({ token: 'NameWrapper', fuses: burntFuse('Is Dot ETH', ['Cannot Unwrap', 'Cannot Transfer']) }),
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
    ...readOnlyTabs({ token: 'NameWrapper', fuses: burntFuse('Cannot Unwrap', ['Cannot Transfer', 'Cannot Set Resolver']) }),
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
    ...readOnlyTabs({ token: 'NameWrapper', fuses: burntFuse('Cannot Transfer', ['Cannot Set Resolver']) }),
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
    ...readOnlyTabs({ token: 'NameWrapper', fuses: burntFuse('Cannot Set Resolver', ['Cannot Transfer']) }),
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
}

export const expectationFor = (
  shapeId: ShapeId,
  tabId: TabId,
): TabExpectation | undefined => EXPECTATIONS[shapeId]?.[tabId]
