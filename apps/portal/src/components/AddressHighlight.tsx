import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react'
import type { Address } from 'viem'

interface AddressHighlightContextValue {
  readonly hoveredKey: string | undefined
  readonly setHoveredKey: (
    update: (current: string | undefined) => string | undefined,
  ) => void
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
  const [hoveredKey, setHoveredKey] = useState<string>()
  const value = useMemo(() => ({ hoveredKey, setHoveredKey }), [hoveredKey])

  return (
    <AddressHighlightContext.Provider value={value}>
      {children}
    </AddressHighlightContext.Provider>
  )
}

interface AddressHighlight {
  readonly isHighlighted: boolean
  readonly onEnter?: () => void
  readonly onLeave?: () => void
}

const NO_HIGHLIGHT: AddressHighlight = { isHighlighted: false }

export const useAddressHighlight = (
  address: Address | undefined,
): AddressHighlight => {
  const context = useContext(AddressHighlightContext)
  if (!context || !address) return NO_HIGHLIGHT

  const key = toHighlightKey(address)
  return {
    isHighlighted: context.hoveredKey === key,
    onEnter: () => context.setHoveredKey(() => key),
    // Only clear our own key: the next badge may already have taken over.
    onLeave: () =>
      context.setHoveredKey((current) =>
        current === key ? undefined : current,
      ),
  }
}
