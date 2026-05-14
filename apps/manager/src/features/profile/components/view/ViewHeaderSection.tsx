import { Trans } from '@lingui/react/macro'
import { useQueries } from '@tanstack/react-query'
import clsx from 'clsx'
import type { Address } from 'viem'
import * as ImageFallback from '@/components/atoms/ImageFallback'
import { PatternAvatar } from '@/components/atoms/PatternAvatar/PatternAvatar'
import { LinkButton } from '@/components/ui/button'
import { MSymbol } from '@/components/ui/material-symbol'
import { parseAvatarQuery } from '../../service/profileAvatar'
import type { ProfileRecords } from '../../types'
import { ProfileHeaderInfo } from '../common/ProfileHeaderInfo'
import { ShareProfileDialog } from '../dialogs/ShareProfileDialog'
import { FavoriteButton } from './FavoriteButton'

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

  const avatarUrl = avatar.data ?? records.base.avatar
  const headerUrl = header.data ?? records.base.header

  const url = `${
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://app.ens.domains'
  }/p/${name}`

  return (
    <div className="overflow-hidden rounded-xl border-[0.25px] border-border bg-white shadow-none">
      {/* Header BG */}
      <div className="relative w-full">
        <ImageFallback.Root className="aspect-3/1 w-full md:aspect-5/1">
          <ImageFallback.Image
            alt={`${name} header`}
            className="size-full object-cover"
            src={headerUrl}
          />
          <ImageFallback.Fallback>
            <div
              className={clsx('size-full', header.isLoading && 'animate-pulse')}
              style={{
                backgroundImage:
                  'linear-gradient(162deg, transparent 21.72%, var(--color-muted) 62.7%)',
              }}
            />
          </ImageFallback.Fallback>
        </ImageFallback.Root>
        <div className="absolute top-4 left-4 flex items-center gap-2">
          <LinkButton
            params={{ name }}
            size="sm"
            to="/renew/$name"
            variant="outline"
          >
            <Trans>Extend Name</Trans>
            <MSymbol className="ms-opsz-16 ms-wght-300" symbol="double_arrow" />
          </LinkButton>
        </div>
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <FavoriteButton name={name} />
          <ShareProfileDialog avatarUrl={avatarUrl} name={name} url={url} />
        </div>
        <div className="-bottom-10 -translate-x-1/2 absolute left-1/2 size-24 md:size-36 lg:size-40">
          <div className="size-full overflow-hidden rounded-xl bg-gray-200 shadow-md ring-2 ring-white">
            <ImageFallback.Root className="contents">
              <ImageFallback.Image
                alt={`${name} avatar`}
                className="h-full w-full object-cover"
                src={avatarUrl}
              />
              <ImageFallback.Fallback>
                <PatternAvatar
                  className={clsx(
                    'size-full rounded-xl border-none bg-transparent p-0 shadow-none',
                    avatar.isLoading && 'opacity-50',
                  )}
                  name={name}
                />
                {avatar.isLoading && (
                  <div className="absolute inset-0 animate-pulse rounded-xl bg-gray-100" />
                )}
              </ImageFallback.Fallback>
            </ImageFallback.Root>
          </div>
        </div>
      </div>
      <ProfileHeaderInfo name={name} owner={owner} />
    </div>
  )
}
