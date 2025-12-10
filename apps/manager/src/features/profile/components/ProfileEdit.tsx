import { recordsMachine, type Signer } from '@ens-apps/transaction-manager'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useActorRef, useSelector } from '@xstate/react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import type { Address } from 'viem'
import { useWalletClient } from 'wagmi'
import { Alert } from '@/components/molecules/Alert'
import { Button } from '@/components/ui/button'
import { useRhinestoneAccount } from '@/lib/rhinestone/useRhinestoneAccount'
import { customSepolia, publicClient } from '@/lib/wagmi'
import { profileOwnerQuery } from '../service/profileOwner'
import { profileRecordsQuery } from '../service/profileRecords'
import { profileResolverQuery } from '../service/profileResolver'
import type { ProfileRecords } from '../types'
import { createDiff } from '../utils/createDiff'
import { isProfileOwner } from '../utils/isProfileOwner'
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

  const { data: resolver, refetch: refetchResolver } = useQuery({
    ...profileResolverQuery(name),
  })

  const {
    rhinestoneAccount,
    accountAddress,
    rhinestoneConfig,
    isConnected: isRhinestoneConnected,
  } = useRhinestoneAccount()

  const { data: walletClient } = useWalletClient()

  const recordsActor = useActorRef(recordsMachine, {
    input: { chainId: customSepolia.id },
  })

  const recordsState = useSelector(recordsActor, (state) => state)
  const txHash = recordsState.context.txHash
  const isSubmitting =
    recordsState.matches('submittingUpdate') ||
    recordsState.matches('waitingForUpdate')
  const isSuccess = recordsState.matches('success')
  const isError = recordsState.matches('error')
  const updateErrorMessage =
    (isError &&
      recordsState.context.error &&
      recordsState.context.error.message) ||
    (isError && 'Failed to update profile') ||
    null

  const defaultValues = recordsData ?? defaultProfileRecords

  const form = useAppForm({
    defaultValues,
  })

  const lastSavedValuesRef = useRef<ProfileRecords>(defaultValues)
  const [recentlySaved, setRecentlySaved] = useState(false)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    form.handleSubmit()
  }

  const ownerAddress = ownerData?.owner as Address | undefined
  const { isOwnedBySmartAccount, isOwnedByEoa } = isProfileOwner({
    owner: ownerAddress,
    walletAddress: walletClient?.account?.address,
    smartAccountAddress: accountAddress as Address,
  })

  // Keep baseline in sync with latest fetched defaults
  useEffect(() => {
    lastSavedValuesRef.current = defaultValues
  }, [defaultValues])

  // Reset machine and update baseline when save succeeds
  useEffect(() => {
    if (isSuccess && !isSubmitting) {
      lastSavedValuesRef.current = JSON.parse(
        JSON.stringify(form.state.values),
      ) as ProfileRecords

      setRecentlySaved(true)
      const timer = setTimeout(() => setRecentlySaved(false), 4000)

      recordsActor.send({ type: 'CANCEL' })

      return () => clearTimeout(timer)
    }
  }, [isSuccess, isSubmitting, form.state.values, recordsActor])

  const handleSave = () => {
    const before = transformToServiceFormat(defaultValues)
    const after = transformToServiceFormat(form.state.values)

    let signer: Signer | null = null
    let submissionAddress: Address | null = null

    if (isOwnedBySmartAccount) {
      if (
        !isRhinestoneConnected ||
        !rhinestoneAccount ||
        !accountAddress ||
        !rhinestoneConfig
      ) {
        console.warn('Cannot save profile – smart account is not ready.')
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
        console.warn('Cannot save profile – EOA wallet is not ready.')
        return
      }

      signer = {
        type: 'eoa',
        walletClient,
      }
      submissionAddress = walletAddress as Address
    } else {
      console.warn(
        'Cannot save profile – connected account does not own this profile.',
      )
      return
    }

    recordsActor.send({
      type: 'START_UPDATE',
      name,
      before,
      after,
      signer,
      resolverAddress: resolver,
      accountAddress: submissionAddress,
      publicClient,
    })
  }

  const handleReset = () => {
    form.reset()
    refetchRecords()
    refetchOwner()
    refetchResolver()
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

      {recentlySaved && (
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

      {/* Header */}
      <HeaderSection form={form} name={name} owner={ownerAddress} />

      <div className="grid grid-cols-1 gap-4 px-4 md:grid-cols-12">
        {/* Left/main column */}
        <div className="space-y-4 md:col-span-7 lg:col-span-8">
          <BioSection form={form} />
          <div className="h-px w-full bg-gray-200" />
          <SocialLinksSection form={form} />
          <LinksSection form={form} />
        </div>

        {/* Right/side column */}
        <div className="space-y-4 md:col-span-5 lg:col-span-4">
          <WalletAddressesSection form={form} />

          <UpdateResolverDialog
            name={name}
            currentResolver={resolver}
            owner={ownerAddress}
            onUpdated={() => {
              refetchResolver()
            }}
          />
          {/* Reset & Save Buttons */}
          <div className="space-y-2 pt-2">
            <form.Subscribe
              selector={(state) =>
                createDiff(lastSavedValuesRef.current, state.values)
              }
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
              originalData={lastSavedValuesRef.current}
              onSave={handleSave}
              isSaving={isSubmitting}
              isSuccess={recentlySaved}
              errorMessage={
                isError ? (updateErrorMessage ?? undefined) : undefined
              }
              txHash={txHash}
            />
          </div>
        </div>
      </div>
    </form>
  )
}
