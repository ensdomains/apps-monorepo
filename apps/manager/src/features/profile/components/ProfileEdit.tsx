import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import type { Address, PublicClient } from 'viem'
import { useChainId } from 'wagmi'
import { Button } from '@/components/ui/button'
import { useSmartAccountContext } from '@/lib/smart-account'
import { publicClient } from '@/lib/wagmi'
import { profileOwnerQuery } from '../service/profileOwner'
import { profileRecordsQuery } from '../service/profileRecords'
import { createDiff } from '../utils/createDiff'
import {
  defaultProfileRecords,
  transformProfileRecords,
  transformToServiceFormat,
} from '../utils/transformRecords'
import { SetPrimaryNameDialog } from './dialogs/SetPrimaryNameDialog'
// Hidden for alpha - users don't need to change the resolver
// import { UpdateResolverDialog } from './dialogs/UpdateResolverDialog'
import { useAppForm } from './form'
import {
  handleProfileFormSubmit,
  handleProfileReset,
} from './ProfileEdit.handlers'
import { RecordsValidationError, saveRecords } from './ProfileEdit.transactions'
import { SaveChanges } from './SaveChanges'
import { BioSection } from './sections/BioSection'
import { ContactInformationSection } from './sections/ContactInformationSection'
import { HeaderSection } from './sections/HeaderSection'
import { LinksSection } from './sections/LinksSection'
import { OtherSection } from './sections/OtherSection'
import { SocialLinksSection } from './sections/SocialLinksSection'
import { ThemeSection } from './sections/ThemeSection'
import { WalletAddressesSection } from './sections/WalletAddressesSection'

interface ProfileEditProps {
  name: string
}

export const ProfileEdit = ({ name }: ProfileEditProps) => {
  const { t } = useLingui()
  const { data: recordsData, refetch: refetchRecords } = useSuspenseQuery({
    ...profileRecordsQuery(name),
    select: transformProfileRecords,
  })

  const { data: ownerData, refetch: refetchOwner } = useQuery({
    ...profileOwnerQuery(name),
  })

  const account = useSmartAccountContext()
  const chainId = useChainId()
  const queryClient = useQueryClient()

  const saveRecordsMutation = useMutation({
    mutationFn: saveRecords,
    onSuccess: (_data, variables) => {
      refetchRecords()
      const ethBefore = variables.before.coins.find((c) => c.coinType === 60)
      const ethAfter = variables.after.coins.find((c) => c.coinType === 60)
      if (ethBefore?.value !== ethAfter?.value) {
        queryClient.invalidateQueries({
          queryKey: $qk({ $scope: 'profile', $action: 'reverse_name' }),
        })
      }
    },
  })

  const defaultValues = recordsData ?? defaultProfileRecords

  const form = useAppForm({
    defaultValues,
  })

  const ownerAddress = ownerData?.owner as Address | undefined
  const resolverAddress = recordsData?.resolverAddress as Address | undefined

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) =>
    handleProfileFormSubmit(event, form.handleSubmit)

  const handleSave = () => {
    if (!ownerAddress) {
      const message = t`Cannot save profile - ENS owner is not available.`
      console.warn(message)
      alert(message)
      return
    }

    if (!account.signer || !account.accountAddress) {
      const message = t`Account not ready. Please wait for wallet to connect.`
      console.error('❌ Smart account not connected or not initialized', {
        accountAddress: account.accountAddress,
        hasSigner: !!account.signer,
        type: account.type,
      })
      alert(message)
      return
    }

    if (!resolverAddress) {
      const message = t`Cannot save profile - resolver address is not available.`
      console.warn(message)
      alert(message)
      return
    }

    const before = transformToServiceFormat(defaultValues)
    const after = transformToServiceFormat(form.state.values)
    const accountAddress = (account.ownerAddress ??
      account.accountAddress) as Address

    console.log('✅ Starting profile records update:', {
      name,
      resolverAddress,
      accountAddress,
      hasSigner: !!account.signer,
    })

    saveRecordsMutation.mutate({
      name,
      before,
      after,
      signer: account.signer,
      accountAddress,
      publicClient: publicClient as PublicClient,
      chainId,
      resolverAddress,
    })
  }

  const handleReset = () =>
    handleProfileReset({
      resetForm: form.reset,
      refetchRecords,
      refetchOwner,
    })

  return (
    <form
      className="mx-auto mb-12 w-full max-w-7xl space-y-4 pt-4 md:w-[calc(100%-4rem)]"
      onSubmit={handleSubmit}
    >
      <HeaderSection form={form} name={name} owner={ownerAddress} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        <div className="space-y-4 md:col-span-7 lg:col-span-8">
          <BioSection form={form} />
          <ContactInformationSection form={form} />
          <SocialLinksSection form={form} />
          <LinksSection form={form} />
          <OtherSection form={form} />
        </div>
        <div className="space-y-4 md:col-span-5 lg:col-span-4">
          <ThemeSection form={form} />
          <WalletAddressesSection form={form} />
          {/* <UpdateResolverDialog
            currentResolver={resolverAddress}
            name={name}
            onUpdated={refetchRecords}
          /> */}
          <SetPrimaryNameDialog
            name={name}
            onUpdated={refetchRecords}
            owner={ownerAddress}
          />
          <div className="space-y-2">
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
                    <Trans>Reset Changes</Trans>
                  </Button>
                )
              }
            </form.Subscribe>
            <SaveChanges
              errorMessage={saveRecordsMutation.error?.message}
              form={form}
              isSaving={saveRecordsMutation.isPending}
              isSuccess={saveRecordsMutation.isSuccess}
              name={name}
              onReset={saveRecordsMutation.reset}
              onSave={handleSave}
              originalData={defaultValues}
              txHash={saveRecordsMutation.data?.hash}
              validationIssues={
                saveRecordsMutation.error instanceof RecordsValidationError
                  ? saveRecordsMutation.error.issues
                  : undefined
              }
            />
          </div>
        </div>
      </div>
    </form>
  )
}
