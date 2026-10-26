/**
 * The dev migration tool had no tests at all, which is how `PRESET_SHAPES` was
 * able to drift from what `createV1NameOnAnvil` actually wrote — the `records`
 * preset was created unwrapped but described as wrapped, so `classifyNames`
 * read it as a locked 2LD holding an ERC-1155 that did not exist and the name
 * silently vanished from the migration list.
 *
 * `walkPreset` is now the single source both the chain writes and the bigname
 * mock derive from, so these tests are the mechanical form of that guarantee.
 */
import { namehash } from 'viem'
import { describe, expect, it } from 'vitest'

import { listedRows } from './bignameMock'
import {
  fullNamesFor,
  nodeForPath,
  ownershipTargetFor,
  PRESET_FAMILY,
  PRESET_SHAPES,
  PRESETS,
  type PresetType,
  TYPE_BADGE_COLORS,
  V1_DISTINCT_MANAGER,
  walkPreset,
} from './MigrationTestPanel.helpers'

const ALL_TYPES: PresetType[] = Object.keys(PRESET_SHAPES) as PresetType[]
const ROOT = 'dev0001'

const NOW = Math.floor(Date.now() / 1000)

const activeName = (type: PresetType) => ({
  label: ROOT,
  type,
  id: '1',
  expiryDate: NOW + 365 * 24 * 3600,
})

/** The names the account's bigname name list gains for one preset. */
const listedNames = (type: PresetType) =>
  listedRows([activeName(type)], NOW).map((row) => row.name)

const parentOf = (name: string) => name.slice(name.indexOf('.') + 1)

describe('nodeForPath', () => {
  it('matches viem namehash for 2LDs, 3LDs and 4LDs', () => {
    expect(nodeForPath(['alice'])).toBe(namehash('alice.eth'))
    expect(nodeForPath(['sub', 'alice'])).toBe(namehash('sub.alice.eth'))
    expect(nodeForPath(['deep', 'sub', 'alice'])).toBe(
      namehash('deep.sub.alice.eth'),
    )
  })
})

describe('walkPreset', () => {
  it.each(
    ALL_TYPES,
  )('%s: the root is the 2LD and comes first', (type: PresetType) => {
    const [root, ...rest] = walkPreset(ROOT, type)
    expect(root.fullName).toBe(`${ROOT}.eth`)
    expect(root.depth).toBe(0)
    expect(root.node).toBe(namehash(`${ROOT}.eth`))
    // Parent-first: descendants can only be created once their parent exists,
    // and `hasCompleteCopyRoute` walks up, so a missing link is always earlier.
    for (const node of rest) expect(node.depth).toBeGreaterThan(0)
  })

  it.each(
    ALL_TYPES,
  )('%s: every node namehashes to its own full name', (type: PresetType) => {
    for (const node of walkPreset(ROOT, type)) {
      expect(node.node).toBe(namehash(node.fullName))
      expect(node.parentNode).toBe(
        node.depth === 0 ? namehash('eth') : namehash(node.parentFullName),
      )
      // A label is one label. A dotted one is now ineligible `invalid-label`.
      expect(node.label).not.toContain('.')
      expect(node.fullName).toBe(`${node.label}.${node.parentFullName}`)
    }
  })

  it.each(
    ALL_TYPES,
  )("%s: each node's parent state matches the node that IS its parent", (type: PresetType) => {
    const nodes = walkPreset(ROOT, type)
    const byName = new Map(nodes.map((n) => [n.fullName, n]))
    for (const node of nodes) {
      if (node.depth === 0) continue
      const parent = byName.get(node.parentFullName)
      expect(parent, `${node.fullName} has no parent in the walk`).toBeDefined()
      // This is the drift guard: the classifier reads
      // `parent.wrappedDomain.fuses` to split `detached-child` from
      // `unlocked-child`, so a node's idea of its parent must be the parent.
      expect(node.parentWrapped).toBe(parent?.wrapped)
      expect(node.parentFuses).toBe(parent?.fuses)
    }
  })

  it('reaches depth 2 for the nested copy preset', () => {
    const nodes = walkPreset(ROOT, 'copy-nested')
    expect(nodes.map((n) => n.fullName)).toEqual([
      `${ROOT}.eth`,
      `sub-${ROOT}.${ROOT}.eth`,
      `deep-${ROOT}.sub-${ROOT}.${ROOT}.eth`,
    ])
    expect(nodes.map((n) => n.depth)).toEqual([0, 1, 2])
  })

  it('preserves the pre-existing depth-1 presets exactly', () => {
    for (const type of [
      'subname',
      'detached-child',
      'wrapped-subname',
    ] as const) {
      expect(fullNamesFor({ label: ROOT, type })).toEqual([
        `${ROOT}.eth`,
        `sub-${ROOT}.${ROOT}.eth`,
      ])
    }
  })

  it('withholds an un-offered parent from the mock but still walks it', () => {
    const nodes = walkPreset(ROOT, 'copy-orphan')
    expect(nodes[0].offer).toBe(false)
    // The 2LD is created on chain (it is in the walk) but never injected, so
    // the child has no migrating ancestor -> ineligible `missing-parent`.
    expect(listedNames('copy-orphan')).toEqual([`sub-${ROOT}.${ROOT}.eth`])
  })
})

