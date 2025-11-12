import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { LinkButton } from '@/components/ui/button'
import { sectionsList } from '../../data/records'
import { ownerQuery } from '../../service/profileOwner'
import { profileRecordsQuery } from '../../service/profileRecords'
import { transformProfileRecords } from '../../utils/transformRecords'
import { ViewBioSection } from './ViewBioSection'
import { ViewCryptoSection } from './ViewCryptoSection'
import { ViewDynamicSection } from './ViewDynamicSection'
import { ViewHeaderSection } from './ViewHeaderSection'
import { ViewLinksSection } from './ViewLinksSection'

interface ProfileViewProps {
  name: string
}

export const ProfileView = ({ name }: ProfileViewProps) => {
  const records = useSuspenseQuery({
    ...profileRecordsQuery(name),
    select: transformProfileRecords,
  })

  const owner = useQuery({
    ...ownerQuery(name),
    // throwOnError: true,
  })

  const { address } = useAccount()

  const isOwner =
    address && owner.data?.owner?.toLowerCase() === address.toLowerCase()

  if (records.isLoading) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center justify-center py-8">
          <div className="text-gray-600">Loading profile...</div>
        </div>
      </div>
    )
  }

  if (records.error) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center justify-center py-8">
          <div className="text-red-600">
            Error loading profile: {records.error.message}
          </div>
        </div>
      </div>
    )
  }

  if (!records.data) {
    return null
  }

  return (
    <div className="mx-auto mb-12 w-full max-w-7xl space-y-4 md:w-[calc(100%-4rem)] md:space-y-4">
      <ViewHeaderSection
        name={name}
        records={records.data}
        owner={owner.data?.owner}
      />

      <div className="grid grid-cols-1 gap-4 px-4 md:grid-cols-12">
        {/* Left/main column */}
        <div className="space-y-4 md:col-span-7 lg:col-span-8">
          <ViewBioSection records={records.data} />
          {sectionsList.map((section) => (
            <ViewDynamicSection
              key={section}
              records={records.data}
              section={section}
            />
          ))}
        </div>

        {/* Right/side column */}
        <div className="space-y-4 md:col-span-5 lg:col-span-4">
          <ViewCryptoSection records={records.data} />
          <ViewLinksSection records={records.data} />

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
