import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { Trans } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useMachine } from '@xstate/react'
import { useEffect } from 'react'
import type { Address, PublicClient } from 'viem'
import { useChainId } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Tabs } from '@/components/ui/tabs'
import { useSmartAccountContext } from '@/lib/smart-account'
import { publicClient } from '@/lib/wagmi'
import type { ProfileRecords } from '../../types'
import { createDiff } from '../../utils/createDiff'
import { useAppForm } from '../form'
import { editProfileDialogMachine } from './EditProfileDialog.machine'
import { EditProfileDialogHeader } from './EditProfileDialogHeader'
import { EditProfileDialogTabs } from './EditProfileDialogTabs'
import type { GeneralField } from './EditProfileGeneralTab'

interface EditProfileDialogProps {
  readonly name: string
  readonly records: ProfileRecords
  readonly owner?: Address
  readonly onUpdated?: () => undefined | Promise<unknown>
}

export const EditProfileDialog = ({
  name,
  records,
  owner,
  onUpdated,
}: EditProfileDialogProps) => {
  const account = useSmartAccountContext()
  const chainId = useChainId()
  const queryClient = useQueryClient()
  const [dialogState, sendDialog] = useMachine(editProfileDialogMachine, {
    input: { records },
  })

  const form = useAppForm({
    defaultValues: records,
  })

  const resetSaveState = () => {
    sendDialog({ type: 'RESET_SAVE_STATE' })
  }

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      form.reset(records)
      sendDialog({ type: 'OPEN', records })
      return
    }

    if (dialogState.matches({ editing: 'saving' })) {
      return
    }

    sendDialog({ type: 'CLOSE' })
  }

  const toggleField = (field: GeneralField) => {
    sendDialog({ type: 'TOGGLE_GENERAL_FIELD', field })
  }

  const handleSave = (currentRecords: ProfileRecords) => {
    sendDialog({
      type: 'SAVE_REQUESTED',
      values: currentRecords,
      deps: {
        accountAddress: account.accountAddress as Address | null,
        chainId,
        name,
        owner,
        ownerAddress: account.ownerAddress as Address | null,
        publicClient: publicClient as PublicClient,
        signer: account.signer,
      },
    })
  }

  useEffect(() => {
    if (!dialogState.matches({ editing: 'success' })) {
      return
    }

    let cancelled = false
    const confirmedRecords = dialogState.context.savedRecords
    const ethAddressChanged = dialogState.context.ethAddressChanged

    const finalizeSave = async () => {
      form.reset(confirmedRecords)
      await onUpdated?.()

      if (ethAddressChanged) {
        queryClient.invalidateQueries({
          queryKey: $qk({ $scope: 'profile', $action: 'reverse_name' }),
        })
      }

      if (!cancelled) {
        sendDialog({ type: 'CLOSE' })
      }
    }

    void finalizeSave()

    return () => {
      cancelled = true
    }
  }, [dialogState, form, onUpdated, queryClient, sendDialog])

  const open = !dialogState.matches('closed')
  const savedRecords = dialogState.context.savedRecords
  const visibleFields = dialogState.context.visibleFields
  const isSaving = dialogState.matches({ editing: 'saving' })
  const isSuccess = dialogState.matches({ editing: 'success' })
  const errorMessage = dialogState.context.localSaveError

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button className="w-full" type="button">
          <Trans>Edit Profile (New)</Trans>
        </Button>
      </DialogTrigger>
      <DialogContent
        className="h-[min(90dvh,739px)] w-[min(92vw,800px)] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-[12px] border-[#dededf] border-[0.75px] bg-white p-0 shadow-lg sm:max-w-[800px]"
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
            const handleSocialChange = (social: ProfileRecords['social']) => {
              resetSaveState()
              form.setFieldValue('social', social)
            }

            return (
              <Tabs
                className="min-h-0 flex-1 gap-0"
                defaultValue="general"
                orientation="vertical"
              >
                <EditProfileDialogHeader
                  avatarUrl={values.base.avatar}
                  canSave={hasChanges && canSubmit}
                  isSaving={isSaving}
                  name={name}
                  onSave={() => handleSave(values)}
                />
                <EditProfileDialogTabs
                  errorMessage={errorMessage}
                  isSaving={isSaving}
                  isSuccess={isSuccess}
                  name={name}
                  onBaseChange={handleBaseChange}
                  onContactChange={handleContactChange}
                  onSocialChange={handleSocialChange}
                  onToggleField={toggleField}
                  owner={owner}
                  txHash={dialogState.context.txHash}
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
