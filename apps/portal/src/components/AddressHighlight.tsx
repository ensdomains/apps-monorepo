import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useMemo,
  useReducer,
} from 'react'
import type { Address } from 'viem'
import {
  type AddressHighlightEvent,
  activeHighlightKey,
  NO_ADDRESS_HIGHLIGHT,
  nextAddressHighlight,
} from './addressHighlightState'

interface AddressHighlightContextValue {
  readonly activeKey: string | undefined
  readonly dispatch: Dispatch<AddressHighlightEvent>
}

const AddressHighlightContext =
  createContext<AddressHighlightContextValue | null>(null)

/** Checksummed and lower-case copies of one address are the same account. */
const toHighlightKey = (address: Address) => address.toLowerCase()

/**
 * Hovering (or focusing) an address badge inside this provider highlights
 * every other badge for the same address. Badges outside one never highlight.
 */
export const AddressHighlightProvider = ({
  children,
}: {
  readonly children: ReactNode
}) => {
  const [state, dispatch] = useReducer(
    nextAddressHighlight,
    NO_ADDRESS_HIGHLIGHT,
  )
  const activeKey = activeHighlightKey(state)
  const value = useMemo(() => ({ activeKey, dispatch }), [activeKey])

  return (
    <AddressHighlightContext.Provider value={value}>
      {children}
    </AddressHighlightContext.Provider>
  )
}

interface PointerInput {
  readonly pointerType: string
}

interface AddressHighlight {
  readonly isHighlighted: boolean
  readonly onPointerEnter?: (event: PointerInput) => void
  readonly onPointerLeave?: (event: PointerInput) => void
  readonly onFocus?: () => void
  readonly onBlur?: () => void
}

const NO_HIGHLIGHT: AddressHighlight = { isHighlighted: false }

export const useAddressHighlight = (
  address: Address | undefined,
): AddressHighlight => {
  const context = useContext(AddressHighlightContext)
  const sourceId = useId()
  const key = address ? toHighlightKey(address) : undefined
  const dispatch = context?.dispatch

  // A badge removed while hovered (e.g. filtered out) gets no leave event.
  useEffect(() => {
    if (!dispatch || !key) return
    return () => dispatch({ type: 'remove', sourceId })
  }, [dispatch, sourceId, key])

  if (!context || !key) return NO_HIGHLIGHT

  return {
    isHighlighted: context.activeKey === key,
    // A tap has no matching leave, so it would leave the highlight on. Touch
    // still highlights through focus, which the next tap elsewhere clears.
    onPointerEnter: ({ pointerType }) => {
      if (pointerType === 'touch') return
      context.dispatch({ type: 'enter', input: 'hover', sourceId, key })
    },
    onPointerLeave: ({ pointerType }) => {
      if (pointerType === 'touch') return
      context.dispatch({ type: 'leave', input: 'hover', sourceId })
    },
    onFocus: () =>
      context.dispatch({ type: 'enter', input: 'focus', sourceId, key }),
    onBlur: () => context.dispatch({ type: 'leave', input: 'focus', sourceId }),
  }
}
