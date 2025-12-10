import { resolverMachine, type Signer } from '@ens-apps/transaction-manager'
import { useActorRef, useSelector } from '@xstate/react'
import { useEffect, useState } from 'react'
import type { Address } from 'viem'
import { isAddress } from 'viem'
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
import { Input } from '@/components/ui/input'
import { useRhinestoneAccount } from '@/lib/rhinestone/useRhinestoneAccount'
import { customSepolia, publicClient } from '@/lib/wagmi'
import { isProfileOwner } from '../../utils/isProfileOwner'
import { UpdateStatusPanel } from './UpdateStatusPanel'

interface UpdateResolverDialogProps {
  name: string
  currentResolver?: string
  onUpdated?: () => void
  owner?: Address
}

export const UpdateResolverDialog = ({
  name,
  currentResolver,
  onUpdated,
  owner,
}: UpdateResolverDialogProps) => {
  const [open, setOpen] = useState(false)
  const [resolver, setResolver] = useState(currentResolver ?? '')
  const [errorMessage, setErrorMessage] = useState<string | undefined>()

  const { rhinestoneAccount, accountAddress, rhinestoneConfig, isConnected } =
    useRhinestoneAccount()
  const { data: walletClient } = useWalletClient()

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

  const { isOwnedBySmartAccount, isOwnedByEoa } = isProfileOwner({
    owner,
    walletAddress: walletClient?.account?.address,
    smartAccountAddress: accountAddress as Address,
  })

  const handleSave = () => {
    setErrorMessage(undefined)

    if (!resolver) {
      setErrorMessage('Resolver address is required.')
      return
    }

    if (!isAddress(resolver, { strict: false })) {
      setErrorMessage('Please enter a valid resolver contract address.')
      return
    }

    let signer: Signer | null = null
    let submissionAddress: Address | null = null

    if (isOwnedBySmartAccount) {
      if (
        !isConnected ||
        !rhinestoneAccount ||
        !accountAddress ||
        !rhinestoneConfig
      ) {
        setErrorMessage(
          'Connect your wallet and smart account before updating the resolver.',
        )
        return
      }

      signer = {
        type: 'pimlico',
        account: rhinestoneAccount,
        config: {
          ...rhinestoneConfig,
          accountAddress: accountAddress as Address,
        },
      }
      submissionAddress = accountAddress as Address
    } else if (isOwnedByEoa) {
      const walletAddress = walletClient?.account?.address

      if (!walletClient || !walletAddress) {
        setErrorMessage('Connect your wallet before updating the resolver.')
        return
      }

      signer = {
        type: 'eoa',
        walletClient,
      }
      submissionAddress = walletAddress as Address
    } else {
      setErrorMessage('Connect the owner wallet to update the resolver.')
      return
    }

    resolverActor.send({
      type: 'START_UPDATE',
      name,
      resolver: resolver as Address,
      signer,
      accountAddress: submissionAddress,
      publicClient,
    })
  }

  const handleCancel = () => {
    setOpen(false)
    setErrorMessage(undefined)
    resolverActor.send({ type: 'CANCEL' })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          Update Resolver
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update Resolver</DialogTitle>
        </DialogHeader>

        <UpdateStatusPanel
          isSaving={isSubmitting}
          isSuccess={isSuccess}
          errorMessage={errorMessage ?? machineErrorMessage}
          txHash={txHash}
        />

        <div className="space-y-2">
          <label
            htmlFor="resolver-address"
            className="block font-medium text-sm"
          >
            Resolver address
          </label>
          <Input
            id="resolver-address"
            placeholder="0x..."
            value={resolver}
            onChange={(e) => setResolver(e.target.value)}
            disabled={isSubmitting}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
