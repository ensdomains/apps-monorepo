import { useWallet } from '@getpara/react-sdk-lite'
import { useSuspenseQuery } from '@tanstack/react-query'
import { LinkButton } from '@/components/ui/button'
import { useSmartAccount } from '@/lib/smart-account'
import { sectionsList } from '../../data/records'
import { profileQuery } from '../../service/profile'
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
  const { data: profile } = useSuspenseQuery({
    ...profileQuery(name),
  })

  const { data: wallet } = useWallet()

  const { accountAddress: smartAccountAddress } = useSmartAccount()

  if (!profile) {
    return null
  }

  const { records, ownerAddress, expiryDate, resolverAddress } = profile

  const normalizedOwner = ownerAddress?.toLowerCase()
  const connectedAddresses = [wallet?.address, smartAccountAddress]
    .filter((addr): addr is string => Boolean(addr))
    .map((addr) => addr.toLowerCase())

  const isOwner = Boolean(
    normalizedOwner && connectedAddresses.includes(normalizedOwner),
  )

  const expiry =
    typeof expiryDate === 'number' && expiryDate > 0
      ? new Date(expiryDate * 1000)
      : null

  return (
    <div className="mx-auto mb-12 w-full max-w-7xl space-y-4 md:w-[calc(100%-4rem)] md:space-y-4">
      <ViewHeaderSection
        name={name}
        records={records}
        owner={ownerAddress ?? undefined}
        expiryDate={expiry}
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
          <ViewResolverSection resolver={resolverAddress ?? undefined} />
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
