import {
  type RhinestoneSigner,
  recordsMachine,
} from '@ens-apps/transaction-manager'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useActorRef } from '@xstate/react'
import type { Address } from 'viem'
import { Button } from '@/components/ui/button'
import { useRhinestoneAccount } from '@/lib/rhinestone/useRhinestoneAccount'
import { customSepolia, publicClient } from '@/lib/wagmi'
import { profileOwnerQuery } from '../service/profileOwner'
import { profileRecordsQuery } from '../service/profileRecords'
import { profileResolverQuery } from '../service/profileResolver'
import { createDiff } from '../utils/createDiff'
import {
  defaultProfileRecords,
  transformProfileRecords,
  transformToServiceFormat,
} from '../utils/transformRecords'
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
  const { data: recordsData } = useSuspenseQuery({
    ...profileRecordsQuery(name),
    select: transformProfileRecords,
  })

  const { data: ownerData } = useQuery({
    ...profileOwnerQuery(name),
  })

  const { data: resolverData } = useSuspenseQuery({
    ...profileResolverQuery(name),
  })

  const {
    rhinestoneAccount,
    accountAddress,
    isConnected: isRhinestoneConnected,
  } = useRhinestoneAccount()

  const recordsActor = useActorRef(recordsMachine, {
    input: { chainId: customSepolia.id },
  })

  const defaultValues = recordsData ?? defaultProfileRecords

  const form = useAppForm({
    defaultValues,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    form.handleSubmit()
  }

  const handleSave = () => {
    if (!isRhinestoneConnected || !rhinestoneAccount || !accountAddress) {
      console.warn(
        'Cannot save profile – Rhinestone smart account is not ready.',
      )
      return
    }

    const before = transformToServiceFormat(defaultValues)
    const after = transformToServiceFormat(form.state.values)

    const signer: RhinestoneSigner = {
      type: 'rhinestone',
      account: rhinestoneAccount,
      config: { chain: customSepolia },
    }

    recordsActor.send({
      type: 'START_UPDATE',
      name,
      before,
      after,
      signer,
      resolverAddress: resolverData?.resolverAddress,
      accountAddress: accountAddress as Address,
      publicClient,
    })
  }

  const handleReset = () => {
    form.reset()
  }

  return (
    <form
      className="mx-auto mb-12 w-full max-w-7xl space-y-4 md:w-[calc(100%-4rem)]"
      onSubmit={handleSubmit}
    >
      {/* Header */}
      <HeaderSection
        form={form}
        name={name}
        owner={ownerData?.owner as Address | undefined}
      />

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

          {/* Reset & Save Buttons */}
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
              originalData={defaultValues}
              onSave={handleSave}
            />
          </div>
        </div>
      </div>
    </form>
  )
}
