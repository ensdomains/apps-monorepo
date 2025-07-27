import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useAccount } from 'wagmi'
import { ownerQuery } from '../../service/profileOwner'
import { profileRecordsQuery } from '../../service/profileRecords'
import {
  debugProfileRecords,
  transformProfileRecords,
} from '../../utils/transformRecords'
import { ViewBioSection } from './ViewBioSection'
import { ViewCryptoSection } from './ViewCryptoSection'
import { ViewHeaderSection } from './ViewHeaderSection'
import { ViewLinksSection } from './ViewLinksSection'
import { ViewSocialSection } from './ViewSocialSection'

interface ProfileViewProps {
  name: string
}

export const ProfileView = ({ name }: ProfileViewProps) => {
  const records = useQuery({
    ...profileRecordsQuery(name),
    select: transformProfileRecords,
    throwOnError: true,
  })

  const owner = useQuery({
    ...ownerQuery(name),
    // throwOnError: true,
  })

  const { address } = useAccount()

  const isOwner =
    address && owner.data?.registrant?.toLowerCase() === address.toLowerCase()

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
  debugProfileRecords(records.data)

  if (!records.data) {
    return null
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <ViewHeaderSection
        name={name}
        records={records.data}
        owner={owner.data?.owner}
      />
      <ViewBioSection records={records.data} />

      {/* Divider */}
      <div className="h-px w-full bg-gray-200" />

      <ViewSocialSection records={records.data} />
      <ViewCryptoSection records={records.data} />
      <ViewLinksSection records={records.data} />

      {/* Edit Button */}
      {isOwner && (
        <div className="pt-4">
          <Link
            to="/p/$name/edit"
            params={{ name }}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 font-medium text-sm text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Edit Profile
          </Link>
        </div>
      )}
    </div>
  )
}
