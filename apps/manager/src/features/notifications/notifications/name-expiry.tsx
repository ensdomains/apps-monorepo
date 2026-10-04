import type { PersonalNotificationPayloads } from '@ens-apps/shared-schema/notifications'
import { Link } from '@tanstack/react-router'
import { getNotificationActionButtonClass } from '@/features/notifications/shared/primitives'
import { NameCardTemplate } from '@/features/notifications/shared/templates'
import { isRenewableName } from '@/features/renew/utils/renewableName'
import { formatExpiryTime } from '@/utils/time'
import type { KindComponent } from './contracts'

type NameExpiryPayload = PersonalNotificationPayloads['name-expiry']

type NameExpiryPresentation = {
  description: string
  statusText: string
  action: 'renew' | 'register' | 'none'
}

/** The name one label up (`alice.eth` for `pay.alice.eth`), if any. */
const getParentName = (name: string): string | undefined => {
  const dot = name.indexOf('.')
  return dot === -1 || dot === name.length - 1 ? undefined : name.slice(dot + 1)
}

/**
 * Manager renews only `.eth` second-level names. Any other name with an
 * expiry, such as a subname, has no grace, and normally only the owner of its
 * parent can extend it.
 */
const getNonRenewablePresentation = (
  payload: NameExpiryPayload,
): NameExpiryPresentation => {
  const expiry = formatExpiryTime(payload.expiryDate)
  const parentName = getParentName(payload.name)
  if (parentName === undefined) {
    return {
      description: "This name can't be renewed in Manager.",
      statusText: expiry.text,
      action: 'none',
    }
  }

  const hasExpired = payload.stage
    ? payload.stage === 'expired'
    : expiry.isExpired
  return {
    description: `${hasExpired ? 'This name has expired.' : 'This name is expiring soon.'} The owner of ${parentName} can extend it.`,
    statusText: expiry.text,
    action: 'none',
  }
}

export const getNameExpiryStaticPresentation = (
  payload: NameExpiryPayload,
): NameExpiryPresentation => {
  if (!isRenewableName(payload.name)) {
    return getNonRenewablePresentation(payload)
  }

  switch (payload.stage) {
    case 'expiry-30d':
    case 'expiry-7d':
    case 'expiry-1d':
      return {
        description:
          'This name is expiring soon and should be renewed as soon as possible.',
        statusText: {
          'expiry-30d': '30 days before expiry',
          'expiry-7d': '7 days before expiry',
          'expiry-1d': '1 day before expiry',
        }[payload.stage],
        action: 'renew',
      }
    // Only names with no grace are sent `expired`; a `.eth` name's expiry
    // starts its grace.
    case 'expired':
    case 'grace-start':
      return {
        description:
          'This name has entered its grace period and can still be renewed.',
        statusText: 'Grace period started',
        action: 'renew',
      }
    case 'grace-7d':
    case 'grace-1d':
      return {
        description: 'This name’s grace period is ending soon.',
        statusText:
          payload.stage === 'grace-7d' ? '7 days remaining' : '1 day remaining',
        action: 'renew',
      }
    case 'premium-start':
      return {
        description:
          'This name’s grace period ended and its temporary premium period began.',
        statusText: 'Grace period ended',
        action: 'register',
      }
    default: {
      const expiry = formatExpiryTime(payload.expiryDate)
      return expiry.isExpired
        ? {
            description:
              'This name has expired and is now available to register.',
            statusText: expiry.text,
            action: 'register',
          }
        : {
            description:
              'This name is expiring soon and should be renewed as soon as possible.',
            statusText: expiry.text,
            action: 'renew',
          }
    }
  }
}

export const NameExpiryComponent: KindComponent<'name-expiry'> = ({
  payload,
  seen,
  timestamp,
  layout = 'default',
  onAction,
  onMarkAsRead,
  onRemove,
}) => {
  const presentation = getNameExpiryStaticPresentation(payload)
  const action =
    presentation.action === 'none' ? undefined : presentation.action ===
      'register' ? (
      <Link
        className={getNotificationActionButtonClass(layout)}
        onClick={onAction}
        params={{
          name: payload.name,
        }}
        to="/register/$name"
      >
        Register
      </Link>
    ) : (
      <Link
        className={getNotificationActionButtonClass(layout)}
        onClick={onAction}
        params={{
          name: payload.name,
        }}
        to="/renew/$name"
      >
        Renew
      </Link>
    )

  return (
    <NameCardTemplate
      action={action}
      category="Expiry"
      categoryTone="warning"
      description={presentation.description}
      layout={layout}
      name={payload.name}
      onMarkAsRead={onMarkAsRead}
      onRemove={onRemove}
      seen={seen}
      statusText={presentation.statusText}
      timestamp={timestamp}
    />
  )
}
