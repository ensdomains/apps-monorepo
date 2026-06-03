import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { Trans } from '@lingui/react/macro'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { Address, PublicClient } from 'viem'
import { useChainId } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Tabs } from '@/components/ui/tabs'
import { useSmartAccountContext } from '@/lib/smart-account'
import { publicClient } from '@/lib/wagmi'
import type { ProfileRecords } from '../../types'
import { createDiff } from '../../utils/createDiff'
import { transformToServiceFormat } from '../../utils/transformRecords'
import { useAppForm } from '../form'
import {
  RecordsValidationError,
  type SaveRecordsParams,
  saveRecords,
} from '../ProfileEdit.transactions'
import { EditProfileDialogHeader } from './EditProfileDialogHeader'
import { EditProfileDialogTabs } from './EditProfileDialogTabs'
import {
  type GeneralField,
  getDefaultVisibleFields,
} from './EditProfileGeneralTab'

interface EditProfileDialogProps {
  readonly name: string
  records: ProfileRecords
  owner?: Address
  onUpdated?: () => undefined | Promise<unknown>
}

export const EditProfileDialog = ({
  name,
  records,
  owner,
  onUpdated,
}: EditProfileDialogProps) => {
  const [open, setOpen] = useState(false)
  const [savedRecords, setSavedRecords] = useState(records)
  const [localSaveError, setLocalSaveError] = useState<string>()
  const [visibleFields, setVisibleFields] = useState<Set<GeneralField>>(() =>
    getDefaultVisibleFields(records),
  )
  const account = useSmartAccountContext()
  const chainId = useChainId()
  const queryClient = useQueryClient()

  const form = useAppForm({
    defaultValues: records,
  })

  const saveRecordsMutation = useMutation({
    mutationFn: ({
      currentRecords: _currentRecords,
      ...params
    }: SaveRecordsParams & { currentRecords: ProfileRecords }) =>
      saveRecords(params),
    onSuccess: async (_data, variables) => {
      setSavedRecords(variables.currentRecords)
      form.reset(variables.currentRecords)
      await onUpdated?.()

      const ethBefore = variables.before.coins.find((c) => c.coinType === 60)
      const ethAfter = variables.after.coins.find((c) => c.coinType === 60)
      if (ethBefore?.value !== ethAfter?.value) {
        queryClient.invalidateQueries({
          queryKey: $qk({ $scope: 'profile', $action: 'reverse_name' }),
        })
      }

      setOpen(false)
    },
  })

  const resetSaveState = () => {
    setLocalSaveError(undefined)
    saveRecordsMutation.reset()
  }

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setSavedRecords(records)
      form.reset(records)
      setVisibleFields(getDefaultVisibleFields(records))
      resetSaveState()
    }
    setOpen(isOpen)
  }

  const toggleField = (field: GeneralField) => {
    setVisibleFields((current) => {
      const next = new Set(current)
      if (next.has(field)) {
        next.delete(field)
      } else {
        next.add(field)
      }
      return next
    })
  }

  const handleSave = (currentRecords: ProfileRecords) => {
    resetSaveState()

    if (!owner) {
      setLocalSaveError('Cannot save profile - ENS owner is not available.')
      return
    }

    if (!account.signer || !account.accountAddress) {
      setLocalSaveError('Account not ready. Please wait for wallet to connect.')
      return
    }

    if (!savedRecords.resolverAddress) {
      setLocalSaveError(
        'Cannot save profile - resolver address is not available.',
      )
      return
    }

    const accountAddress = (account.ownerAddress ??
      account.accountAddress) as Address
    const before = transformToServiceFormat(savedRecords)
    const after = transformToServiceFormat(currentRecords)

    saveRecordsMutation.mutate({
      name,
      before,
      after,
      signer: account.signer,
      accountAddress,
      publicClient: publicClient as PublicClient,
      chainId,
      resolverAddress: savedRecords.resolverAddress,
      currentRecords,
    })
  }

  const mutationError = saveRecordsMutation.error
  const validationIssueMessage =
    mutationError instanceof RecordsValidationError
      ? mutationError.issues.map((issue) => issue.message).join('\n')
      : undefined
  const errorMessage =
    localSaveError ?? validationIssueMessage ?? mutationError?.message

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button className="w-full" type="button">
          <Trans>Edit Profile (New)</Trans>
        </Button>
      </DialogTrigger>
      <DialogContent
        className="h-[min(86dvh,900px)] max-h-[calc(100dvh-4rem)] w-[min(84vw,1280px)] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-xl border border-border bg-white p-0 shadow-lg sm:max-w-[calc(100vw-8rem)]"
        overlayClassName="bg-black/20 backdrop-blur-[2px]"
        showCloseButton={false}
      >
        <form.Subscribe
          selector={(state) => ({
            canSubmit: state.canSubmit && state.isValid,
            values: state.values,
          })}
        >
          {({ canSubmit, values }) => {
            const diff = createDiff(savedRecords, values)
            const hasChanges = Object.keys(diff).length > 0
            const isSaving = saveRecordsMutation.isPending
            const handleBaseChange = (base: ProfileRecords['base']) => {
              resetSaveState()
              form.setFieldValue('base', base)
            }
            const handleContactChange = (
              contact: ProfileRecords['contact'],
            ) => {
              resetSaveState()
              form.setFieldValue('contact', contact)
            }

            return (
              <Tabs
                className="min-h-0 flex-1 gap-0"
                defaultValue="general"
                orientation="vertical"
              >
                <EditProfileDialogHeader
                  canSave={hasChanges && canSubmit}
                  isSaving={isSaving}
                  name={name}
                  onSave={() => handleSave(values)}
                />
                <EditProfileDialogTabs
                  errorMessage={errorMessage}
                  isSaving={isSaving}
                  isSuccess={saveRecordsMutation.isSuccess}
                  name={name}
                  onBaseChange={handleBaseChange}
                  onContactChange={handleContactChange}
                  onToggleField={toggleField}
                  txHash={saveRecordsMutation.data?.hash}
                  values={values}
                  visibleFields={visibleFields}
                />
              </Tabs>
            )
          }}
        </form.Subscribe>
      </DialogContent>
    </Dialog>
  )
}
