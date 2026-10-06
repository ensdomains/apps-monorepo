import { createContext, type ReactNode, useContext } from 'react'
import { useDashboardOwnerAddresses } from './useDashboardOwnerAddresses'

const DashboardNamesContext = createContext<readonly string[] | undefined>(
  undefined,
)

/** Share the dashboard's required address walks with every migration banner/modal. */
export const DashboardNamesProvider = ({
  children,
}: {
  readonly children: ReactNode
}) => {
  const addresses = useDashboardOwnerAddresses()
  return (
    <DashboardNamesContext value={addresses}>{children}</DashboardNamesContext>
  )
}

export const useDashboardDiscoveryAddresses = () =>
  useContext(DashboardNamesContext)
