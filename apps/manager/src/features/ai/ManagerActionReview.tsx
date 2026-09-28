import { Trans } from '@lingui/react/macro'
import { useFeatureFlagEnabled } from '@posthog/react'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useAtom } from '@xstate/store-react'
import {
  type ReactNode,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react'
import { useConnection } from 'wagmi'
import { CopyableButton } from '@/components/atoms/CopyableButton'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { removeFavoriteMutationOptions } from '@/features/dashboard/service/mutations/removeFavorite'
import { favoritesQueryOptions } from '@/features/dashboard/service/queries/getFavorites'
import { buildCommemorativeNftCardData } from '@/features/migration/commemorative-nft/cardData'
import { useCommemorativeNftOffer } from '@/features/migration/commemorative-nft/useCommemorativeNftOffer'
import { useVerifiedCommemorativeNftOwner } from '@/features/migration/commemorative-nft/useVerifiedCommemorativeNftOwner'
import { MigrationApprovalSettings } from '@/features/migration/components/MigrationApprovalSettings'
import { CommemorativeNftCard } from '@/features/migration/components/success/CommemorativeNftCard'
import { CommemorativeNftClaimDialog } from '@/features/migration/components/success/CommemorativeNftClaimDialog'
import { useNftAssetDownload } from '@/features/migration/components/success/useNftAssetDownload'
import {
  type Channel,
  channelsQueryOptions,
} from '@/features/notifications/data/queries/channels'
import {
  markAllNotificationsReadMutationOptions,
  notificationsInfiniteQuery,
} from '@/features/notifications/data/queries/notifications'
import { selectUnreadNotifications } from '@/features/notifications/data/readSelection'
import {
  getPreferenceSession,
  subscribePreferenceSession,
} from '@/features/notifications/services/preferenceSession'
import { EmailContactMethod } from '@/features/notifications/settings/contact-methods/email'
import { PushContactMethod } from '@/features/notifications/settings/contact-methods/push'
import { TelegramContactMethod } from '@/features/notifications/settings/contact-methods/telegram'
import { ShareProfileDialog } from '@/features/profile/components/dialogs/ShareProfileDialog'
import { buildNameAvatarUrl } from '@/features/profile/service/profileAvatar'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { transformProfileRecords } from '@/features/profile/utils/transformRecords'
import { useCopyFeedback } from '@/hooks/useCopyFeedback'
import { loadCatalog, setLocale } from '@/lib/locale'
import { LOCALES } from '@/lib/locales.config'
import { POSTHOG_FEATURE_FLAGS } from '@/lib/posthog/feature-flags'
import { useMigrationNftEnabled } from '@/lib/posthog/useMigrationNftEnabled'
import { useWalletDisconnect } from '@/lib/wallet'
import { isBackendAuthed } from '@/utils/backend-client'
import {
  getManagerActionTitle,
  type NotificationTag,
  type PreparedManagerAction,
} from './managerActions'
import { ProfileNativeReadReview } from './ProfileNativeReadReview'
import { loadProfileAddressCopy } from './profileAddressCopy'

const Status = ({ children }: { readonly children: ReactNode }) => (
  <p className="text-ens-quartz-500 text-sm" role="status">
    {children}
  </p>
)

const FavoriteRemoval = ({ name }: { readonly name: string }) => {
  const favorites = useQuery(favoritesQueryOptions)
  const remove = useMutation(removeFavoriteMutationOptions)
  if (favorites.isPending)
    return (
      <Status>
        <Trans>Checking favourites…</Trans>
      </Status>
    )
  if (favorites.isError)
    return (
      <Status>
        <Trans>
          Favourites could not be loaded. Close this dialog and try again.
        </Trans>
      </Status>
    )
  const exists = favorites.data.some(
    (entry) => entry.name.toLowerCase() === name.toLowerCase(),
  )
  if (!exists || remove.isSuccess)
    return (
      <Status>
        <Trans>{name} is not in your favourites.</Trans>
      </Status>
    )
  return (
    <>
      <p>
        <Trans>Remove {name} from your favourites?</Trans>
      </p>
      <Button
        disabled={remove.isPending}
        onClick={() => remove.mutate({ name })}
        variant="lightBlue"
      >
        <Trans>Remove favourite</Trans>
      </Button>
      {remove.isError && (
        <Status>
          <Trans>The favourite could not be removed. Try again.</Trans>
        </Status>
      )}
    </>
  )
}

const ProfileAddressCopyReview = ({
  action,
}: {
  readonly action: PreparedManagerAction
}) => {
  const queryClient = useQueryClient()
  const currentSession = useSyncExternalStore(
    subscribePreferenceSession,
    getPreferenceSession,
    getPreferenceSession,
  )
  const [session] = useState(getPreferenceSession)
  const current = currentSession.id === session.id
  const name = action.name ?? ''
  const address = useQuery({
    queryKey: [
      'ai-profile-address-copy',
      session.id,
      name,
      action.addressCoinType,
      action.mainReceivingAddress,
    ],
    enabled: current && !!name,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: () =>
      loadProfileAddressCopy(
        { ...action, name },
        {
          assertCurrent: session.assertCurrent,
          readRecords: async (targetName) =>
            transformProfileRecords(
              await queryClient.fetchQuery({
                ...profileRecordsQuery(targetName),
                staleTime: 0,
              }),
            ),
        },
      ),
  })
  if (!current)
    return (
      <Status>
        <Trans>Your sign-in changed. Start this address request again.</Trans>
      </Status>
    )
  if (address.isPending || address.isFetching)
    return (
      <Status>
        <Trans>Reading the current profile address…</Trans>
      </Status>
    )
  if (address.isError || !address.data)
    return (
      <Status>
        <Trans>
          The profile address could not be loaded. Close this dialog and try
          again.
        </Trans>
      </Status>
    )
  if (address.data.status !== 'ready')
    return <Status>{address.data.message}</Status>
  return (
    <>
      <p>
        {name} · {address.data.network}
      </p>
      <p className="break-all font-mono text-sm">{address.data.value}</p>
      <CopyableButton
        onClick={(event) => {
          if (getPreferenceSession().id !== session.id) event.preventDefault()
        }}
        value={address.data.value}
      >
        <Trans>Copy address</Trans>
      </CopyableButton>
    </>
  )
}

const EmailChannelReview = ({
  action,
  email,
}: {
  readonly action: PreparedManagerAction
  readonly email?: Channel
}) => {
  switch (action.kind) {
    case 'email_add':
      return email ? (
        <Status>
          <Trans>
            An email contact method already exists: {email.label}. Remove it
            first to add a different email.
          </Trans>
        </Status>
      ) : (
        <EmailContactMethod proposedEmail={action.email} />
      )
    case 'email_remove':
    case 'email_resend':
      if (!email)
        return (
          <Status>
            <Trans>No email contact method is configured.</Trans>
          </Status>
        )
      if (
        action.email &&
        action.email.toLowerCase() !== email.label.toLowerCase()
      )
        return (
          <Status>
            <Trans>
              The requested email does not match your current contact method.
            </Trans>
          </Status>
        )
      if (action.kind === 'email_resend' && email.status !== 'pending')
        return (
          <Status>
            <Trans>This email is already verified.</Trans>
          </Status>
        )
      return (
        <EmailContactMethod
          email={email}
          proposedAction={action.kind === 'email_remove' ? 'remove' : 'resend'}
        />
      )
    default:
      return null
  }
}

const NotificationChannelReview = ({
  action,
}: {
  readonly action: PreparedManagerAction
}) => {
  const channels = useQuery(channelsQueryOptions)
  if (channels.isPending)
    return (
      <Status>
        <Trans>Loading contact methods…</Trans>
      </Status>
    )
  if (channels.isError)
    return (
      <Status>
        <Trans>
          Contact methods could not be loaded. Close this dialog and try again.
        </Trans>
      </Status>
    )
  const email = channels.data.find((channel) => channel.channel === 'email')
  const telegram = channels.data.find(
    (channel) => channel.channel === 'telegram',
  )
  switch (action.kind) {
    case 'email_add':
    case 'email_remove':
    case 'email_resend':
      return <EmailChannelReview action={action} email={email} />
    case 'telegram_connect':
      return <TelegramContactMethod proposedConnection telegram={telegram} />
    case 'telegram_remove':
      return telegram ? (
        <TelegramContactMethod proposedRemoval telegram={telegram} />
      ) : (
        <Status>
          <Trans>No Telegram contact method is configured.</Trans>
        </Status>
      )
    default:
      return (
        <>
          <Status>
            {action.kind === 'push_enable' ? (
              <Trans>
                Review this browser's permission and enable notifications below.
              </Trans>
            ) : (
              <Trans>
                Review disabling notifications for this browser below.
              </Trans>
            )}
          </Status>
          <PushContactMethod
            proposedEnabled={action.kind === 'push_enable'}
            pushChannels={channels.data.filter(
              (channel) => channel.channel === 'push',
            )}
          />
        </>
      )
  }
}

const NotificationReadReview = ({
  tag = 'all',
}: {
  readonly tag?: NotificationTag
}) => {
  const notifications = useInfiniteQuery(notificationsInfiniteQuery)
  const markRead = useMutation(markAllNotificationsReadMutationOptions)
  const selected = selectUnreadNotifications(notifications.data ?? [], tag)
  const count = selected.length
  return (
    <>
      <Status>
        <Trans>
          Mark {count} loaded unread notifications as read. Notifications that
          have not been loaded are not included.
        </Trans>
      </Status>
      {tag !== 'all' && (
        <Status>
          <Trans>Only the {tag} category is included.</Trans>
        </Status>
      )}
      <Button
        disabled={
          notifications.isPending ||
          notifications.isError ||
          count === 0 ||
          markRead.isPending
        }
        onClick={() => markRead.mutate(selected)}
        variant="lightBlue"
      >
        <Trans>Mark loaded notifications as read</Trans>
      </Button>
      {(notifications.isError || markRead.isError) && (
        <Status>
          <Trans>Notifications could not be updated. Try again.</Trans>
        </Status>
      )}
    </>
  )
}

const WalletReview = ({ disconnect }: { readonly disconnect: boolean }) => {
  const { address } = useConnection()
  const wallet = useWalletDisconnect()
  const { copied, copy } = useCopyFeedback()
  const [failed, setFailed] = useState(false)
  if (!address)
    return (
      <Status>
        <Trans>No wallet is connected.</Trans>
      </Status>
    )
  return (
    <>
      <p className="break-all font-mono text-sm">{address}</p>
      <Button
        disabled={wallet.isDisconnecting}
        onClick={() => {
          setFailed(false)
          if (disconnect) void wallet.disconnect().catch(() => setFailed(true))
          else void copy(address)
        }}
        variant="lightBlue"
      >
        {disconnect ? (
          <Trans>Disconnect wallet</Trans>
        ) : copied ? (
          <Trans>Copied</Trans>
        ) : (
          <Trans>Copy address</Trans>
        )}
      </Button>
      {failed && (
        <Status>
          <Trans>The wallet could not be disconnected. Try again.</Trans>
        </Status>
      )}
    </>
  )
}

const LanguageReview = ({
  action,
}: {
  readonly action: PreparedManagerAction
}) => {
  const enabled = useFeatureFlagEnabled(POSTHOG_FEATURE_FLAGS.I18N, false)
  const save = useMutation({
    mutationFn: async () => {
      if (!action.locale) throw new Error('Choose a supported language.')
      await Promise.all([loadCatalog(action.locale), setLocale(action.locale)])
    },
  })
  if (!enabled)
    return (
      <Status>
        <Trans>
          Changing the interface language is not enabled for this session.
        </Trans>
      </Status>
    )
  if (!action.locale)
    return (
      <Status>
        <Trans>Choose a supported language first.</Trans>
      </Status>
    )
  return (
    <>
      <p>
        <Trans>Switch Manager to {LOCALES[action.locale]}?</Trans>
      </p>
      <Button
        disabled={save.isPending || save.isSuccess}
        onClick={() => save.mutate()}
        variant="lightBlue"
      >
        <Trans>Change language</Trans>
      </Button>
      {save.isError && (
        <Status>
          <Trans>The language could not be changed. Try again.</Trans>
        </Status>
      )}
      {save.isSuccess && (
        <Status>
          <Trans>Language changed.</Trans>
        </Status>
      )}
    </>
  )
}

const NftReview = ({ action }: { readonly action: PreparedManagerAction }) => {
  const ownerAddress = useVerifiedCommemorativeNftOwner()
  const offer = useCommemorativeNftOffer({ ownerAddress, enabled: true })
  const eligibility = offer.visibleEligibility
  const card =
    eligibility && offer.minted
      ? buildCommemorativeNftCardData({
          chainId: offer.availability.chainId,
          eligibility,
          minted: true,
          ownerAddress: eligibility.ownerAddress,
        })
      : undefined
  const { download, pending } = useNftAssetDownload(card?.assets.imageUrl)
  const { copied, copy } = useCopyFeedback()
  if (!ownerAddress)
    return (
      <Status>
        <Trans>Reconnect the owner wallet to view its NFT.</Trans>
      </Status>
    )
  if (
    offer.availability.claimed.isPending ||
    offer.availability.eligibility.isPending
  )
    return (
      <Status>
        <Trans>Checking your NFT…</Trans>
      </Status>
    )
  if (!card)
    return (
      <Status>
        <Trans>
          No minted commemorative NFT is available for this account.
        </Trans>
      </Status>
    )
  return (
    <>
      <CommemorativeNftCard
        state={{ status: 'minted', card }}
        variant="dashboard"
      />
      {action.kind === 'nft_share' && action.shareTarget === 'link' && (
        <Button
          disabled={!card.shareUrls.external}
          onClick={() => {
            if (card.shareUrls.external) void copy(card.shareUrls.external)
          }}
          variant="lightBlue"
        >
          {copied ? <Trans>Copied</Trans> : <Trans>Copy NFT link</Trans>}
        </Button>
      )}
      {action.kind === 'nft_share' &&
        (action.shareTarget === 'x' || action.shareTarget === 'telegram') && (
          <Button asChild variant="lightBlue">
            <a
              href={card.shareUrls[action.shareTarget]}
              rel="noreferrer"
              target="_blank"
            >
              {action.shareTarget === 'x' ? (
                <Trans>Share on X</Trans>
              ) : (
                <Trans>Share on Telegram</Trans>
              )}
            </a>
          </Button>
        )}
      {action.kind === 'nft_download' && (
        <Button
          disabled={!card.assets.imageUrl || pending}
          onClick={() => void download()}
          variant="lightBlue"
        >
          <Trans>Download WebP artwork</Trans>
        </Button>
      )}
    </>
  )
}

const ReviewContent = ({
  action,
  onClose,
}: {
  readonly action: PreparedManagerAction
  readonly onClose: () => void
}) => {
  switch (action.kind) {
    case 'copy_profile_owner':
    case 'view_profile_owner':
    case 'view_primary_profile':
      return <ProfileNativeReadReview action={action} onClose={onClose} />
    case 'copy_profile_address':
      return <ProfileAddressCopyReview action={action} />
    case 'unfavorite':
      return action.name ? <FavoriteRemoval name={action.name} /> : null
    case 'email_add':
    case 'email_remove':
    case 'email_resend':
    case 'telegram_connect':
    case 'telegram_remove':
    case 'push_enable':
    case 'push_disable':
      return <NotificationChannelReview action={action} />
    case 'mark_notifications_read':
      return <NotificationReadReview tag={action.notificationTag} />
    case 'migration_revoke':
      return <MigrationApprovalSettings proposedApproval={action.approval} />
    case 'wallet_copy':
    case 'wallet_disconnect':
      return <WalletReview disconnect={action.kind === 'wallet_disconnect'} />
    case 'language':
      return <LanguageReview action={action} />
    case 'nft_view':
    case 'nft_share':
    case 'nft_download':
      return <NftReview action={action} />
    default:
      return null
  }
}

export const ManagerActionReview = ({
  action,
  onClose,
}: {
  readonly action: PreparedManagerAction
  readonly onClose: () => void
}) => {
  const { address } = useConnection()
  const [originalAddress] = useState(address)
  const authenticated = useAtom(isBackendAuthed)
  const ownerAddress = useVerifiedCommemorativeNftOwner()
  const nftEnabled = useMigrationNftEnabled()
  const navigate = useNavigate()
  const current = address === originalAddress && authenticated
  useEffect(() => {
    if (!current) onClose()
  }, [current, onClose])
  if (!current) return null
  if (
    (action.kind === 'share_profile' || action.kind === 'copy_profile') &&
    action.name
  ) {
    return (
      <ShareProfileDialog
        avatarUrl={buildNameAvatarUrl(action.name)}
        name={action.name}
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        open
        url={`/${encodeURIComponent(action.name)}`}
      />
    )
  }
  if (action.kind === 'nft_claim' && nftEnabled) {
    return (
      <CommemorativeNftClaimDialog
        context="mint-later"
        onClose={onClose}
        onOpenDashboard={() => {
          onClose()
          void navigate({ to: '/dashboard' })
        }}
        open
        ownerAddress={ownerAddress}
      />
    )
  }
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      open
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{getManagerActionTitle(action)}</DialogTitle>
        </DialogHeader>
        {action.kind.startsWith('nft_') && !nftEnabled ? (
          <Status>
            <Trans>Commemorative NFTs are not enabled for this session.</Trans>
          </Status>
        ) : (
          <ReviewContent action={action} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  )
}
