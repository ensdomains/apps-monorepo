import { primaryNameMachine } from '@ens-apps/transaction-manager'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useActorRef, useSelector } from '@xstate/react'
import { AlertCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Address, PublicClient } from 'viem'
import { getAddress } from 'viem'
import { useChainId } from 'wagmi'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useSmartAccountContext } from '@/lib/smart-account'
import { publicClient } from '@/lib/wagmi'
import { getProfileEthAddressSnapshot } from '../../service/profileEthAddress'
import { profileRecordsQuery } from '../../service/profileRecords'
import {
  getEthAddressFromRecords,
  handlePrimaryNameCancel,
  handleSetPrimaryName,
  hasMatchingEthAddress,
} from '../ProfileEdit.handlers'
import { saveRecords } from '../ProfileEdit.transactions'

interface SetPrimaryNameDialogProps {
  name: string
  owner?: Address
  onUpdated?: () => void
}

const usePrimaryNameSuccessRedirect = (params: {
  isSuccess: boolean
  name: string
  onUpdated?: () => void
  navigate: ReturnType<typeof useNavigate>
  setOpen: (open: boolean) => void
  queryClient: ReturnType<typeof useQueryClient>
}) => {
  const { t } = useLingui()
  const { isSuccess, name, navigate, onUpdated, setOpen, queryClient } = params

  useEffect(() => {
    if (!isSuccess) return

    queryClient.invalidateQueries({
      queryKey: $qk({ $scope: 'profile', $action: 'reverse_name' }),
    })
    onUpdated?.()
    setOpen(false)
    toast.success(t`Primary name set successfully`)
    navigate({ to: '/$name', params: { name } })
  }, [isSuccess, name, navigate, onUpdated, setOpen, queryClient, t])
}

export const SetPrimaryNameDialog = ({
  name,
  owner,
  onUpdated,
}: SetPrimaryNameDialogProps) => {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const account = useSmartAccountContext()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const chainId = useChainId()

  const primaryNameActor = useActorRef(primaryNameMachine, {
    input: { chainId },
  })

  const primaryNameState = useSelector(primaryNameActor, (state) => state)

  const isSubmitting =
    primaryNameState.matches('submittingUpdate') ||
    primaryNameState.matches('waitingForUpdate') ||
    primaryNameState.matches('submittingReverse') ||
    primaryNameState.matches('waitingForReverse')
  const isSuccess = primaryNameState.matches('success')
  const primaryNameErrorMessage = primaryNameState.matches('error')
    ? (primaryNameState.context.error?.message ??
      t`Failed to set primary name. Please try again.`)
    : undefined

  const { data: records, isLoading: isLoadingRecords } = useQuery({
    ...profileRecordsQuery(name),
    enabled: open,
  })

  usePrimaryNameSuccessRedirect({
    isSuccess,
    name,
    navigate,
    onUpdated,
    setOpen,
    queryClient,
  })

  const walletAddress = account.ownerAddress as Address | undefined
  const existingEthAddress = getEthAddressFromRecords(records)
  const indexerSaysMatch = hasMatchingEthAddress(records, walletAddress)
  const updateEthAddressMutation = useMutation({
    mutationFn: async () => {
      if (!walletAddress || !account.signer || !account.accountAddress) return

      const snapshot = await getProfileEthAddressSnapshot(
        name,
        records?.resolverAddress as Address | undefined,
      )

      if (snapshot.isErr()) {
        throw new Error(t`Could not read ETH address record for ${name}`)
      }

      const { resolverAddress, ethAddress } = snapshot.value
      if (!resolverAddress) {
        throw new Error(t`Could not find resolver for ${name}`)
      }

      if (ethAddress?.toLowerCase() === walletAddress.toLowerCase()) return

      await saveRecords({
        name,
        before: {
          texts: [],
          coins: ethAddress ? [{ coinType: 60, value: ethAddress }] : [],
        },
        after: {
          texts: [],
          coins: [{ coinType: 60, value: getAddress(walletAddress) }],
        },
        signer: account.signer,
        accountAddress: account.accountAddress,
        publicClient: publicClient as PublicClient,
        chainId,
        resolverAddress,
      })
    },
    onError: (error) => {
      console.error('Failed to set ETH address record:', error)
      toast.error(error.message || t`Failed to set ETH address record`)
    },
  })

  const needsEthAddressUpdate = open && !isLoadingRecords && !indexerSaysMatch

  const handleSave = async () => {
    if (walletAddress) {
      if (!account.signer || !account.accountAddress) {
        toast.error(t`Wallet signer not available`)
        return
      }

      try {
        await updateEthAddressMutation.mutateAsync()
      } catch {
        return
      }
    }

    handleSetPrimaryName(
      { name, owner },
      {
        account,
        primaryNameActor,
        publicClient: publicClient as PublicClient,
      },
    )
  }

  const handleCancel = () => {
    setOpen(false)
    handlePrimaryNameCancel(primaryNameActor)
  }

  const triggerButton = (
    <Button className="w-full" variant="outline">
      <Trans>Set Primary Name</Trans>
    </Button>
  )

  const content = (
    <>
      <p className="text-muted-foreground text-sm">
        <Trans>
          This will set <span className="font-mono">{name}</span> as your
          primary ENS name for this account, so compatible apps and wallets can
          display it as your default identity.
        </Trans>
      </p>
      {primaryNameErrorMessage && (
        <div
          className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700"
          role="alert"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600" />
          <p className="text-sm">{primaryNameErrorMessage}</p>
        </div>
      )}
      {needsEthAddressUpdate && walletAddress && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div className="text-amber-800 text-sm">
            <p>
              {existingEthAddress ? (
                <Trans>
                  The ETH address record does not match your wallet. If you
                  proceed, it will be updated to your current wallet address and
                  this name will be set as your primary name.
                </Trans>
              ) : (
                <Trans>
                  No ETH address record set. If you proceed, your current wallet
                  address will be set as the ETH address and this name will be
                  set as your primary name.
                </Trans>
              )}
            </p>
            <div className="mt-2 rounded-md bg-amber-100/60 px-2.5 py-1.5">
              <p className="break-all font-mono text-amber-900 text-xs">
                {walletAddress}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )

  const isBusy =
    isSubmitting || updateEthAddressMutation.isPending || isLoadingRecords

  const footer = (
    <>
      <Button disabled={isBusy} onClick={handleCancel} variant="outline">
        <Trans>Cancel</Trans>
      </Button>
      <Button disabled={isBusy} onClick={handleSave}>
        {updateEthAddressMutation.isPending ? (
          <Trans>Setting ETH address…</Trans>
        ) : isSubmitting ? (
          <Trans>Setting…</Trans>
        ) : (
          <Trans>Set as Primary</Trans>
        )}
      </Button>
    </>
  )

  if (isDesktop) {
    return (
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogTrigger asChild>{triggerButton}</DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              <Trans>Set Primary Name</Trans>
            </DialogTitle>
          </DialogHeader>
          {content}
          <DialogFooter>{footer}</DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer onOpenChange={setOpen} open={open}>
      <DrawerTrigger asChild>{triggerButton}</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>
            <Trans>Set Primary Name</Trans>
          </DrawerTitle>
        </DrawerHeader>
        <div className="px-4">{content}</div>
        <DrawerFooter>{footer}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
