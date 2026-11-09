import { match } from 'ts-pattern'
import type { PaletteEntity } from './types'

export type PaletteScreen =
  | { readonly type: 'root' }
  | { readonly type: 'entity'; readonly entity: PaletteEntity }
  | {
      readonly type: 'target'
      readonly commandId: string
      readonly target: 'name' | 'address'
    }
  | { readonly type: 'developer' }

export type PaletteFrame = {
  readonly screen: PaletteScreen
  readonly query: string
  readonly selectedId: string
  readonly scrollTop: number
}

export type PaletteState =
  | { readonly status: 'closed' }
  | {
      readonly status: 'open'
      readonly current: PaletteFrame
      readonly history: readonly PaletteFrame[]
    }

export type PaletteEvent =
  | { readonly type: 'open'; readonly query?: string }
  | {
      readonly type: 'restore'
      readonly state: Extract<PaletteState, { status: 'open' }>
    }
  | { readonly type: 'close' }
  | {
      readonly type: 'push'
      readonly screen: PaletteScreen
      readonly query?: string
    }
  | { readonly type: 'query'; readonly query: string }
  | { readonly type: 'select'; readonly selectedId: string }
  | { readonly type: 'scroll'; readonly scrollTop: number }
  | { readonly type: 'back' }

export const INITIAL_PALETTE_STATE: PaletteState = { status: 'closed' }

const makeFrame = (screen: PaletteScreen, query = ''): PaletteFrame => ({
  screen,
  query,
  selectedId: '',
  scrollTop: 0,
})

export const paletteReducer = (
  state: PaletteState,
  event: PaletteEvent,
): PaletteState => {
  if (event.type === 'close') return INITIAL_PALETTE_STATE
  if (event.type === 'restore') return event.state
  if (event.type === 'open') {
    return {
      status: 'open',
      current: makeFrame({ type: 'root' }, event.query),
      history: [],
    }
  }
  if (state.status === 'closed') return state

  return match(event)
    .with({ type: 'push' }, ({ screen, query }) => ({
      ...state,
      current: makeFrame(screen, query),
      history: [...state.history, state.current],
    }))
    .with({ type: 'query' }, ({ query }) => ({
      ...state,
      current: { ...state.current, query, selectedId: '', scrollTop: 0 },
    }))
    .with({ type: 'select' }, ({ selectedId }) => ({
      ...state,
      current: { ...state.current, selectedId },
    }))
    .with({ type: 'scroll' }, ({ scrollTop }) => ({
      ...state,
      current: { ...state.current, scrollTop },
    }))
    .with({ type: 'back' }, (): PaletteState => {
      const previous = state.history.at(-1)
      return previous
        ? {
            status: 'open',
            current: previous,
            history: state.history.slice(0, -1),
          }
        : INITIAL_PALETTE_STATE
    })
    .exhaustive()
}
