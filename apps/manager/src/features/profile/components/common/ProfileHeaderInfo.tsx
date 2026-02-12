import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Calendar, Wallet } from 'lucide-react'
import type { Address } from 'viem'
import { CopyToClipboard } from '@/components/atoms/CopyToClipboard'
import { Highlight } from '@/components/atoms/Highlight'
import { truncateAddress } from '@/lib/utils'
import { profileExpiryQuery } from '../../service/profileExpiry'
import { profileReverseNameQuery } from '../../service/profileReverseName'

interface OwnerLinkProps {
  address?: Address
  profileName: string
}

const OwnerLink = ({ address, profileName }: OwnerLinkProps) => {
  const ownerName = useQuery({
    ...profileReverseNameQuery(address as Address),
  })

  if (!address) {
    return <span className="font-medium">{profileName}</span>
  }

  if (!ownerName.data) {
    return (
      <Link
        className="font-medium underline underline-offset-2"
        params={{ name: address }}
        to="/p/$name"
      >
        <span className="md:hidden">{truncateAddress(address)}</span>
        <span className="hidden md:inline">{address}</span>
      </Link>
    )
  }

  if (ownerName.data === profileName) {
    return <span className="font-medium">{ownerName.data}</span>
  }

  return (
    <Link
      className="font-medium underline underline-offset-2"
      params={{ name: ownerName.data }}
      to="/p/$name"
    >
      {ownerName.data}
    </Link>
  )
}

const formatDate = (date: Date) => {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

interface ProfileHeaderInfoProps {
  name: string
  owner?: Address
}

export const ProfileHeaderInfo = ({ name, owner }: ProfileHeaderInfoProps) => {
  const expiry = useSuspenseQuery({
    ...profileExpiryQuery(name),
  })

  return (
    <div className="flex w-full flex-col items-start gap-3 bg-white px-4 pt-16 pb-4 text-center md:px-6 md:pt-16 md:pb-6 md:text-left">
      <Highlight className="text-lg md:text-2xl">{name}</Highlight>
      <div className="flex items-center gap-x-1 whitespace-pre-wrap">
        <Wallet className="size-5" />
        Owned by
        <OwnerLink address={owner} profileName={name} />
      </div>
      {expiry.data?.expiry && (
        <div className="flex items-center gap-x-1 whitespace-pre-wrap">
          <Calendar className="size-5" />
          Expires{' '}
          <span className="font-medium">
            {formatDate(new Date(Number(expiry.data?.expiry) * 1000))}
          </span>
        </div>
      )}
      <div className="flex items-center gap-x-2">
        <Link
          className="underline underline-offset-2"
          params={{ name }}
          rel="noopener noreferrer"
          target="_blank"
          to="/p/$name"
        >
          app.ens.domains/p/{name}
        </Link>
        <CopyToClipboard
          className="size-4"
          value={`https://app.ens.domains/p/${name}`}
        />
      </div>
    </div>
  )
}
