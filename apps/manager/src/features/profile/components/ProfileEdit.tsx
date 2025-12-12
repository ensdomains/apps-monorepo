import { recordsMachine, type Signer } from '@ens-apps/transaction-manager'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useActorRef, useSelector } from '@xstate/react'
import type { Address, PublicClient } from 'viem'
import { useWalletClient } from 'wagmi'
import { Alert } from '@/components/molecules/Alert'
import { Button } from '@/components/ui/button'
import { useSmartAccount } from '@/lib/smart-account'
import { customSepolia, publicClient } from '@/lib/wagmi'
import { profileOwnerQuery } from '../service/profileOwner'
import { profileRecordsQuery } from '../service/profileRecords'
import { createDiff } from '../utils/createDiff'
import {
  defaultProfileRecords,
  transformProfileRecords,
  transformToServiceFormat,
} from '../utils/transformRecords'
import { UpdateResolverDialog } from './dialogs/UpdateResolverDialog'
import { useAppForm } from './form'
import { SaveChanges } from './SaveChanges'
import { BioSection } from './sections/BioSection'
import { HeaderSection } from './sections/HeaderSection'
import { LinksSection } from './sections/LinksSection'
import { SocialLinksSection } from './sections/SocialLinksSection'
import { WalletAddressesSection } from './sections/WalletAddressesSection'

interface ProfileEditProps {
  name: string
}

export const ProfileEdit = ({ name }: ProfileEditProps) => {
  const { data: recordsData, refetch: refetchRecords } = useSuspenseQuery({
    ...profileRecordsQuery(name),
    select: transformProfileRecords,
  })

  const { data: ownerData, refetch: refetchOwner } = useQuery({
    ...profileOwnerQuery(name),
  })

  const {
    accountAddress,
    isConnected: isSmartAccountConnected,
    signer,
  } = useSmartAccount()

  const { data: wagmiWalletClient } = useWalletClient()

  const recordsActor = useActorRef(recordsMachine, {
    input: { chainId: customSepolia.id },
  })

  const {
    txHash,
    isSubmitting,
    isSuccess,
    isError,
    updateErrorMessage,
    validationIssues,
  } = useSelector(recordsActor, (state) => {
    const isSubmitting =
      state.matches('submittingUpdate') || state.matches('waitingForUpdate')
    const isSuccess = state.matches('success')
    const isError = state.matches('error')

    const error = state.context.error
    const issues =
      error && 'issues' in error && Array.isArray((error as any).issues)
        ? ((error as any).issues as Array<{
            sectionKey?: string
            fieldKey?: string
            message: string
          }>)
        : null

    const updateErrorMessage = isError
      ? (error?.message ?? 'Failed to update profile')
      : null

    return {
      txHash: state.context.txHash,
      isSubmitting,
      isSuccess,
      isError,
      updateErrorMessage,
      validationIssues: issues,
    }
  })

  const defaultValues = recordsData ?? defaultProfileRecords

  const form = useAppForm({
    defaultValues,
  })

  const ownerAddress = ownerData?.owner as Address | undefined
  const resolverAddress = recordsData?.resolverAddress as Address | undefined
  const eoaAddress = wagmiWalletClient?.account?.address as Address | undefined
  const smartAccountAddress = accountAddress as Address | undefined

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault()
    e.stopPropagation()
    form.handleSubmit()
  }

  const handleSave = () => {
    if (!ownerAddress) {
      console.warn('Cannot save profile - ENS owner is not available.')
      return
    }

    const owner = ownerAddress.toLowerCase()

    const smartValid =
      smartAccountAddress &&
      smartAccountAddress.toLowerCase() === owner &&
      signer &&
      isSmartAccountConnected

    const eoaValid =
      eoaAddress && eoaAddress.toLowerCase() === owner && wagmiWalletClient

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
        'Cannot save profile - Connected account does not match the ENS owner.',
      )
      return
    }

    const before = transformToServiceFormat(defaultValues)
    const after = transformToServiceFormat(form.state.values)

    recordsActor.send({
      type: 'START_UPDATE',
      name,
      before,
      after,
      signer: signerChoice.signer as Signer,
      resolverAddress,
      accountAddress: signerChoice.account,
      publicClient: publicClient as PublicClient,
    })
  }

  const handleReset = () => {
    form.reset()
    refetchRecords()
    refetchOwner()
  }

  return (
    <form
      className="mx-auto mb-12 w-full max-w-7xl space-y-4 md:w-[calc(100%-4rem)]"
      onSubmit={handleSubmit}
    >
      {isSubmitting && (
        <div className="px-4">
          <Alert
            variant="info"
            title="Updating profile"
            description="Your profile changes are being submitted. This may take a few moments."
            className="mb-4"
          />
        </div>
      )}
      {isSuccess && !isSubmitting && (
        <div className="px-4">
          <Alert
            variant="success"
            title="Profile updated"
            description="Your ENS profile has been updated successfully."
            className="mb-4"
          />
        </div>
      )}
      {isError && updateErrorMessage && (
        <div className="px-4">
          <Alert
            variant="destructive"
            title="Update failed"
            description={updateErrorMessage}
            className="mb-4"
          />
        </div>
      )}
      <HeaderSection form={form} name={name} owner={ownerAddress} />

      <div className="grid grid-cols-1 gap-4 px-4 md:grid-cols-12">
        <div className="space-y-4 md:col-span-7 lg:col-span-8">
          <BioSection form={form} />
          <div className="h-px w-full bg-gray-200" />
          <SocialLinksSection form={form} />
          <LinksSection form={form} />
        </div>
        <div className="space-y-4 md:col-span-5 lg:col-span-4">
          <WalletAddressesSection form={form} />
          <UpdateResolverDialog
            name={name}
            currentResolver={resolverAddress}
            onUpdated={refetchRecords}
          />
          <div className="space-y-2 pt-2">
            <form.Subscribe
              selector={(state) => createDiff(defaultValues, state.values)}
            >
              {(diff) =>
                Object.keys(diff).length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handleReset}
                  >
                    Reset Changes
                  </Button>
                )
              }
            </form.Subscribe>
            <SaveChanges
              form={form}
              name={name}
              originalData={defaultValues}
              onSave={handleSave}
              isSaving={isSubmitting}
              isSuccess={isSuccess}
              errorMessage={
                isError ? (updateErrorMessage ?? undefined) : undefined
              }
              txHash={txHash}
              validationIssues={validationIssues ?? undefined}
            />
          </div>
        </div>
      </div>
    </form>
  )
}
