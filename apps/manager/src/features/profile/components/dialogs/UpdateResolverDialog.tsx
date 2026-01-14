import { resolverMachine } from '@ens-apps/transaction-manager'
import { useActorRef, useSelector } from '@xstate/react'
import { useEffect, useState } from 'react'
import type { PublicClient } from 'viem'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useSmartAccountContext } from '@/lib/smart-account'
import { customSepolia, publicClient } from '@/lib/wagmi'
import {
  handleResolverCancel,
  handleResolverUpdate,
} from '../ProfileEdit.handlers'
import { UpdateStatusPanel } from './UpdateStatusPanel'

interface UpdateResolverDialogProps {
  name: string
  currentResolver?: string
  onUpdated?: () => void
}

export const UpdateResolverDialog = ({
  name,
  currentResolver,
  onUpdated,
}: UpdateResolverDialogProps) => {
  const [open, setOpen] = useState(false)
  const [resolver, setResolver] = useState(currentResolver ?? '')
  const [errorMessage, setErrorMessage] = useState<string | undefined>()
  const account = useSmartAccountContext()

  const resolverActor = useActorRef(resolverMachine, {
    input: { chainId: customSepolia.id },
  })

  const resolverState = useSelector(resolverActor, (state) => state)

  const txHash = resolverState.context.txHash
  const isSubmitting =
    resolverState.matches('submittingUpdate') ||
    resolverState.matches('waitingForUpdate')
  const isSuccess = resolverState.matches('success')
  const isError = resolverState.matches('error')
  const machineErrorMessage =
    (isError &&
      resolverState.context.error &&
      resolverState.context.error.message) ||
    (isError && 'Failed to update resolver') ||
    undefined

  useEffect(() => {
    if (open && currentResolver) {
      setResolver(currentResolver)
    }
  }, [open, currentResolver])

  useEffect(() => {
    if (isSuccess) {
      onUpdated?.()
    }
  }, [isSuccess, onUpdated])

  const handleSave = () => {
    const error = handleResolverUpdate(
      {
        name,
        resolverInput: resolver,
      },
      {
        account,
        resolverActor,
        publicClient: publicClient as PublicClient,
      },
    )

    setErrorMessage(error)
  }

  const handleCancel = () => {
    setOpen(false)
    setErrorMessage(undefined)
    handleResolverCancel(resolverActor)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button className="w-full" variant="outline">
          Update Resolver
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update Resolver</DialogTitle>
        </DialogHeader>

        <UpdateStatusPanel
          errorMessage={errorMessage ?? machineErrorMessage}
          isSaving={isSubmitting}
          isSuccess={isSuccess}
          txHash={txHash}
        />

        <div className="space-y-2">
          <label
            className="block font-medium text-sm"
            htmlFor="resolver-address"
          >
            Resolver address
          </label>
          <Input
            disabled={isSubmitting}
            id="resolver-address"
            onChange={(e) => setResolver(e.target.value)}
            placeholder="0x..."
            value={resolver}
          />
        </div>

        <DialogFooter>
          <Button
            disabled={isSubmitting}
            onClick={handleCancel}
            variant="outline"
          >
            Cancel
          </Button>
          <Button disabled={isSubmitting} onClick={handleSave}>
            {isSubmitting ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
