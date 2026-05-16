import { Trans } from '@lingui/react/macro'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { match } from 'ts-pattern'
import { Calendar, Check, Clock, Copy, User } from 'lucide-react'
import { useState } from 'react'
import type { Address } from 'viem'
import { Highlight } from '@/components/atoms/Highlight'
import { PrimaryBadge } from '@/features/dashboard/components/PrimaryBadge'
import {
  getProfileNameExpiryStatus,
  profileExpiryQuery,
} from '../../service/profileExpiry'
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
  isInGrace?: boolean
}

export const ProfileHeaderInfo = ({
  name,
  owner,
  isInGrace: isInGraceProp = false,
}: ProfileHeaderInfoProps) => {
  const expiry = useSuspenseQuery({
    ...profileExpiryQuery(name),
  })

  const registration = useQuery({
    ...profileRegistrationQuery(name),
  })

  const ownerReverseName = useQuery({
    ...profileReverseNameQuery(owner),
  })

  const [copied, setCopied] = useState(false)
  const isPrimaryName = ownerReverseName.data === name

  const { isInGrace: isInGraceFromExpiry, displayExpiryDate } =
    getProfileNameExpiryStatus(expiry.data?.expiry, true)
  const isInGrace = isInGraceProp || isInGraceFromExpiry

  return (
    <div className="flex w-full flex-col items-start gap-3 bg-white px-4 pt-16 pb-4 md:px-6 md:pt-16 md:pb-6">
      <Highlight className="bg-(--theme-color) text-lg md:text-2xl">
        {name}
      </Highlight>
      {isPrimaryName && <PrimaryBadge />}
      {owner && (
        <button
          className="mt-3 flex cursor-pointer items-center gap-x-1 whitespace-pre-wrap text-sm transition-opacity hover:opacity-70"
          onClick={() => {
            navigator.clipboard.writeText(owner)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
          title="Copy address"
          type="button"
        >
          <User className="size-4" />
          {match(isInGrace)
            .with(true, () => <Trans>Previous owner</Trans>)
            .with(false, () => <Trans>Owned by</Trans>)
            .exhaustive()}{' '}
          <span className="font-medium">
            {ownerReverseName.data ??
              `${owner.slice(0, 6)}...${owner.slice(-4)}`}
          </span>
          {copied ? (
            <Check className="ml-1 size-3.5 text-green-600" />
          ) : (
            <Copy className="ml-1 size-3.5 text-muted-foreground" />
          )}
        </button>
      )}
      {registration.data?.registrationDate ? (
        <div className="flex items-center gap-x-1 whitespace-pre-wrap text-sm">
          <Calendar className="size-4" />
          Registered{' '}
          <span className="font-medium">
            {formatDate(new Date(registration.data.registrationDate * 1000))}
          </span>
        </div>
      ) : null}
      {displayExpiryDate ? (
        <div className="flex items-center gap-x-1 whitespace-pre-wrap text-sm">
          <Clock className="size-4" />
          <Trans>Expires</Trans>{' '}
          <span className="font-medium">{formatDate(displayExpiryDate)}</span>
        </div>
      ) : null}
    </div>
  )
}
