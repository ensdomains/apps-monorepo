import { primaryNameMachine } from '@ens-apps/transaction-manager'
import { useNavigate } from '@tanstack/react-router'
import { useActorRef, useSelector } from '@xstate/react'
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
import { useSmartAccountContext } from '@/lib/smart-account'
import { customSepolia, publicClient } from '@/lib/wagmi'
import {
  handlePrimaryNameCancel,
  handleSetPrimaryName,
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
      },
    )
  }

  const handleCancel = () => {
    setOpen(false)
    handlePrimaryNameCancel(primaryNameActor)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button className="w-full" variant="outline">
          Set Primary Name
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Set Primary Name</DialogTitle>
        </DialogHeader>

        <UpdateStatusPanel
          errorMessage={machineErrorMessage}
          isSaving={isSubmitting}
          isSuccess={isSuccess}
          txHash={txHash}
        />

        <p className="text-muted-foreground text-sm">
          This will set <span className="font-mono">{name}</span> as your
          primary ENS name for this account, so compatible apps and wallets can
          display it as your default identity.
        </p>

        <DialogFooter>
          <Button
            disabled={isSubmitting}
            onClick={handleCancel}
            variant="outline"
          >
            Cancel
          </Button>
          <Button disabled={isSubmitting} onClick={handleSave}>
            {isSubmitting ? 'Setting…' : 'Set as Primary'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
