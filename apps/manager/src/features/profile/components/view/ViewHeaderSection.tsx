import clsx from 'clsx'
import type { Address } from 'viem'
import placeholderAvatar from '@/assets/placeholder-avatar.svg'
import * as ImageFallback from '@/components/atoms/ImageFallback'
import type { ProfileRecords } from '../../types'
import { ProfileHeaderInfo } from '../common/ProfileHeaderInfo'
import { ShareProfileDialog } from '../dialogs/ShareProfileDialog'

interface ViewHeaderSectionProps {
  name: string
  records: ProfileRecords
  owner?: Address
  expiryDate?: Date | null
}

export const ViewHeaderSection = ({
  name,
  records,
  owner,
  expiryDate,
}: ViewHeaderSectionProps) => {
  const avatarUrl = records.base.avatar
  const headerUrl = records.base.header

  const url = `${
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://app.ens.domains'
  }/p/${name}`

  return (
    <div className="overflow-hidden md:rounded-xl">
      {/* Header BG */}
      <div className="relative w-full">
        <ImageFallback.Root className="aspect-[3/1] w-full md:aspect-[5/1]">
          <ImageFallback.Image
            src={headerUrl}
            alt={`${name} header`}
            className="size-full object-cover"
          />
          <ImageFallback.Fallback>
            <div className={clsx('size-full bg-gray-200')} />
          </ImageFallback.Fallback>
        </ImageFallback.Root>
        <div className="absolute top-4 right-4">
          <ShareProfileDialog name={name} url={url} avatarUrl={avatarUrl} />
        </div>
        <div className="-bottom-10 max-md:-translate-x-1/2 absolute left-1/2 size-24 md:left-6 md:size-36 lg:size-40">
          <div className="size-full overflow-hidden rounded-xl bg-gray-200 shadow-md ring-2 ring-white">
            <ImageFallback.Root className="contents">
              <ImageFallback.Image
                src={avatarUrl}
                alt={`${name} avatar`}
                className="h-full w-full object-cover"
              />
              <ImageFallback.Fallback>
                <img
                  src={placeholderAvatar}
                  alt={`${name} fallback avatar`}
                  className=""
                />
              </ImageFallback.Fallback>
            </ImageFallback.Root>
          </div>
        </div>
      </div>
      <ProfileHeaderInfo name={name} owner={owner} expiryDate={expiryDate} />
    </div>
  )
}
