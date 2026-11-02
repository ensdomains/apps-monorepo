import { type Atom, createAtom, useAtom } from '@xstate/store-react'
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useState,
} from 'react'
import type { Address } from 'viem'
import {
  type AddressHighlightEvent,
  type AddressHighlightState,
  activeHighlightKey,
  NO_ADDRESS_HIGHLIGHT,
  nextAddressHighlight,
} from './addressHighlightState'

type AddressHighlightAtom = Atom<AddressHighlightState>

// The atom itself never changes, so the context never re-renders its
// consumers; each badge subscribes to whether its own address is active.
const AddressHighlightContext = createContext<AddressHighlightAtom | null>(null)

// Read by badges outside a provider (hooks can't be skipped); never set.
const NO_PROVIDER_ATOM: AddressHighlightAtom = createAtom(NO_ADDRESS_HIGHLIGHT)

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
  const [atom] = useState(() => createAtom(NO_ADDRESS_HIGHLIGHT))

  return (
    <AddressHighlightContext.Provider value={atom}>
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

const dispatch = (atom: AddressHighlightAtom, event: AddressHighlightEvent) =>
  atom.set((state) => nextAddressHighlight(state, event))

export const useAddressHighlight = (
  address: Address | undefined,
): AddressHighlight => {
  const atom = useContext(AddressHighlightContext)
  const sourceId = useId()
  const key = address ? toHighlightKey(address) : undefined
  // A boolean, so only badges whose highlight flips re-render.
  const isHighlighted = useAtom(
    atom ?? NO_PROVIDER_ATOM,
    (state) => key !== undefined && activeHighlightKey(state) === key,
  )

  // A badge removed while hovered (e.g. filtered out) gets no leave event.
  useEffect(() => {
    if (!atom || !key) return
    return () => dispatch(atom, { type: 'remove', sourceId })
  }, [atom, sourceId, key])

  if (!atom || !key) return NO_HIGHLIGHT

  return {
    isHighlighted,
    // A tap has no matching leave, so it would leave the highlight on. Touch
    // still highlights through focus, which the next tap elsewhere clears.
    onPointerEnter: ({ pointerType }) => {
      if (pointerType === 'touch') return
      dispatch(atom, { type: 'enter', input: 'hover', sourceId, key })
    },
    onPointerLeave: ({ pointerType }) => {
      if (pointerType === 'touch') return
      dispatch(atom, { type: 'leave', input: 'hover', sourceId })
    },
    onFocus: () =>
      dispatch(atom, { type: 'enter', input: 'focus', sourceId, key }),
    onBlur: () => dispatch(atom, { type: 'leave', input: 'focus', sourceId }),
  }
}
