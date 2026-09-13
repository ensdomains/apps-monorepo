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
  },

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
  },
}

export const expectationFor = (
  shapeId: ShapeId,
  tabId: TabId,
): TabExpectation | undefined => EXPECTATIONS[shapeId]?.[tabId]
