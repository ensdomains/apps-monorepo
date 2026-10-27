import { useLayoutEffect, useRef, useState } from 'react'
import type { Address } from 'viem'
import type { ProfileRecords } from '@/features/profile/types'
import { ProfileAbout } from './ProfileAbout'
import { ProfileAvatar } from './ProfileAvatar'
import { ProfileDetails, ProfileNameBadge } from './ProfileDetails'

// The about card's content sets the row height. The avatar copies that height
// so it stays square without stretching the card.
const useAboutSide = () => {
  const aboutRef = useRef<HTMLDivElement>(null)
  const [side, setSide] = useState<number>()

  useLayoutEffect(() => {
    const about = aboutRef.current
    if (!about) return

    const update = () => setSide(about.offsetHeight)
    const observer = new ResizeObserver(update)
    observer.observe(about)
    update()
    return () => observer.disconnect()
  }, [])

  return { aboutRef, side }
}

type ProfileHeaderProps = {
  readonly avatarUrl?: string
  readonly avatarLoading: boolean
  readonly displayExpiryDate?: Date | null
  readonly canEdit?: boolean
  readonly desktopActions?: React.ReactNode
  readonly mobileActions?: React.ReactNode
  readonly name: string
  readonly owner?: Address
  readonly ownerReverseName?: string | null
  readonly records: ProfileRecords
  readonly registrationDate?: number | null
}

export const ProfileHeader = ({
  avatarLoading,
  avatarUrl,
  displayExpiryDate,
  canEdit,
  desktopActions,
  mobileActions,
  name,
  owner,
  ownerReverseName,
  records,
  registrationDate,
}: ProfileHeaderProps) => {
  const { aboutRef, side } = useAboutSide()

  return (
    <div className="relative min-h-130.75 rounded-none bg-transparent pt-0 shadow-none xl:min-h-0 xl:space-y-[21.7px] xl:px-8 xl:pt-0">
      <ProfileAvatar
        avatarLoading={avatarLoading}
        avatarUrl={avatarUrl}
        className="mx-auto mb-6 xl:hidden"
        name={name}
      />
      <div className="flex flex-col items-center xl:block xl:space-y-3.25">
        <ProfileNameBadge name={name} />
        {mobileActions ? (
          <div className="mt-6 w-full px-5 xl:hidden">{mobileActions}</div>
        ) : null}
        <div className="mt-8 flex w-full items-start justify-between gap-4 px-5 xl:mt-0 xl:px-0">
          <ProfileDetails
            displayExpiryDate={displayExpiryDate}
            owner={owner}
            ownerReverseName={ownerReverseName}
            registrationDate={registrationDate}
          />
          {desktopActions}
        </div>
        <div className="mt-6 w-[calc(100%-40px)] border-ens-quartz-200 border-t xl:hidden" />
      </div>
      <div className="mt-6 flex flex-col gap-6 px-5 xl:mt-0 xl:flex-row xl:items-start xl:px-0">
        <ProfileAvatar
          avatarLoading={avatarLoading}
          avatarUrl={avatarUrl}
          className="hidden shrink-0 xl:block"
          name={name}
          style={side ? { width: side, height: side } : undefined}
        />
        <div className="min-w-0 flex-1" ref={aboutRef}>
          <ProfileAbout canEdit={canEdit} records={records} />
        </div>
      </div>
    </div>
  )
}
