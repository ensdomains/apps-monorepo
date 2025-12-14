import { useWallet } from '@getpara/react-sdk-lite'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { LinkButton } from '@/components/ui/button'
import { useSmartAccount } from '@/lib/smart-account'
import { sectionsList } from '../../data/records'
import { profileOwnerQuery } from '../../service/profileOwner'
import { profileRecordsQuery } from '../../service/profileRecords'
import { transformProfileRecords } from '../../utils/transformRecords'
import { ViewBioSection } from './ViewBioSection'
import { ViewCryptoSection } from './ViewCryptoSection'
import { ViewDynamicSection } from './ViewDynamicSection'
import { ViewHeaderSection } from './ViewHeaderSection'
import { ViewLinksSection } from './ViewLinksSection'
import { ViewResolverSection } from './ViewResolverSection'

interface ProfileViewProps {
  name: string
}

export const ProfileView = ({ name }: ProfileViewProps) => {
  const { data: records } = useSuspenseQuery({
    ...profileRecordsQuery(name),
    select: transformProfileRecords,
  })

  const { data: ownerData } = useQuery({
    ...profileOwnerQuery(name),
  })

  const { data: wallet } = useWallet()

  const { accountAddress: smartAccountAddress } = useSmartAccount()

  const normalizedOwner = ownerData?.owner?.toLowerCase()
  const connectedAddresses = [wallet?.address, smartAccountAddress]
    .filter((addr): addr is string => Boolean(addr))
    .map((addr) => addr.toLowerCase())

  const isOwner = Boolean(
    normalizedOwner && connectedAddresses.includes(normalizedOwner),
  )

  if (!records) {
    return null
  }

  return (
    <div className="mx-auto mb-12 w-full max-w-7xl space-y-4 md:w-[calc(100%-4rem)] md:space-y-4">
      <ViewHeaderSection
        name={name}
        records={records}
        owner={ownerData?.owner as Address | undefined}
      />
      <div className="grid grid-cols-1 gap-4 px-4 md:grid-cols-12">
        {/* Left/main column */}
        <div className="space-y-4 md:col-span-7 lg:col-span-8">
          <ViewBioSection records={records} />
          {sectionsList.map((section) => (
            <ViewDynamicSection
              key={section}
              records={records}
              section={section}
            />
          ))}
        </div>

        {/* Right/side column */}
        <div className="space-y-4 md:col-span-5 lg:col-span-4">
          <ViewCryptoSection records={records} />
          <ViewResolverSection resolverAddress={records.resolverAddress} />
          <ViewLinksSection records={records} />

          {/* Edit Button */}
          {isOwner && (
            <div>
              <LinkButton
                to="/p/$name/edit"
                params={{ name }}
                className="w-full md:w-auto"
              >
                Edit Profile
              </LinkButton>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
