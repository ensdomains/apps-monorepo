import { useQueries, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import clsx from 'clsx'
import type { Address } from 'viem'
import placeholderAvatar from '@/assets/placeholder-avatar.svg'
import * as ImageFallback from '@/components/atoms/ImageFallback'
import { parseAvatarQuery } from '../../service/profileAvatar'
import { reverseNameQuery } from '../../service/profileReverseName'
import type { ProfileRecords } from '../../types'
import { ProfileHeaderInfo } from '../common/ProfileHeaderInfo'

interface OwnerLinkProps {
  address?: Address
  profileName: string
}

const OwnerLink = ({ address, profileName }: OwnerLinkProps) => {
  const ownerName = useQuery({
    ...reverseNameQuery(address),
  })

  if (!address) {
    return <span className="font-medium">{profileName}</span>
  }

  if (!ownerName.data) {
    return (
      <Link
        // @ts-expect-error - TODO: Route not added yet
        to="/a/$address"
        // @ts-expect-error - TODO: Route not added yet
        params={{ address: address }}
        className="font-medium underline underline-offset-2"
      >
        {address}
      </Link>
    )
  }

  if (ownerName.data.name === profileName) {
    return <span className="font-medium">{ownerName.data.name}</span>
  }

  return (
    <Link
      to="/p/$name"
      params={{ name: ownerName.data.name }}
      className="font-medium underline underline-offset-2"
    >
      {ownerName.data.name}
    </Link>
  )
}

interface ViewHeaderSectionProps {
  name: string
  records: ProfileRecords
  owner?: Address
}

export const ViewHeaderSection = ({
  name,
  records,
  owner,
}: ViewHeaderSectionProps) => {
  const [avatar, header] = useQueries({
    queries: [
      parseAvatarQuery(records.base.avatar),
      parseAvatarQuery(records.base.header),
    ],
  })

  return (
    <div className="overflow-hidden md:rounded-xl">
      {/* Header BG */}
      <div className="relative w-full">
        <ImageFallback.Root className="aspect-[3/1] w-full md:aspect-[4/1]">
          <ImageFallback.Image
            src={header.data}
            alt={`${name} header`}
            className="size-full object-cover"
          />
          <ImageFallback.Fallback>
            <div
              className={clsx(
                'size-full bg-gray-200',
                header.isLoading && 'animate-pulse',
              )}
            />
          </ImageFallback.Fallback>
        </ImageFallback.Root>

        <div className="-bottom-10 max-md:-translate-x-1/2 absolute left-1/2 size-24 md:left-6 md:size-36 lg:size-40">
          <div className="size-full overflow-hidden rounded-xl bg-gray-200 shadow-md ring-2 ring-white">
            <ImageFallback.Root className="contents">
              <ImageFallback.Image
                src={avatar.data}
                alt={`${name} avatar`}
                className="h-full w-full object-cover"
              />
              <ImageFallback.Fallback>
                <img
                  src={placeholderAvatar}
                  alt={`${name} fallback avatar`}
                  className={clsx(avatar.isLoading && 'opacity-50')}
                />
                {avatar.isLoading && (
                  <div className="absolute inset-0 animate-pulse rounded-xl bg-gray-100" />
                )}
              </ImageFallback.Fallback>
            </ImageFallback.Root>
          </div>
        </div>
      </div>

      {/* Main info */}
      <div className="flex w-full flex-col items-start gap-3 bg-gray-100 px-4 pt-16 pb-4 text-center md:px-6 md:pt-16 md:pb-6 md:text-left">
        <ProfileHeaderInfo
          name={name}
          ownerNode={<OwnerLink address={owner} profileName={name} />}
        />
      </div>
    </div>
  )
}