describe('listedRows', () => {
  it.each(
    ALL_TYPES,
  )("%s: every listed name's parent is either 'eth' or another listed name", (type: PresetType) => {
    const names = new Set(listedNames(type))
    for (const name of names) {
      const parent = parentOf(name)
      if (parent === 'eth') continue
      // A name whose parent is absent is exactly the orphan fixture, and
      // only `copy-orphan` is allowed to be one.
      expect(
        names.has(parent),
        `${name} names parent ${parent}, which is not listed`,
      ).toBe(type !== 'copy-orphan')
    }
  })

  it.each(
    ALL_TYPES,
  )('%s: only 2LDs carry a registration', (type: PresetType) => {
    for (const row of listedRows([activeName(type)], NOW)) {
      const is2LD = parentOf(row.name) === 'eth'
      // A registrant or lease on a child makes the classifier treat it as a
      // .eth registration.
      expect(Boolean(row.registrant), row.name).toBe(is2LD)
      expect(Boolean(row.ens_v1?.expires_at), row.name).toBe(is2LD)
    }
  })
})

describe('preset tables', () => {
  it('every preset type has a button, a colour and a family', () => {
    const buttonTypes = new Set(PRESETS.map((p) => p.type))
    for (const type of ALL_TYPES) {
      expect(buttonTypes.has(type), `${type} has no button`).toBe(true)
      expect(TYPE_BADGE_COLORS[type], `${type} has no colour`).toBeTruthy()
      expect(PRESET_FAMILY[type], `${type} has no family`).toBeTruthy()
    }
  })

  it('the two copy presets are no longer described as rejections', () => {
    // They were titled "must be rejected as ineligible 'unlocked-subname'" and
    // "vanishes with no ineligible reason at all". Both are eligible copies now.
    for (const type of ['wrapped-subname', 'unwrapped-subname'] as const) {
      const preset = PRESETS.find((p) => p.type === type)
      expect(preset?.title).toContain('copy')
      expect(PRESET_FAMILY[type]).toBe('copy')
    }
  })
})

describe('reassign presets (#1144)', () => {
  const REASSIGN = [
    'reassign-wrapped',
    'reassign-registry',
    'reassign-emancipated',
    'reassign-mismatch',
    'reassign-registrant-only',
    'reassign-grace',
  ] as const

  it.each(REASSIGN)('%s opens the subname, not the 2LD', (type) => {
    expect(PRESET_FAMILY[type]).toBe('transfer')
    expect(ownershipTargetFor(activeName(type))).toBe(
      walkPreset(ROOT, type)[1]?.fullName,
    )
  })

  // Not yours to migrate: an injected child would appear in the migration
  // list as if the connected wallet held it.
  it.each(
    REASSIGN,
  )('%s keeps its subnames out of the migration mock', (type) => {
    expect(listedNames(type)).toEqual([`${ROOT}.eth`])
  })

  it('issues the reassignable child to another account', () => {
    for (const type of [
      'reassign-wrapped',
      'reassign-registry',
      'reassign-emancipated',
      'reassign-registrant-only',
    ] as const) {
      expect(walkPreset(ROOT, type)[1]?.holder, type).toBe(V1_DISTINCT_MANAGER)
    }
  })

  it('still opens the 2LD for a transfer preset with no subname', () => {
    expect(ownershipTargetFor(activeName('manager-only'))).toBe(`${ROOT}.eth`)
  })

  // The child's label is generated, so landing on the parent leaves no way to
  // reach it but guessing how the label is composed. Found in manual QA on
  // "Subname+Rec": Open went to the 2LD and the subname looked unregistered.
  it.each([
    'subname',
    'subname-records',
    'detached-child',
  ] as const)('%s opens the subname even though it is not a transfer preset', (type) => {
    expect(PRESET_FAMILY[type]).not.toBe('transfer')
    const child = walkPreset(ROOT, type)[1]?.fullName
    expect(child).toBeTruthy()
    expect(ownershipTargetFor(activeName(type))).toBe(child)
  })
})
