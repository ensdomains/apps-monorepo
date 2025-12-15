import { primaryNameMachine, type Signer } from '@ens-apps/transaction-manager'
import { useActorRef, useSelector } from '@xstate/react'
import { useEffect, useState } from 'react'
import type { Address, PublicClient } from 'viem'
import { useWalletClient } from 'wagmi'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useSmartAccount } from '@/lib/smart-account'
import { customSepolia, publicClient } from '@/lib/wagmi'
import { UpdateStatusPanel } from './UpdateStatusPanel'

interface SetPrimaryNameDialogProps {
  name: string
  owner?: Address
  onUpdated?: () => void
}

export const SetPrimaryNameDialog = ({
  name,
  owner,
  onUpdated,
}: SetPrimaryNameDialogProps) => {
  const [open, setOpen] = useState(false)

  const {
    accountAddress: smartAccountAddress,
    isConnected: isSmartAccountConnected,
    signer,
  } = useSmartAccount()
  const { data: wagmiWalletClient } = useWalletClient()

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

  useEffect(() => {
    if (isSuccess) {
      onUpdated?.()
    }
  }, [isSuccess, onUpdated])

  const handleSave = () => {
    if (!owner) {
      console.warn('Cannot set primary name - ENS owner is not available.')
      return
    }

    const ownerLower = owner.toLowerCase()
    const eoaAddress = wagmiWalletClient?.account?.address as
      | Address
      | undefined

    const smartValid =
      smartAccountAddress &&
      smartAccountAddress.toLowerCase() === ownerLower &&
      signer &&
      isSmartAccountConnected

    const eoaValid =
      eoaAddress && eoaAddress.toLowerCase() === ownerLower && wagmiWalletClient

    const signerChoice = smartValid
      ? { signer, account: smartAccountAddress }
      : eoaValid
        ? {
            signer: { type: 'eoa', walletClient: wagmiWalletClient },
            account: eoaAddress,
          }
        : null

    if (!signerChoice) {
      console.warn(
        'Cannot set primary name - connected account does not match the ENS owner.',
      )
      return
    }

    primaryNameActor.send({
      type: 'START_UPDATE',
      name,
      signer: signerChoice.signer as Signer,
      accountAddress: signerChoice.account,
      publicClient: publicClient as PublicClient,
    })
  }

  const handleCancel = () => {
    setOpen(false)
    primaryNameActor.send({ type: 'CANCEL' })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          Set Primary Name
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Set Primary Name</DialogTitle>
        </DialogHeader>

        <UpdateStatusPanel
          isSaving={isSubmitting}
          isSuccess={isSuccess}
          errorMessage={machineErrorMessage}
          txHash={txHash}
        />

        <p className="text-muted-foreground text-sm">
          This will set <span className="font-mono">{name}</span> as your
          primary ENS name for this account, so compatible apps and wallets can
          display it as your default identity.
        </p>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting ? 'Setting…' : 'Set as Primary'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
