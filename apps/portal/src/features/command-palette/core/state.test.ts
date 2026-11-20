import { describe, expect, it } from 'vitest'
import {
  INITIAL_PALETTE_STATE,
  type PaletteEvent,
  type PaletteState,
  paletteReducer,
} from './state'

const run = (...events: readonly PaletteEvent[]): PaletteState =>
  events.reduce(paletteReducer, INITIAL_PALETTE_STATE)

describe('paletteReducer', () => {
  it('restores the query, deliberate selection, and scroll position when returning from an entity scope', () => {
    const root = run(
      { type: 'open', query: 'alice' },
      { type: 'select', selectedId: 'name:alice.eth' },
      { type: 'scroll', scrollTop: 120 },
    )
    const nested = paletteReducer(root, {
      type: 'push',
      screen: { type: 'entity', entity: { type: 'name', name: 'alice.eth' } },
    })
    expect(paletteReducer(nested, { type: 'back' })).toEqual(root)
  })

  it('changes the query without retaining an Enter selection from the previous results', () => {
    const state = run(
      { type: 'open', query: 'alice' },
      { type: 'select', selectedId: 'name:alice.eth' },
      { type: 'scroll', scrollTop: 120 },
      { type: 'query', query: 'bob' },
    )
    expect(state).toEqual({
      status: 'open',
      current: {
        screen: { type: 'root' },
        query: 'bob',
        selectedId: '',
        scrollTop: 0,
      },
      history: [],
    })
  })

  it('starts a normal root session after closing developer scope or a target picker', () => {
    const state = run(
      { type: 'open' },
      { type: 'push', screen: { type: 'developer' }, query: 'migration' },
      {
        type: 'push',
        screen: { type: 'target', commandId: 'name.renew', target: 'name' },
      },
      { type: 'close' },
      { type: 'open' },
    )
    expect(state).toEqual(run({ type: 'open' }))
  })

  it('can restore an active intent after a canceled wallet handoff', () => {
    const snapshot = run(
      { type: 'open', query: 'renew' },
      {
        type: 'push',
        screen: { type: 'target', commandId: 'name.renew', target: 'name' },
        query: 'bob.eth',
      },
    )
    if (snapshot.status !== 'open') throw new Error('Expected an open intent')
    expect(
      paletteReducer(INITIAL_PALETTE_STATE, {
        type: 'restore',
        state: snapshot,
      }),
    ).toEqual(snapshot)
  })

  it('Back at the root closes the session and closed sessions ignore stale updates', () => {
    const state = run(
      { type: 'open' },
      { type: 'back' },
      { type: 'query', query: 'late result' },
    )
    expect(state).toEqual(INITIAL_PALETTE_STATE)
  })
})
