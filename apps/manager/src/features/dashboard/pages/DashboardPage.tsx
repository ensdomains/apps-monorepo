import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DashboardSidebar } from '@/features/dashboard/components/DashboardSidebar'
import { DidYouKnowSection } from '@/features/dashboard/components/DidYouKnowSection'
import { FaqSection } from '@/features/dashboard/components/FaqSection'
import { NamesTable } from '@/features/dashboard/components/NamesTable'
import { PrimaryNameCard } from '@/features/dashboard/components/PrimaryNameCard'
import { parseAvatarQuery } from '@/features/profile/service/profileAvatar'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { useSmartAccountContext } from '@/lib/smart-account'

const formatAddress = (value?: string | null) =>
  value ? `${value.slice(0, 6)}...${value.slice(-4)}` : '—'

export const DashboardPage = () => {
  const { ownerAddress } = useSmartAccountContext()

  const { data: reverseName } = useSuspenseQuery({
    ...profileReverseNameQuery(ownerAddress ?? undefined),
  })

  const { data: reverseRecords } = useQuery({
    ...profileRecordsQuery(reverseName ?? ''),
    enabled: !!reverseName,
  })

  const avatarRecord = reverseRecords?.texts.find(
    (text) => text.key === 'avatar',
  )?.value

  const { data: parsedAvatar } = useQuery({
    ...parseAvatarQuery(avatarRecord),
    enabled: !!avatarRecord,
  })

  const defaultName = reverseName ?? null
  const avatarUrl = parsedAvatar ?? null

  const displayName = defaultName ?? formatAddress(ownerAddress)
  const hasProfile = Boolean(defaultName)

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col items-start gap-4 px-4 py-6 md:flex-row md:gap-8 md:px-[58px] md:py-[40px]">
      <DashboardSidebar
        hasProfile={hasProfile}
        profileName={defaultName ?? ''}
      />
      <div className="min-w-0 flex-1 space-y-6 md:space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-8">
          <h1 className="font-serif text-[#232222] text-[28px] leading-[0.96] tracking-[0.28px] md:text-[40px] md:tracking-[0.4px]">
            Hello {displayName}
          </h1>
          <Button
            asChild
            className="h-12 gap-2 rounded bg-transparent px-6 font-mono text-foreground text-sm uppercase tracking-wider hover:bg-ens-blue-hover hover:text-white"
          >
            <Link className="flex items-center gap-2" to="/">
              <Search className="size-4" />
              Search new name
            </Link>
          </Button>
        </div>
        {hasProfile && (
          <PrimaryNameCard avatarUrl={avatarUrl} primaryName={defaultName} />
        )}
        <div className="rounded-[8px] border-[#dededf] border-[0.25px] bg-white px-4 py-6 md:px-[24px] md:py-[32px]">
          <div className="space-y-5">
            <NamesTable primaryLabel={defaultName} />
          </div>
        </div>
        <DidYouKnowSection />
        <FaqSection />
      </div>
    </div>
  )
}
