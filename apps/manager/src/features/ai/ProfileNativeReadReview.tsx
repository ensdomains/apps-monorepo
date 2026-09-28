import { Trans } from '@lingui/react/macro'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { getConnection } from '@wagmi/core'
import { type ReactNode, useState, useSyncExternalStore } from 'react'
import { useConnection } from 'wagmi'
import { CopyableButton } from '@/components/atoms/CopyableButton'
import { Button } from '@/components/ui/button'
import {
  getPreferenceSession,
  subscribePreferenceSession,
} from '@/features/notifications/services/preferenceSession'
import { profileOwnerQuery } from '@/features/profile/service/profileOwner'
import { profileReverseNameStrictQuery } from '@/features/profile/service/profileReverseName'
import { useSmartAccountContext } from '@/lib/smart-account'
import { wagmiConfig } from '@/lib/wagmi'
import type { PreparedManagerAction } from './managerActions'
import {
  loadPrimaryProfile,
  loadProfileOwner,
  matchesPrimaryProfileWallet,
} from './profileNativeRead'

const Status = ({ children }: { readonly children: ReactNode }) => (
  <p className="text-ens-quartz-500 text-sm" role="status">
    {children}
  </p>
)

export const ProfileNativeReadReview = ({
  action,
  onClose,
}: {
  readonly action: PreparedManagerAction
  readonly onClose: () => void
}) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { address } = useConnection()
  const { ownerAddress } = useSmartAccountContext()
  const currentSession = useSyncExternalStore(
    subscribePreferenceSession,
    getPreferenceSession,
    getPreferenceSession,
  )
  const [origin] = useState(() => ({
    session: getPreferenceSession(),
    walletAddress: address,
    reverseAddress: ownerAddress ?? address,
  }))
  const current =
    currentSession.id === origin.session.id &&
    address === origin.walletAddress &&
    (ownerAddress ?? address) === origin.reverseAddress
  const isCurrent = () =>
    getPreferenceSession().id === origin.session.id &&
    getConnection(wagmiConfig).address === origin.walletAddress &&
    (action.kind !== 'view_primary_profile' ||
      matchesPrimaryProfileWallet(
        getConnection(wagmiConfig).address,
        origin.reverseAddress,
      ))
  const assertCurrent = () => {
    origin.session.assertCurrent()
    if (!isCurrent()) throw new Error('The connected wallet changed.')
  }
  const result = useQuery({
    queryKey: [
      'ai-profile-native-read',
      origin.session.id,
      action.kind,
      action.name,
      origin.reverseAddress,
    ],
    enabled: current,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      if (action.kind === 'view_primary_profile') {
        const primary = await loadPrimaryProfile(origin.reverseAddress, {
          assertCurrent,
          readPrimaryName: (target) =>
            queryClient.fetchQuery({
              ...profileReverseNameStrictQuery(target),
              staleTime: 0,
            }),
        })
        return { ...primary, kind: 'primary' as const }
      }
      const owner = await loadProfileOwner(action.name ?? '', {
        assertCurrent,
        readOwner: (name) =>
          queryClient.fetchQuery({
            ...profileOwnerQuery(name),
            staleTime: 0,
          }),
      })
      return { ...owner, kind: 'owner' as const }
    },
  })
  if (!current)
    return (
      <Status>
        <Trans>Your sign-in changed. Start this request again.</Trans>
      </Status>
    )
  if (result.isPending || result.isFetching)
    return (
      <Status>
        <Trans>Reading the current profile…</Trans>
      </Status>
    )
  if (result.isError || !result.data)
    return (
      <Status>
        <Trans>
          The current profile could not be loaded. Close this dialog and try
          again.
        </Trans>
      </Status>
    )
  if (result.data.status !== 'ready')
    return <Status>{result.data.message}</Status>
  const ready = result.data
  return (
    <>
      <p className="break-all font-medium">{ready.name}</p>
      {ready.kind === 'owner' ? (
        <>
          <p className="text-ens-quartz-500 text-sm">
            <Trans>Current owner</Trans>
          </p>
          <p className="break-all font-mono text-sm">{ready.address}</p>
          {action.kind === 'copy_profile_owner' && (
            <CopyableButton
              onClick={(event) => {
                if (!isCurrent()) event.preventDefault()
              }}
              value={ready.address}
            >
              <Trans>Copy owner address</Trans>
            </CopyableButton>
          )}
        </>
      ) : (
        <Button
          onClick={() => {
            if (!isCurrent()) return
            onClose()
            void navigate({ to: '/$name', params: { name: ready.name } })
          }}
          variant="lightBlue"
        >
          <Trans>Open primary-name profile</Trans>
        </Button>
      )}
    </>
  )
}
