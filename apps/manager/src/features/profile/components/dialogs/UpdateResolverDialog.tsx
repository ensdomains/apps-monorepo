import { resolverMachine } from '@ens-apps/transaction-manager'
import { Trans, useLingui } from '@lingui/react/macro'
import { useActorRef, useSelector } from '@xstate/react'
import { useEffect, useState } from 'react'
import type { PublicClient } from 'viem'
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
import { FloatingInput } from '@/components/ui/floating-input'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useSmartAccountContext } from '@/lib/smart-account'
import { publicClient } from '@/lib/wagmi'
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
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const [resolver, setResolver] = useState(currentResolver ?? '')
  const [errorMessage, setErrorMessage] = useState<string | undefined>()
  const account = useSmartAccountContext()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const chainId = useChainId()

  const resolverActor = useActorRef(resolverMachine, {
    input: { chainId },
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
    (isError && t`Failed to update resolver`) ||
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

  const triggerButton = (
    <Button className="w-full" variant="outline">
      <Trans>Update Resolver</Trans>
    </Button>
  )

  const content = (
    <>
      <UpdateStatusPanel
        errorMessage={errorMessage ?? machineErrorMessage}
        isSaving={isSubmitting}
        isSuccess={isSuccess}
        txHash={txHash}
      />
      <FloatingInput
        disabled={isSubmitting}
        id="resolver-address"
        label={t`Resolver address`}
        onChange={(e) => setResolver(e.target.value)}
        placeholder="0x..."
        value={resolver}
      />
    </>
  )

  const footer = (
    <>
      <Button disabled={isSubmitting} onClick={handleCancel} variant="outline">
        <Trans>Cancel</Trans>
      </Button>
      <Button disabled={isSubmitting} onClick={handleSave}>
        {isSubmitting ? <Trans>Saving…</Trans> : <Trans>Save</Trans>}
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
              <Trans>Update Resolver</Trans>
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
            <Trans>Update Resolver</Trans>
          </DrawerTitle>
        </DrawerHeader>
        <div className="space-y-4 px-4">{content}</div>
        <DrawerFooter>{footer}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
