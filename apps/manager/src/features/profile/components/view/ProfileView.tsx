import { useWallet } from '@getpara/react-sdk-lite'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import type { Address } from 'viem'
import { LinkButton } from '@/components/ui/button'
import { useSmartAccountContext } from '@/lib/smart-account'
import { sectionsList } from '../../data/records'
import { profileOwnerQuery } from '../../service/profileOwner'
import {
  type ProfileRecordsResult,
  profileRecordsQuery,
} from '../../service/profileRecords'
import { transformProfileRecords } from '../../utils/transformRecords'
import { ViewBioSection } from './ViewBioSection'
import { ViewCryptoSection } from './ViewCryptoSection'
import { ViewDynamicSection } from './ViewDynamicSection'
import { ViewHeaderSection } from './ViewHeaderSection'
import { ViewLinksSection } from './ViewLinksSection'

// Hidden for alpha - users don't need to change the resolver
// import { ViewResolverSection } from './ViewResolverSection'

interface ProfileViewProps {
  name: string
}

const hasConfiguredProfileRecords = ({
  texts,
  coins,
  contentHash,
  abi,
}: ProfileRecordsResult): boolean =>
  texts.length > 0 ||
  coins.length > 0 ||
  Boolean(contentHash?.trim()) ||
  Boolean(abi?.trim())

export const ProfileView = ({ name }: ProfileViewProps) => {
  const navigate = useNavigate()
  const { data: profileRecords } = useSuspenseQuery({
    ...profileRecordsQuery(name),
  })
  const records = transformProfileRecords(profileRecords)
  const isProfileEmpty = !hasConfiguredProfileRecords(profileRecords)

  const { data: ownerData } = useQuery({
    ...profileOwnerQuery(name),
  })

  const { data: wallet } = useWallet()

  const { accountAddress: smartAccountAddress } = useSmartAccountContext()

  const normalizedOwner = ownerData?.owner?.toLowerCase()
  const isOwner =
    !!normalizedOwner &&
    [wallet?.address, smartAccountAddress]
      .filter((addr): addr is string => !!addr)
      .some((addr) => addr.toLowerCase() === normalizedOwner)

  useEffect(() => {
    // If profile is empty and user is owner, redirect to edit page
    if (isOwner && isProfileEmpty) {
      navigate({ to: '/p/$name/edit', params: { name }, replace: true })
    }
  }, [isOwner, isProfileEmpty, navigate, name])

  if (isOwner && isProfileEmpty) {
    return null
  }

  return (
    <div className="mx-auto mb-12 w-full max-w-7xl space-y-4 pt-4 md:w-[calc(100%-4rem)]">
      <ViewHeaderSection
        name={name}
        owner={ownerData?.owner as Address | undefined}
        records={records}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
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
          {/* Hidden for alpha - users don't need to change the resolver
          <ViewResolverSection resolverAddress={records.resolverAddress} /> */}
          <ViewLinksSection records={records} />

          {/* Edit Button */}
          {isOwner && (
            <div>
              <LinkButton
                className="w-full"
                params={{ name }}
                to="/p/$name/edit"
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
