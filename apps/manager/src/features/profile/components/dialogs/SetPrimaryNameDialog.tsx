import { primaryNameMachine } from '@ens-apps/transaction-manager'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useActorRef, useSelector } from '@xstate/react'
import { AlertCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Address, PublicClient } from 'viem'
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
import { customSepolia, publicClient } from '@/lib/wagmi'
import { profileRecordsQuery } from '../../service/profileRecords'
import {
  getEthAddressFromRecords,
  handlePrimaryNameCancel,
  handleSetPrimaryName,
  hasMatchingEthAddress,
} from '../ProfileEdit.handlers'
import { saveRecords } from '../ProfileEdit.transactions'
import { UpdateStatusPanel } from './UpdateStatusPanel'

interface SetPrimaryNameDialogProps {
  name: string
  owner?: Address
  onUpdated?: () => void
}

function usePrimaryNameSuccessRedirect(params: {
  isSuccess: boolean
  name: string
  onUpdated?: () => void
  navigate: ReturnType<typeof useNavigate>
  setOpen: (open: boolean) => void
  queryClient: ReturnType<typeof useQueryClient>
}) {
  const { isSuccess, name, navigate, onUpdated, setOpen, queryClient } = params

  useEffect(() => {
    if (!isSuccess) return

    queryClient.invalidateQueries({
      queryKey: $qk({ $scope: 'profile', $action: 'reverse_name' }),
    })
    onUpdated?.()
    setOpen(false)
    toast.success('Primary name set successfully')
    navigate({ to: '/p/$name', params: { name } })
  }, [isSuccess, name, navigate, onUpdated, setOpen, queryClient])
}

export const SetPrimaryNameDialog = ({
  name,
  owner,
  onUpdated,
}: SetPrimaryNameDialogProps) => {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const account = useSmartAccountContext()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const primaryNameActor = useActorRef(primaryNameMachine, {
    input: { chainId: customSepolia.id },
  })

  const primaryNameState = useSelector(primaryNameActor, (state) => state)

  const txHash = primaryNameState.context.txHash
  const isSubmitting =
    primaryNameState.matches('submittingUpdate') ||
    primaryNameState.matches('waitingForUpdate')
  const isSuccess = primaryNameState.matches('success')
  const isError = primaryNameState.matches('error')
  const machineErrorMessage =
    (isError &&
      primaryNameState.context.error &&
      primaryNameState.context.error.message) ||
    (isError && 'Failed to set primary name') ||
    undefined

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
  const needsEthAddressUpdate =
    open && !isLoadingRecords && !hasMatchingEthAddress(records, walletAddress)
  const updateEthAddressMutation = useMutation({
    mutationFn: async () => {
      if (!walletAddress || !account.signer || !account.accountAddress) return

      await saveRecords({
        name,
        before: {
          texts: [],
          coins: existingEthAddress
            ? [{ coinType: 60, value: existingEthAddress }]
            : [],
        },
        after: { texts: [], coins: [{ coinType: 60, value: walletAddress }] },
        signer: account.signer,
        accountAddress: account.accountAddress,
        publicClient: publicClient as PublicClient,
        chainId: customSepolia.id,
        resolverAddress: records?.resolverAddress,
      })
    },
    onError: (error) => {
      console.error('Failed to set ETH address record:', error)
      toast.error('Failed to set ETH address record')
    },
  })

  const handleSave = async () => {
    if (needsEthAddressUpdate && walletAddress) {
      if (!account.signer || !account.accountAddress) {
        toast.error('Wallet signer not available')
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
      Set Primary Name
    </Button>
  )

  const content = (
    <>
      <UpdateStatusPanel
        errorMessage={machineErrorMessage}
        isSaving={isSubmitting}
        isSuccess={isSuccess}
        txHash={txHash}
      />
      <p className="text-muted-foreground text-sm">
        This will set <span className="font-mono">{name}</span> as your primary
        ENS name for this account, so compatible apps and wallets can display it
        as your default identity.
      </p>
      {needsEthAddressUpdate && walletAddress && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div className="text-amber-800 text-sm">
            <p>
              {existingEthAddress
                ? 'The ETH address record does not match your wallet. If you proceed, it will be updated to your current wallet address and this name will be set as your primary name.'
                : 'No ETH address record set. If you proceed, your current wallet address will be set as the ETH address and this name will be set as your primary name.'}
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

  const isBusy = isSubmitting || updateEthAddressMutation.isPending

  const footer = (
    <>
      <Button disabled={isBusy} onClick={handleCancel} variant="outline">
        Cancel
      </Button>
      <Button disabled={isBusy} onClick={handleSave}>
        {updateEthAddressMutation.isPending
          ? 'Setting ETH address…'
          : isSubmitting
            ? 'Setting…'
            : 'Set as Primary'}
      </Button>
    </>
  )

  if (isDesktop) {
    return (
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogTrigger asChild>{triggerButton}</DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set Primary Name</DialogTitle>
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
          <DrawerTitle>Set Primary Name</DrawerTitle>
        </DrawerHeader>
        <div className="px-4">{content}</div>
        <DrawerFooter>{footer}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
