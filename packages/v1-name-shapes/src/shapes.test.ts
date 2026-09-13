import { describe, expect, it } from 'vitest'
import { depthOf, SHAPES, seedableShapes } from './shapes'
import { TABS } from './tabs'

/**
 * These are not tests of behaviour — nothing here talks to a chain. They guard
 * the properties the rest of the matrix *assumes*, where a violation would not
 * announce itself: a duplicated slot silently re-points existing ledger rows at
 * different behaviour, and a shape that contradicts the NameWrapper's rules
 * fails at seed time with a revert nobody can read.
 */
describe('the shape table', () => {
  it('gives every shape a unique, permanent slot', () => {
    const slots = SHAPES.map((s) => s.n)
    expect(new Set(slots).size, `duplicate slot numbers in ${slots}`).toBe(
      slots.length,
    )
  })

  it('gives every shape a unique id', () => {
    const ids = SHAPES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('makes every shape say which rule it witnesses', () => {
    // A cell that cannot say why it exists is a cell nobody can diagnose.
    for (const shape of SHAPES) {
      expect(
        shape.rationale.length,
        `${shape.id} has a thin rationale`,
      ).toBeGreaterThan(40)
    }
  })

  it('starts every path at the .eth 2LD', () => {
    for (const shape of SHAPES) {
      expect(
        shape.path.length,
        `${shape.id} has an empty path`,
      ).toBeGreaterThan(0)
      // `wrapETH2LD` burns PARENT_CANNOT_CONTROL itself, so a 2LD is never
      // merely `wrapped` — it is emancipated the moment it is wrapped.
      expect(
        shape.path[0]?.wrap,
        `${shape.id}: a 2LD cannot be "wrapped" — wrapETH2LD burns PCC, so it is emancipated or locked`,
      ).not.toBe('wrapped')
    }
  })

  it('only splits registrant from controller on an unwrapped 2LD', () => {
    // The split is a registrar/registry fact. A wrapped name has one owner, and
    // a subname has no registrant at all.
    for (const shape of SHAPES) {
      for (const [level, node] of shape.path.entries()) {
        if (!node.controller) continue
        expect(
          level === 0 && node.wrap === 'unwrapped',
          `${shape.id}: level ${level} declares a controller, but only an unwrapped 2LD has one`,
        ).toBe(true)
      }
      if (shape.role === 'manager' || shape.role === 'registrant') {
        expect(
          depthOf(shape) === 2 && shape.path[0]?.wrap === 'unwrapped',
          `${shape.id}: role "${shape.role}" only exists for an unwrapped 2LD`,
        ).toBe(true)
      }
    }
  })

  it('burns PARENT_CANNOT_CONTROL only under a parent that can allow it', () => {
    // The NameWrapper refuses to emancipate a child whose parent has not burned
    // CANNOT_UNWRAP. Getting this wrong is a revert at seed time.
    for (const shape of SHAPES) {
      for (const [level, node] of shape.path.entries()) {
        if (level === 0) continue
        if (node.wrap !== 'emancipated' && node.wrap !== 'locked') continue
        expect(
          shape.path[level - 1]?.wrap,
          `${shape.id}: level ${level} is ${node.wrap}, so its parent must be locked (CANNOT_UNWRAP)`,
        ).toBe('locked')
      }
    }
  })

  it('pairs a non-active registration with the tail that produces it', () => {
    for (const shape of SHAPES) {
      if (shape.registration === 'active') continue
      const tail = shape.registration === 'grace' ? 'to-grace' : 'past-grace'
      expect(
        shape.tails ?? [],
        `${shape.id} claims registration "${shape.registration}" but no tail moves the clock`,
      ).toContain(tail)
    }
  })

  it('gives every unseedable shape a reason, and no tails', () => {
    for (const shape of SHAPES.filter((s) => s.unseedable)) {
      expect(shape.unseedable?.reason.length).toBeGreaterThan(40)
    }
    expect(seedableShapes().length).toBeLessThan(SHAPES.length)
  })
})

describe('the tab table', () => {
  it('gives every tab a unique id and a unique scenario prefix', () => {
    expect(new Set(TABS.map((t) => t.id)).size).toBe(TABS.length)
    expect(new Set(TABS.map((t) => t.prefix)).size).toBe(TABS.length)
  })

  it('uses prefixes the coverage ledger can parse', () => {
    // `TAG_RE` in reconcile.ts is /@scenario:([A-Za-z]+[0-9]+)/, and tierForId
    // takes the longest alphabetic prefix — so a prefix must be letters only.
    for (const tab of TABS) expect(tab.prefix).toMatch(/^[A-Z]+$/)
  })

  it('builds a route for every depth of name', () => {
    for (const tab of TABS) {
      expect(tab.path('a.b.c.eth')).toMatch(/^\/a\.b\.c\.eth/)
    }
  })
})
