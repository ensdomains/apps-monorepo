import { match } from 'ts-pattern'

/** Hover and keyboard focus are tracked apart, so one ending keeps the other. */
export type HighlightInput = 'hover' | 'focus'

interface HighlightSource {
  /** The badge that started it, so only that badge can end it. */
  readonly sourceId: string
  readonly key: string
}

export interface AddressHighlightState {
  readonly hover: HighlightSource | undefined
  readonly focus: HighlightSource | undefined
}

export type AddressHighlightEvent =
  | {
      readonly type: 'enter'
      readonly input: HighlightInput
      readonly sourceId: string
      readonly key: string
    }
  | {
      readonly type: 'leave'
      readonly input: HighlightInput
      readonly sourceId: string
    }
  /** The badge unmounted or changed address. */
  | { readonly type: 'remove'; readonly sourceId: string }

export const NO_ADDRESS_HIGHLIGHT: AddressHighlightState = {
  hover: undefined,
  focus: undefined,
}

/** Keeps `state` itself when nothing changes, so React can skip the update. */
export const nextAddressHighlight = (
  state: AddressHighlightState,
  event: AddressHighlightEvent,
): AddressHighlightState =>
  match(event)
    .with({ type: 'enter' }, ({ input, sourceId, key }) => ({
      ...state,
      [input]: { sourceId, key },
    }))
    .with({ type: 'leave' }, ({ input, sourceId }) =>
      state[input]?.sourceId === sourceId
        ? { ...state, [input]: undefined }
        : state,
    )
    .with({ type: 'remove' }, ({ sourceId }) =>
      state.hover?.sourceId === sourceId || state.focus?.sourceId === sourceId
        ? {
            hover: state.hover?.sourceId === sourceId ? undefined : state.hover,
            focus: state.focus?.sourceId === sourceId ? undefined : state.focus,
          }
        : state,
    )
    .exhaustive()

/** The pointer is where the user is looking, so hover wins over focus. */
export const activeHighlightKey = (
  state: AddressHighlightState,
): string | undefined => state.hover?.key ?? state.focus?.key
