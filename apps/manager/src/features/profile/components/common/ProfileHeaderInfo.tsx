import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Calendar, Clock, User } from 'lucide-react'
import type { Address } from 'viem'
import { Highlight } from '@/components/atoms/Highlight'
import { PrimaryBadge } from '@/features/dashboard/components/PrimaryBadge'
import { profileExpiryQuery } from '../../service/profileExpiry'
import { profileRegistrationQuery } from '../../service/profileRegistration'
import { profileReverseNameQuery } from '../../service/profileReverseName'

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

  const registration = useQuery({
    ...profileRegistrationQuery(name),
  })

  const ownerReverseName = useQuery({
    ...profileReverseNameQuery(owner),
  })

  const isPrimaryName = ownerReverseName.data === name

  return (
    <div className="flex w-full flex-col items-start gap-3 bg-white px-4 pt-16 pb-4 md:px-6 md:pt-16 md:pb-6">
      <Highlight className="text-lg md:text-2xl">{name}</Highlight>
      {isPrimaryName && <PrimaryBadge />}
      {owner && (
        <div className="mt-3 flex items-center gap-x-1 whitespace-pre-wrap text-sm">
          <User className="size-4" />
          Owned by{' '}
          <span className="font-medium">
            {ownerReverseName.data ??
              `${owner.slice(0, 6)}...${owner.slice(-4)}`}
          </span>
        </div>
      )}
      {registration.data?.registrationDate && (
        <div className="flex items-center gap-x-1 whitespace-pre-wrap text-sm">
          <Calendar className="size-4" />
          Registered{' '}
          <span className="font-medium">
            {formatDate(new Date(registration.data.registrationDate * 1000))}
          </span>
        </div>
      )}
      {expiry.data?.expiry && (
        <div className="flex items-center gap-x-1 whitespace-pre-wrap text-sm">
          <Clock className="size-4" />
          Expires{' '}
          <span className="font-medium">
            {formatDate(new Date(Number(expiry.data?.expiry) * 1000))}
          </span>
        </div>
      )}
    </div>
  )
}
