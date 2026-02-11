import { primaryNameMachine } from '@ens-apps/transaction-manager'
import { useQuery } from '@tanstack/react-query'
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
  handlePrimaryNameCancel,
  handleSetPrimaryName,
  hasEthAddressRecord,
} from '../ProfileEdit.handlers'
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
}) {
  const { isSuccess, name, navigate, onUpdated, setOpen } = params

  useEffect(() => {
    if (!isSuccess) return

    onUpdated?.()
    setOpen(false)
    toast.success('Primary name set successfully')
    navigate({ to: '/p/$name', params: { name } })
  }, [isSuccess, name, navigate, onUpdated, setOpen])
}

export const SetPrimaryNameDialog = ({
  name,
  owner,
  onUpdated,
}: SetPrimaryNameDialogProps) => {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
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
  const showNoEthWarning =
    open && !isLoadingRecords && !hasEthAddressRecord(records)

  usePrimaryNameSuccessRedirect({
    isSuccess,
    name,
    navigate,
    onUpdated,
    setOpen,
  })

  const handleSave = () => {
    handleSetPrimaryName(
      { name, owner },
      {
        account,
        primaryNameActor,
        publicClient: publicClient as PublicClient,
        records,
      },
    )
  }

  const handleCancel = () => {
    setOpen(false)
    handlePrimaryNameCancel(primaryNameActor)
  }

  const triggerButton = <Button variant="outline">Set Primary Name</Button>

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
      {showNoEthWarning && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600" />
          <p className="text-red-800 text-sm">
            This name doesn&apos;t have an ETH address record set. Please add
            one before setting it as your primary name.
          </p>
        </div>
      )}
    </>
  )

  const footer = (
    <>
      <Button disabled={isSubmitting} onClick={handleCancel} variant="outline">
        Cancel
      </Button>
      <Button disabled={isSubmitting || showNoEthWarning} onClick={handleSave}>
        {isSubmitting ? 'Setting…' : 'Set as Primary'}
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
