/**
 * The dev migration tool had no tests at all, which is how `PRESET_SHAPES` was
 * able to drift from what `createV1NameOnAnvil` actually wrote — the `records`
 * preset was created unwrapped but described as wrapped, so `classifyNames`
 * read it as a locked 2LD holding an ERC-1155 that did not exist and the name
 * silently vanished from the migration list.
 *
 * `walkPreset` is now the single source both the chain writes and the subgraph
 * mock derive from, so these tests are the mechanical form of that guarantee.
 */
import { namehash } from 'viem'
import { describe, expect, it } from 'vitest'

import {
  buildMockDomains,
  fullNamesFor,
  nodeForPath,
  PRESET_FAMILY,
  PRESET_SHAPES,
  PRESETS,
  type PresetType,
  TYPE_BADGE_COLORS,
  walkPreset,
} from './MigrationTestPanel.helpers'

const ALL_TYPES: PresetType[] = Object.keys(PRESET_SHAPES) as PresetType[]
const ROOT = 'dev0001'

const activeName = (type: PresetType) => ({
  label: ROOT,
  type,
  id: '1',
  expiryDate: Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
})

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
    const injected = buildMockDomains(activeName('copy-orphan')) as {
      name: string
    }[]
    expect(injected.map((d) => d.name)).toEqual([`sub-${ROOT}.${ROOT}.eth`])
  })
})

describe('buildMockDomains', () => {
  it.each(
    ALL_TYPES,
  )("%s: every injected domain's parent is either 'eth' or another injected domain", (type: PresetType) => {
    const domains = buildMockDomains(activeName(type)) as {
      name: string
      parent: { name: string }
    }[]
    const names = new Set(domains.map((d) => d.name))
    for (const domain of domains) {
      if (domain.parent.name === 'eth') continue
      // A domain whose parent is absent is exactly the orphan fixture, and
      // only `copy-orphan` is allowed to be one.
      expect(
        names.has(domain.parent.name),
        `${domain.name} names parent ${domain.parent.name}, which is not injected`,
      ).toBe(type !== 'copy-orphan')
    }
  })

  it.each(
    ALL_TYPES,
  )('%s: only 2LDs carry a registration', (type: PresetType) => {
    const domains = buildMockDomains(activeName(type)) as {
      name: string
      registration: unknown
      registrant: unknown
    }[]
    for (const domain of domains) {
      const is2LD = domain.name.split('.').length === 2
      // `registration`/`registrant` are 2LD-only. On a child they make
      // `hasExpiredDotEthRegistration` treat it as a .eth registration.
      expect(Boolean(domain.registration), domain.name).toBe(is2LD)
      expect(Boolean(domain.registrant), domain.name).toBe(is2LD)
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
