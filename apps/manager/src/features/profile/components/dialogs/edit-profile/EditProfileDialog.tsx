import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { Trans } from '@lingui/react/macro'
import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useActorRef, useSelector } from '@xstate/react'
import { useEffect, useState } from 'react'
import type { Address, PublicClient } from 'viem'
import { useChainId } from 'wagmi'
import type { Actor } from 'xstate'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Tabs } from '@/components/ui/tabs'
import type { ProfileRecords } from '@/features/profile/types'
import { createDiff } from '@/features/profile/utils/createDiff'
import { normalizeProfileRecords } from '@/features/profile/utils/transformRecords'
import { useSmartAccountContext } from '@/lib/smart-account'
import { publicClient } from '@/lib/wagmi'
import { useAppForm } from '../../form'
import {
  RecordsValidationError,
  type SaveRecordsParams,
  saveRecords,
} from '../../ProfileEdit.transactions'
import { EditProfileDialogProvider } from './EditProfileDialog.context'
import { editProfileDialogMachine } from './EditProfileDialog.machine'
import { EditProfileDialogHeader } from './EditProfileDialogHeader'
import { EditProfileDialogTabs } from './EditProfileDialogTabs'
import { getAddressValidationIssues } from './tabs/addresses/AddressesTab.helpers'
import { getContactValidationIssues } from './tabs/contact/records'
import { getLinkValidationIssues } from './tabs/links/validation'

interface ProfileEditForm {
  readonly reset: (records: ProfileRecords) => void
}

interface UseCloseProfileDialogOnSuccessfulSaveParams {
  readonly dialogActor: Actor<typeof editProfileDialogMachine>
  readonly ethAddressChanged: boolean
  readonly form: ProfileEditForm
  readonly isSuccess: boolean
  readonly onUpdated?: () => undefined | Promise<unknown>
  readonly queryClient: QueryClient
  readonly savedRecords: ProfileRecords
}

interface EditProfileDialogProps {
  readonly name: string
  readonly records: ProfileRecords
  readonly owner?: Address
  readonly onUpdated?: () => undefined | Promise<unknown>
}

const useCloseProfileDialogOnSuccessfulSave = ({
  dialogActor,
  ethAddressChanged,
  form,
  isSuccess,
  onUpdated,
  queryClient,
  savedRecords,
}: UseCloseProfileDialogOnSuccessfulSaveParams) => {
  useEffect(() => {
    if (!isSuccess) {
      return
    }

    let cancelled = false

    const finalizeSave = async () => {
      form.reset(savedRecords)
      await onUpdated?.()

      if (ethAddressChanged) {
        queryClient.invalidateQueries({
          queryKey: $qk({ $scope: 'profile', $action: 'reverse_name' }),
        })
      }

      if (!cancelled) {
        dialogActor.send({ type: 'CLOSE' })
      }
    }

    void finalizeSave()

    return () => {
      cancelled = true
    }
  }, [
    dialogActor,
    ethAddressChanged,
    form,
    isSuccess,
    onUpdated,
    queryClient,
    savedRecords,
  ])
}

