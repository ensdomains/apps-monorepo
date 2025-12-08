import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Calendar, Wallet } from 'lucide-react'
import type { Address } from 'viem'
import { CopyToClipboard } from '@/components/atoms/CopyToClipboard'
import { Highlight } from '@/components/atoms/Highlight'
import { profileExpiryQuery } from '../../service/profileExpiry'
import { profileReverseNameQuery } from '../../service/profileReverseName'

interface OwnerLinkProps {
  address?: Address
  profileName: string
}

const OwnerLink = ({ address, profileName }: OwnerLinkProps) => {
  const ownerName = useQuery({
    ...profileReverseNameQuery(address),
  })

  if (!address) {
    return <span className="font-medium">{profileName}</span>
  }

  if (!ownerName.data) {
    return (
      <Link
        to="/p/$address"
        params={{ address: address }}
        className="font-medium underline underline-offset-2"
      >
        {address}
      </Link>
    )
  }

  if (ownerName.data === profileName) {
    return <span className="font-medium">{ownerName.data}</span>
  }

  return (
    <Link
      to="/p/$name"
      params={{ name: ownerName.data }}
      className="font-medium underline underline-offset-2"
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
    <div className="flex w-full flex-col items-start gap-3 bg-gray-100 px-4 pt-16 pb-4 text-center md:px-6 md:pt-16 md:pb-6 md:text-left">
      <Highlight className="text-lg md:text-2xl">{name}</Highlight>
      <div className="flex items-center gap-x-1 whitespace-pre-wrap">
        <Wallet className="size-5" />
        Owned by <OwnerLink address={owner} profileName={name} />
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
          to="/p/$name"
          target="_blank"
          rel="noopener noreferrer"
          params={{ name }}
          className="underline underline-offset-2"
        >
          app.ens.domains/p/{name}
        </Link>
        <CopyToClipboard
          value={`https://app.ens.domains/p/${name}`}
          className="size-4"
        />
      </div>
    </div>
  )
}
