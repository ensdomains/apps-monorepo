import type { Tab } from './types'

/**
 * Every portal route that renders something about a name, with the scenario-id
 * prefix it owns.
 *
 * The prefix carries the tier (`e2e/coverage/scenarios.ts`'s `AREA_TIER`), so
 * it is chosen by consequence, not by spelling: `VT`/`VF` are R0 because a
 * transfer and a fuse burn are irreversible, the authorization surfaces are R2,
 * and the read-only display surfaces are R3. A wrong Owner row is R2 rather
 * than R3 because it is the row people act on.
 */
export const TABS: readonly Tab[] = [
  {
    id: 'overview',
    prefix: 'VV',
    path: (name) => `/${name}`,
    title: 'Overview — owner, expiry, parent, resolver and registry rows',
  },
  {
    id: 'ownership',
    prefix: 'VO',
    path: (name) => `/${name}/ownership`,
    title: 'Ownership — owner and manager rows, and the Transfer affordance',
  },
  {
    id: 'transfer',
    prefix: 'VT',
    path: (name) => `/${name}/ownership/transfer`,
    title: 'Transfer — which gate the route reaches, and what it offers',
  },
  {
    id: 'fuses',
    prefix: 'VF',
    path: (name) => `/${name}/fuses`,
    title: 'Fuses — the V1-only surface: burnt fuses and the burn affordance',
  },
  {
    id: 'roles',
    prefix: 'VL',
    path: (name) => `/${name}/roles`,
    title: 'Roles — V2-only; a V1 name must be refused, not shown empty',
    v2Only: true,
  },
  {
    id: 'resolver',
    prefix: 'VE',
    path: (name) => `/${name}/resolver`,
    title: 'Resolver — the address, and whether the edit CTAs are offered',
  },
  {
    id: 'records',
    prefix: 'VD',
    path: (name) => `/${name}/records`,
    title: 'Records — text and address records, and whether editing is offered',
  },
  {
    id: 'subnames',
    prefix: 'VS',
    path: (name) => `/${name}/subnames`,
    title: 'Subnames — the children listed, and the holder shown for each',
  },
  {
    id: 'registry',
    prefix: 'VR',
    path: (name) => `/${name}/registry`,
    title: 'Registry — which registry holds the name, and the migrate prompt',
  },
  {
    id: 'token',
    prefix: 'VK',
    path: (name) => `/${name}/token`,
    title: 'Token — ERC-721 vs ERC-1155, and which token id is claimed',
  },
  {
    id: 'history',
    prefix: 'VH',
    path: (name) => `/${name}/history`,
    title: 'History — V1 events, adapted into the shared timeline',
  },
  {
    id: 'address',
    prefix: 'VA',
    path: (name) => `/${name}/address`,
    title: 'Address resolution — what the name resolves to',
  },
  {
    id: 'create-subname',
    prefix: 'VC',
    path: (name) => `/${name}/create-subname`,
    title: 'Create subname — V2-only; the refusal E2E-013 sends users to',
    v2Only: true,
  },
  {
    id: 'change-resolver',
    prefix: 'VG',
    path: (name) => `/${name}/change-resolver`,
    title: 'Change resolver — V2-only; must refuse explicitly, not silently',
    v2Only: true,
  },
]

export const tabById = (id: string): Tab => {
  const tab = TABS.find((t) => t.id === id)
  if (!tab) throw new Error(`unknown tab "${id}"`)
  return tab
}
