import { Calendar, CircleAlert } from 'lucide-react'
import { Highlight } from '@/components/atoms/Highlight'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { TIME_UNITS } from '@/utils/time'
import type { AutoRenewal } from '../MOCKS'

type ExpiryStatus = 'expired' | 'expires-very-soon' | 'expires-soon' | 'active'

const getExpiryStatus = (expires: number): ExpiryStatus => {
  const now = Date.now()
  const diff = expires - now
  if (diff < 0) return 'expired'
  if (diff < TIME_UNITS.DAY * 16) return 'expires-very-soon'
  if (diff < TIME_UNITS.DAY * 30) return 'expires-soon'
  return 'active'
}

const statusText = {
  expired: {
    text: 'Expired',
    variant: 'red',
  },
  'expires-very-soon': {
    text: 'Upcoming Renewal',
    variant: 'red',
  },
  'expires-soon': {
    text: 'Upcoming Renewal',
    variant: 'outline',
  },
  active: {
    text: 'Active',
    variant: 'gray',
  },
} as const

export const AutoRenewalItem = ({
  autoRenewal,
}: {
  autoRenewal: AutoRenewal
}) => {
  const status = getExpiryStatus(autoRenewal.expires)

  return (
    <div className="space-y-2 px-3 py-6 border border-gray-200 rounded-md">
      <div className="flex justify-between">
        <Highlight>{autoRenewal.name}</Highlight>
        <Badge variant={statusText[status].variant}>
          {statusText[status].text}
        </Badge>
      </div>
      <div className="flex items-center gap-1">
        <Calendar className="size-3 text-gray-500" />
        <span className="text-sm text-gray-500">Expires:</span>
        <span className="text-sm">
          {new Date(autoRenewal.expires).toLocaleDateString()}
        </span>
      </div>
      {autoRenewal.expires - Date.now() < TIME_UNITS.DAY * 16 && (
        <div className="text-sm text-red-600">
          {Math.floor((autoRenewal.expires - Date.now()) / TIME_UNITS.DAY)} days
          remaining
        </div>
      )}
      <div className="flex justify-end">
        <span className="text-sm text-gray-500">
          {autoRenewal.price} USD/year
        </span>
      </div>
      <div className="flex justify-end items-center gap-1">
        <span className="text-sm text-gray-500">Autorenews on</span>
        <span className="text-sm">
          {new Date(autoRenewal.expires - TIME_UNITS.DAY).toLocaleDateString()}
        </span>
        <Switch defaultChecked />
      </div>
    </div>
  )
}

export const NonAutoRenewalWarning = ({
  nonAutoRenewals,
}: {
  nonAutoRenewals: AutoRenewal[]
}) => {
  if (nonAutoRenewals.length === 0) return null
  return (
    <div className="bg-gray-200 rounded-md p-4 flex gap-4">
      <CircleAlert className="size-8" />
      <div className="text-gray-500">
        <div className="font-medium">
          {nonAutoRenewals.length} ENS names are expiring without auto-renewal
        </div>
        <div className="text-sm text-gray-500">
          {/* "erni.eth expires on July 10, 2025. Enable autorenewal or renew manually to avoid expiration." if only one name */}
          {nonAutoRenewals.length === 1 ? (
            <>
              {nonAutoRenewals[0].name} expires on{' '}
              <span className="font-medium">
                {new Date(nonAutoRenewals[0].expires).toLocaleDateString()}
              </span>
              . Enable auto-renewal or renew manually to avoid expiration.
            </>
          ) : (
            <>
              {nonAutoRenewals.join(', ')} are expiring without auto-renewal
              with the earliest expiring on{' '}
              <span className="font-medium">
                {new Date(nonAutoRenewals[0].expires).toLocaleDateString()}
              </span>
              . Enable auto-renewal or renew manually to avoid expiration.
            </>
          )}
        </div>
      </div>
    </div>
  )
}
