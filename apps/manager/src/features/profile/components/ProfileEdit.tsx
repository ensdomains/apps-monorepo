import { recordsMachine } from '@ens-apps/transaction-manager'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useActorRef, useSelector } from '@xstate/react'
import type { Address, PublicClient } from 'viem'
import { Button } from '@/components/ui/button'
import { useSmartAccountContext } from '@/lib/smart-account'
import { customSepolia, publicClient } from '@/lib/wagmi'
import { profileOwnerQuery } from '../service/profileOwner'
import { profileRecordsQuery } from '../service/profileRecords'
import { createDiff } from '../utils/createDiff'
import {
  defaultProfileRecords,
  transformProfileRecords,
} from '../utils/transformRecords'
import { SetPrimaryNameDialog } from './dialogs/SetPrimaryNameDialog'
import { UpdateResolverDialog } from './dialogs/UpdateResolverDialog'
import { useAppForm } from './form'
import {
  handleProfileFormSubmit,
  handleProfileReset,
  handleProfileSave,
} from './ProfileEdit.handlers'
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

  const account = useSmartAccountContext()

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

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) =>
    handleProfileFormSubmit(event, form.handleSubmit)

  const handleSave = () =>
    handleProfileSave(
      {
        name,
        ownerAddress,
        resolverAddress,
        defaultValues,
        currentValues: form.state.values,
      },
      {
        account,
        recordsActor,
        publicClient: publicClient as PublicClient,
      },
    )

  const handleReset = () =>
    handleProfileReset({
      resetForm: form.reset,
      refetchRecords,
      refetchOwner,
    })

  return (
    <form
      className="mx-auto mb-12 w-full max-w-7xl space-y-4 md:w-[calc(100%-4rem)]"
      onSubmit={handleSubmit}
    >
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
            currentResolver={resolverAddress}
            name={name}
            onUpdated={refetchRecords}
          />
          <SetPrimaryNameDialog
            name={name}
            onUpdated={refetchRecords}
            owner={ownerAddress}
          />
          <div className="space-y-2 pt-2">
            <form.Subscribe
              selector={(state) => createDiff(defaultValues, state.values)}
            >
              {(diff) =>
                Object.keys(diff).length > 0 && (
                  <Button
                    className="w-full"
                    onClick={handleReset}
                    type="button"
                    variant="outline"
                  >
                    Reset Changes
                  </Button>
                )
              }
            </form.Subscribe>
            <SaveChanges
              errorMessage={
                isError ? (updateErrorMessage ?? undefined) : undefined
              }
              form={form}
              isSaving={isSubmitting}
              isSuccess={isSuccess}
              name={name}
              onSave={handleSave}
              originalData={defaultValues}
              txHash={txHash}
              validationIssues={validationIssues ?? undefined}
            />
          </div>
        </div>
      </div>
    </form>
  )
}
