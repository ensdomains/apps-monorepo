import { useQuery } from '@tanstack/react-query'
import type { CSSProperties } from 'react'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { imageRecordQuery } from '@/features/profile/service/profileImageRecord'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { getDefaultHeaderCover } from '@/features/profile/utils/defaultHeaderCover'
import { getThemeVars } from '@/features/profile/utils/themeColor'
import { transformProfileRecords } from '@/features/profile/utils/transformRecords'
import { useSmartAccountContextSafe } from '@/lib/smart-account/SmartAccountContext'
import { AddressProfileHeader } from './AddressProfileHeader'
import { AddressProfileNamesList } from './AddressProfileNamesList'
import { isViewingConnectedAddress } from './connectedAccounts.helpers'
import { ProfileBanner } from './ProfileBanner'
import { ProfileThemeColorProvider } from './ProfileThemeColor'

const AddressProfileBanner = ({
  defaultHeaderUrl,
  headerRecord,
  name,
}: {
  readonly defaultHeaderUrl: string
  readonly headerRecord?: string
  readonly name: string
}) => {
  const header = useQuery(imageRecordQuery(headerRecord))

  return (
    <ProfileBanner
      defaultHeaderUrl={defaultHeaderUrl}
      fadeClassName="bottom-0"
      headerLoading={header.isLoading}
      headerUrl={header.data ?? undefined}
      name={name}
    />
  )
}

export const AddressProfileView = ({
  address,
  primaryName,
}: {
  address: Address
  primaryName?: string
}) => {
  const { address: walletAddress } = useConnection()
  const smartAccount = useSmartAccountContextSafe()
  const isConnectedView = isViewingConnectedAddress({
    address,
    walletAddress,
    accountAddress: smartAccount?.accountAddress,
    ownerAddress: smartAccount?.ownerAddress,
  })

  const { data: profileRecords } = useQuery({
    ...profileRecordsQuery(primaryName ?? ''),
    enabled: !!primaryName,
  })
  const records = profileRecords
    ? transformProfileRecords(profileRecords)
    : null
  const themeVars = getThemeVars(records?.base.theme)
  const defaultHeaderUrl = getDefaultHeaderCover({
    themeColor: records?.base.theme,
  })

  return (
    <div
      className="relative -mt-13.5 min-h-screen bg-ens-quartz-25 pb-12 lg:landscape:-mt-20"
      style={themeVars as CSSProperties}
    >
      <ProfileThemeColorProvider value={themeVars['--theme-color']}>
        <AddressProfileBanner
          defaultHeaderUrl={defaultHeaderUrl}
          headerRecord={records?.base.header?.trim()}
          name={primaryName ?? address}
        />
        <div className="relative z-10 mx-auto -mt-21 w-[calc(100%-40px)] max-w-[809.257px] space-y-6 lg:landscape:-mt-11.25">
          <AddressProfileHeader
            address={address}
            primaryName={primaryName}
            records={records}
          />
          <AddressProfileNamesList
            address={address}
            isConnectedView={isConnectedView}
            primaryName={primaryName}
          />
        </div>
      </ProfileThemeColorProvider>
    </div>
  )
}
