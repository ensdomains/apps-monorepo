import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Clock,
  Image as ImageIcon,
  Languages,
  List,
  Loader2,
  MapPin,
  Smile,
} from 'lucide-react'
import { useState } from 'react'
import type { Address, PublicClient } from 'viem'
import { useChainId } from 'wagmi'
import { PatternAvatar } from '@/components/atoms/PatternAvatar/PatternAvatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useSmartAccountContext } from '@/lib/smart-account'
import { cn } from '@/lib/utils'
import { publicClient } from '@/lib/wagmi'
import type { ProfileRecords, TextRecordValue } from '../../types'
import { createDiff } from '../../utils/createDiff'
import { transformToServiceFormat } from '../../utils/transformRecords'
import { useAppForm } from '../form'
import {
  RecordsValidationError,
  type SaveRecordsParams,
  saveRecords,
} from '../ProfileEdit.transactions'
import { ImageSelectionDialog } from './ImageSelectionDialog'
import { UpdateStatusPanel } from './UpdateStatusPanel'

interface EditProfileDialogProps {
  readonly name: string
  records: ProfileRecords
  owner?: Address
  onUpdated?: () => undefined | Promise<unknown>
}

const tabs = [
  { label: 'General', value: 'general' },
  { label: 'Contact', value: 'contact' },
  { label: 'Addresses', value: 'addresses' },
  { label: 'Links', value: 'links' },
  { label: 'Appearance', value: 'appearance' },
] as const

const generalShortcuts = [
  { field: 'avatar', label: 'Profile Picture', icon: Smile },
  { field: 'header', label: 'Header', icon: ImageIcon },
  { field: 'description', label: 'Description', icon: List },
  { field: 'location', label: 'Location', icon: MapPin },
  { field: 'timezone', label: 'Timezone', icon: Clock },
  { field: 'language', label: 'Language', icon: Languages },
] as const

type GeneralField = (typeof generalShortcuts)[number]['field']

const getTextRecordValue = (records: readonly TextRecordValue[], key: string) =>
  records.find((record) => record.key === key)?.value ?? ''

const setTextRecordValue = (
  records: readonly TextRecordValue[],
  key: string,
  value: string,
): TextRecordValue[] => {
  const nextRecords = records.filter((record) => record.key !== key)
  return value.trim() === '' ? nextRecords : [...nextRecords, { key, value }]
}