const getMutationErrorMessage = (error: unknown) => {
  if (error instanceof RecordsValidationError) {
    return error.issues.map((issue) => issue.message).join('\n')
  }

  return error instanceof Error ? error.message : String(error)
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
  const dialogActor = useActorRef(editProfileDialogMachine, {
    input: { records },
  })
  const open = useSelector(dialogActor, (state) => !state.matches('closed'))
  const savedRecords = useSelector(
    dialogActor,
    (state) => state.context.savedRecords,
  )
  const isSaving = useSelector(dialogActor, (state) =>
    state.matches({ editing: 'saving' }),
  )
  const isSuccess = useSelector(dialogActor, (state) =>
    state.matches({ editing: 'success' }),
  )
  const ethAddressChanged = useSelector(
    dialogActor,
    (state) => state.context.ethAddressChanged,
  )
  const [hasDraftLinkValidationIssues, setHasDraftLinkValidationIssues] =
    useState(false)

  const form = useAppForm({
    defaultValues: records,
  })

  const saveRecordsMutation = useMutation({
    mutationFn: ({
      currentRecords: _currentRecords,
      ...params
    }: SaveRecordsParams & { currentRecords: ProfileRecords }) =>
      saveRecords(params),
    onSuccess: (data, variables) => {
      const ethBefore = variables.before.coins.find(
        ({ coinType }) => coinType === 60,
      )
      const ethAfter = variables.after.coins.find(
        ({ coinType }) => coinType === 60,
      )

      dialogActor.send({
        type: 'SAVE_SUCCEEDED',
        currentRecords: variables.currentRecords,
        ethAddressChanged: ethBefore?.value !== ethAfter?.value,
        txHash: data.hash,
      })
    },
    onError: (error) => {
      dialogActor.send({
        type: 'SAVE_FAILED',
        errorMessage: getMutationErrorMessage(error),
      })
    },
  })

  const resetSaveState = () => {
    saveRecordsMutation.reset()
    dialogActor.send({ type: 'RESET_SAVE_STATE' })
  }

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setHasDraftLinkValidationIssues(false)
      form.reset(records)
      dialogActor.send({ type: 'OPEN', records })
      return
    }

    if (isSaving) {
      return
    }

    setHasDraftLinkValidationIssues(false)
    dialogActor.send({ type: 'CLOSE' })
  }

  const handleSave = (currentRecords: ProfileRecords) => {
    resetSaveState()

    dialogActor.send({
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

    const snapshot = dialogActor.getSnapshot()
    if (
      !snapshot.matches({ editing: 'saving' }) ||
      !snapshot.context.pendingSave
    ) {
      return
    }

    saveRecordsMutation.mutate({
      ...snapshot.context.pendingSave.params,
      currentRecords: snapshot.context.pendingSave.currentRecords,
    })
  }

  useCloseProfileDialogOnSuccessfulSave({
    dialogActor,
    ethAddressChanged,
    form,
    isSuccess,
    onUpdated,
    queryClient,
    savedRecords,
  })

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button className="w-full" type="button">
          <Trans>Edit Profile</Trans>
        </Button>
      </DialogTrigger>
      <DialogContent
        className="top-0 left-0 h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-[#dededf] border-[0.75px] bg-white p-0 shadow-lg md:top-[50%] md:left-[50%] md:h-[min(90dvh,739px)] md:w-[min(92vw,800px)] md:max-w-200 md:translate-x-[-50%] md:translate-y-[-50%] md:rounded-xl"
        overlayClassName="bg-black/20 backdrop-blur-[2px]"
        showCloseButton={false}
      >
        <EditProfileDialogProvider actor={dialogActor}>
          <form.Subscribe
            selector={(state) => ({
              canSubmit: state.canSubmit && state.isValid,
              values: state.values,
            })}
          >
            {({ canSubmit, values }) => {
              const submittedValues = normalizeProfileRecords(values)
              const diff = createDiff(savedRecords, submittedValues)
              const hasChanges = Object.keys(diff).length > 0
              const hasAddressValidationIssues =
                getAddressValidationIssues(values.addresses).length > 0
              const hasLinkValidationIssues =
                getLinkValidationIssues(values.links).length > 0 ||
                hasDraftLinkValidationIssues
              const hasContactValidationIssues =
                getContactValidationIssues(values).length > 0
              const canSaveProfile =
                hasChanges &&
                canSubmit &&
                !hasAddressValidationIssues &&
                !hasLinkValidationIssues &&
                !hasContactValidationIssues
              const handleBaseChange = (base: ProfileRecords['base']) => {
                resetSaveState()
                form.setFieldValue('base', base)
              }
              const handleAddressesChange = (
                addresses: ProfileRecords['addresses'],
              ) => {
                resetSaveState()
                form.setFieldValue('addresses', addresses)
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
              const handleLinksChange = (links: ProfileRecords['links']) => {
                resetSaveState()
                form.setFieldValue('links', links)
              }

              return (
                <Tabs
                  className="h-full min-h-0 flex-1 gap-0 overflow-hidden"
                  defaultValue="general"
                  orientation="vertical"
                >
                  <EditProfileDialogHeader
                    avatarUrl={values.base.avatar}
                    canSave={canSaveProfile}
                    name={name}
                    onSave={() => handleSave(submittedValues)}
                  />
                  <EditProfileDialogTabs
                    canSave={canSaveProfile}
                    name={name}
                    onAddressesChange={handleAddressesChange}
                    onBaseChange={handleBaseChange}
                    onContactChange={handleContactChange}
                    onDraftLinkValidationIssuesChange={
                      setHasDraftLinkValidationIssues
                    }
                    onLinksChange={handleLinksChange}
                    onSave={() => handleSave(submittedValues)}
                    onSocialChange={handleSocialChange}
                    owner={owner}
                    values={values}
                  />
                </Tabs>
              )
            }}
          </form.Subscribe>
        </EditProfileDialogProvider>
      </DialogContent>
    </Dialog>
  )
}
