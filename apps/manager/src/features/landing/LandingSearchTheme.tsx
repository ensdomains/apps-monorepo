import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

/**
 * Shares the homepage search's raw `theme` text record with the header.
 *
 * The landing page holds the record and colors its own headings. The ENS logo
 * renders in Layout, above the page, so it reads the same record from here.
 * Leaving the homepage clears it, which returns the logo to the static mark.
 */
type LandingSearchThemeContextValue = {
  readonly themeRecord: string | undefined
  readonly setThemeRecord: (record: string | undefined) => void
}

const noopSetThemeRecord = (_record: string | undefined): void => {}

const LandingSearchThemeContext = createContext<LandingSearchThemeContextValue>(
  {
    themeRecord: undefined,
    setThemeRecord: noopSetThemeRecord,
  },
)

export const LandingSearchThemeProvider = ({
  children,
}: {
  readonly children: ReactNode
}) => {
  const [themeRecord, setThemeRecord] = useState<string | undefined>(undefined)
  const value = useMemo(() => ({ themeRecord, setThemeRecord }), [themeRecord])

  return (
    <LandingSearchThemeContext.Provider value={value}>
      {children}
    </LandingSearchThemeContext.Provider>
  )
}

export const useLandingSearchThemeRecord = (): string | undefined =>
  use(LandingSearchThemeContext).themeRecord

type LandingSearchTheme = {
  readonly themeRecord: string | undefined
  readonly setThemeRecord: (record: string | undefined) => void
}

/**
 * Record held by the landing page, mirrored into context for the header.
 * Unmount clears the mirror so the logo returns to Lapis after navigation.
 */
export const useLandingSearchTheme = (): LandingSearchTheme => {
  const setSharedThemeRecord = use(LandingSearchThemeContext).setThemeRecord
  const [themeRecord, setThemeRecord] = useState<string | undefined>(undefined)

  const publishThemeRecord = useCallback(
    (record: string | undefined) => {
      setThemeRecord(record)
      setSharedThemeRecord(record)
    },
    [setSharedThemeRecord],
  )

  useEffect(() => {
    return () => {
      setSharedThemeRecord(undefined)
    }
  }, [setSharedThemeRecord])

  return { themeRecord, setThemeRecord: publishThemeRecord }
}
