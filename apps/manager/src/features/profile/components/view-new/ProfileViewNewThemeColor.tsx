import { createContext, type ReactNode, use } from 'react'

const ProfileViewNewThemeColorContext = createContext<string | undefined>(
  undefined,
)

type ProfileViewNewThemeColorProviderProps = {
  readonly children: ReactNode
  readonly value?: string
}

export const ProfileViewNewThemeColorProvider = ({
  children,
  value,
}: ProfileViewNewThemeColorProviderProps) => (
  <ProfileViewNewThemeColorContext.Provider value={value}>
    {children}
  </ProfileViewNewThemeColorContext.Provider>
)

export const useProfileViewNewThemeColor = () =>
  use(ProfileViewNewThemeColorContext)
