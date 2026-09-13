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