const getDefaultVisibleFields = (records: ProfileRecords): Set<GeneralField> =>
  new Set(
    generalShortcuts
      .map(({ field }) => field)
      .filter((field) => {
        if (
          field === 'avatar' ||
          field === 'header' ||
          field === 'description'
        ) {
          return true
        }

        if (field === 'location' || field === 'timezone') {
          return getTextRecordValue(records.contact, field).trim() !== ''
        }

        return (records.base[field] ?? '').trim() !== ''
      }),
  )

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
          Edit Profile (New)
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
            const isVisible = (field: GeneralField) => visibleFields.has(field)

            return (
              <Tabs
                className="min-h-0 flex-1 gap-0"
                defaultValue="general"
                orientation="vertical"
              >
                <div className="flex h-24 shrink-0 items-center justify-between px-8">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="size-10 shrink-0 overflow-hidden rounded-sm">
                      <PatternAvatar
                        className="border-none p-0 shadow-none"
                        name={name}
                      />
                    </div>
                    <DialogTitle className="max-w-[26rem] truncate rounded-sm border border-ens-blue bg-white px-3 py-1 font-mono text-2xl text-ens-blue leading-tight">
                      {name}
                    </DialogTitle>
                  </div>
                  <div className="flex items-center gap-3">
                    <DialogClose asChild>
                      <Button
                        className="w-auto text-muted-foreground uppercase tracking-[0.18em]"
                        disabled={isSaving}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button
                      className="h-11 w-auto px-6 py-0 uppercase tracking-[0.18em]"
                      disabled={!hasChanges || !canSubmit || isSaving}
                      onClick={() => handleSave(values)}
                      type="button"
                    >
                      {isSaving && <Loader2 className="size-4 animate-spin" />}
                      {isSaving ? 'Saving' : 'Save Profile'}
                    </Button>
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 px-8 pb-8">
                  <TabsList className="h-full w-44 shrink-0 flex-col items-stretch justify-start gap-1 rounded-none border-border border-r bg-transparent p-0 pt-3 pr-4">
                    {tabs.map(({ label, value }) => (
                      <TabsTrigger
                        className="h-12 w-full flex-none justify-start rounded-md px-4 font-normal text-base text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground"
                        key={value}
                        value={value}
                      >
                        {label}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  <div className="flex min-w-0 flex-1 flex-col pt-3 pl-8">
                    <TabsContent
                      className="min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                      value="general"
                    >
                      <div className="space-y-6 px-1 pb-1">
                        <div>
                          <h2 className="font-semibold text-xl">General</h2>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {generalShortcuts.map(
                              ({ field, icon: Icon, label }) => (
                                <Button
                                  className={cn(
                                    'h-9 w-auto rounded-full px-3',
                                    isVisible(field)
                                      ? 'bg-muted text-foreground'
                                      : 'text-muted-foreground',
                                  )}
                                  data-state={
                                    isVisible(field) ? 'active' : 'inactive'
                                  }
                                  key={label}
                                  onClick={() => toggleField(field)}
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  <Icon className="size-4" />
                                  {label}
                                </Button>
                              ),
                            )}
                          </div>
                        </div>

                        <UpdateStatusPanel
                          errorMessage={errorMessage}
                          hasValidationIssues={false}
                          isSaving={isSaving}
                          isSuccess={saveRecordsMutation.isSuccess}
                          txHash={saveRecordsMutation.data?.hash}
                        />

                        {isVisible('avatar') && (
                          <div className="flex flex-col items-center gap-3 pt-2">
                            <div className="size-32 overflow-hidden rounded-md border border-dashed">
                              <ImageSelectionDialog
                                currentImage={values.base.avatar}
                                defaultImage=""
                                description="Choose a profile picture"
                                name={name}
                                onImageChange={(imageUrl) => {
                                  resetSaveState()
                                  form.setFieldValue('base.avatar', imageUrl)
                                }}
                                onImageRemove={() => {
                                  resetSaveState()
                                  form.setFieldValue('base.avatar', '')
                                }}
                                title="Change Profile Picture"
                                type="avatar"
                              />
                            </div>
                            <p className="text-muted-foreground text-sm">
                              Add a profile picture <span>+</span>
                            </p>
                          </div>
                        )}

                        {isVisible('header') && (
                          <div className="space-y-2">
                            <div className="overflow-hidden rounded-md border border-dashed">
                              <ImageSelectionDialog
                                currentImage={values.base.header}
                                defaultImage=""
                                description="Choose a header image"
                                name={name}
                                onImageChange={(imageUrl) => {
                                  resetSaveState()
                                  form.setFieldValue('base.header', imageUrl)
                                }}
                                onImageRemove={() => {
                                  resetSaveState()
                                  form.setFieldValue('base.header', '')
                                }}
                                title="Change Header Image"
                                type="header"
                              />
                            </div>
                            <p className="text-center text-muted-foreground text-sm">
                              Add a banner image <span>+</span>
                            </p>
                          </div>
                        )}

                        <Input
                          className="rounded-md"
                          disabled={isSaving}
                          label="Full name"
                          onChange={(event) => {
                            resetSaveState()
                            form.setFieldValue('base.name', event.target.value)
                          }}
                          placeholder="Full name"
                          size="lg"
                          value={values.base.name ?? ''}
                        />

                        {isVisible('description') && (
                          <div className="space-y-2">
                            <p className="font-medium text-sm">Description</p>
                            <Textarea
                              className="min-h-32 resize-none rounded-md"
                              disabled={isSaving}
                              onChange={(event) => {
                                resetSaveState()
                                form.setFieldValue(
                                  'base.description',
                                  event.target.value,
                                )
                              }}
                              placeholder="Description"
                              value={values.base.description ?? ''}
                            />
                          </div>
                        )}

                        <div className="grid gap-4 md:grid-cols-2">
                          {isVisible('location') && (
                            <Input
                              className="rounded-md"
                              disabled={isSaving}
                              label="Location"
                              onChange={(event) => {
                                resetSaveState()
                                form.setFieldValue(
                                  'contact',
                                  setTextRecordValue(
                                    values.contact,
                                    'location',
                                    event.target.value,
                                  ),
                                )
                              }}
                              placeholder="Location"
                              size="lg"
                              value={getTextRecordValue(
                                values.contact,
                                'location',
                              )}
                            />
                          )}
                          {isVisible('timezone') && (
                            <Input
                              className="rounded-md"
                              disabled={isSaving}
                              label="Timezone"
                              onChange={(event) => {
                                resetSaveState()
                                form.setFieldValue(
                                  'contact',
                                  setTextRecordValue(
                                    values.contact,
                                    'timezone',
                                    event.target.value,
                                  ),
                                )
                              }}
                              placeholder="Timezone"
                              size="lg"
                              value={getTextRecordValue(
                                values.contact,
                                'timezone',
                              )}
                            />
                          )}
                          {isVisible('language') && (
                            <Input
                              className="rounded-md"
                              disabled={isSaving}
                              label="Language"
                              onChange={(event) => {
                                resetSaveState()
                                form.setFieldValue(
                                  'base.language',
                                  event.target.value,
                                )
                              }}
                              placeholder="en"
                              size="lg"
                              value={values.base.language ?? ''}
                            />
                          )}
                        </div>
                      </div>
                    </TabsContent>

                    {tabs
                      .filter(({ value }) => value !== 'general')
                      .map(({ value }) => (
                        <TabsContent
                          className="flex min-h-0 flex-1 items-center justify-center text-base text-muted-foreground"
                          key={value}
                          value={value}
                        >
                          WIP
                        </TabsContent>
                      ))}
                  </div>
                </div>
              </Tabs>
            )
          }}
        </form.Subscribe>
      </DialogContent>
    </Dialog>
  )
}
