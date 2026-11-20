import type { GetRecordsReturnType } from '@ensdomains/ensjs/public'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon, ChevronDown, CirclePlus, Search } from 'lucide-react'
import { useCallback, useId, useMemo, useState } from 'react'
import type { Address } from 'viem'
import { useAccount, useConnection } from 'wagmi'
import { CoinSelect } from '@/components/CoinSelect'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PageHeading } from '@/components/PageHeading'
import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import { EditRecordsDeniedMessage } from '@/features/records/components/EditRecordsDeniedMessage'
import { EditRecordsTable } from '@/features/records/components/EditRecordsTable/EditRecordsTable'
import { PendingChangesBar } from '@/features/records/components/PendingChangesBar'
import { RecordImageUploadDialog } from '@/features/records/components/RecordImageUploadDialog'
import { getRecordImageKind } from '@/features/records/helpers/recordImageUpload'
import { useCanEditRecords } from '@/features/records/hooks/useCanEditRecords'
import { useEditRecordsState } from '@/features/records/hooks/useEditRecordsState'
import { useNameResolverAddress } from '@/features/records/hooks/useNameResolverAddress'
import { useRecordImageEditor } from '@/features/records/hooks/useRecordImageEditor'
import { useSaveRecordsFlow } from '@/features/records/hooks/useSaveRecordsFlow'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { ConnectWalletAlert } from '@/features/wallet/ConnectWalletAlert'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
import { queryClient } from '@/utils/queryClient'
import {
  canEditType,
  type EditableRecord,
  type EditableTypes,
  type RecordType,
} from '@/utils/records/editRecordUtils'
import { recordsToTableData } from '@/utils/records/recordsToTableData'

export const Route = createFileRoute('/$name/edit-records')({
  component: EditRecordsPage,
  notFoundComponent: () => <NotFoundMessage />,
  loader: ({ params }) => {
    return queryClient.prefetchQuery(
      getProfileQueryOptions({ name: params.name }),
    )
  },
})

const RECORD_TYPES: { value: RecordType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'address', label: 'Address' },
  { value: 'abi', label: 'ABI' },
  { value: 'contentHash', label: 'Contenthash' },
]

/** Record types that don't require a key input (single-value records) */
const KEYLESS_RECORD_TYPES: RecordType[] = ['contentHash', 'abi']

function EditRecordsPage() {
  const { name } = Route.useParams()
  const { address: connectedAddress, connector } = useConnection()

  const ownerQuery = useQuery(getEnsOwnerQueryOptions({ name }))
  const profileQuery = useQuery(getProfileQueryOptions({ name }))

  // Get resolver address from the correct registry (V1 or V2)
  const { data: resolverAddress, isLoading: isResolverLoading } =
    useNameResolverAddress({ name })
  const {
    canEdit,
    editLock,
    hasOwnResolver,
    editableTypes,
    isLoading: isCanEditLoading,
    isError: isPermissionsError,
  } = useCanEditRecords({ name })

  const isLoading =
    profileQuery.isLoading ||
    ownerQuery.isLoading ||
    isResolverLoading ||
    isCanEditLoading

  if (isLoading) return <LoadingMessage />

  if (profileQuery.error) {
    return (
      <ErrorMessage
        title="Records unavailable"
        description={extractErrorMessage(profileQuery.error, '')}
      />
    )
  }

  if (ownerQuery.error) {
    return (
      <ErrorMessage
        compact
        description="Error fetching the owner. Please refresh the page."
      />
    )
  }

  if (!profileQuery.data) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeading parent={{ type: 'name', name }}>Edit records</PageHeading>
        <NoResultsMessage
          title="No records yet"
          description="This name doesn't have any records set. Records will appear here once they're configured."
          className="mx-0"
        />
      </div>
    )
  }

  if (!ownerQuery.data || !resolverAddress) {
    return (
      <ErrorMessage
        title="Name not found"
        description="Could not determine the owner or resolver for this name."
      />
    )
  }

  // A name that resolves through an ancestor — a DNS name served by its TLD’s
  // offchain resolver, say — has no resolver of its own to write to, and the
  // inherited one reverts on every setter. Stopping here keeps the save away
  // from a wallet that would turn the failed estimate into a block-gas-limit
  // guess and have the RPC reject it as "gas limit too high".
  if (hasOwnResolver !== true) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <div className="flex items-center gap-2 mb-6">
          <Link to="/$name" params={{ name }} className="hover:opacity-70">
            <ArrowLeftIcon className="w-5 h-5" />
          </Link>
          <h1 className="text-h1">{name}</h1>
        </div>
        {hasOwnResolver === false ? (
          <ErrorMessage
            title="No resolver set"
            description={
              <>
                <strong>{name}</strong> has no resolver of its own, so there is
                nothing on chain to write records to. It still resolves through
                a parent — for a DNS name, its TLD’s offchain resolver reading
                the name’s <code>ENS1</code> TXT record — but that resolver is
                read-only. Set a resolver on the name to edit its records here.
              </>
            }
          />
        ) : (
          <ErrorMessage
            title="Resolver unavailable"
            description={
              <>
                We couldn’t confirm which resolver <strong>{name}</strong> uses,
                so editing is disabled rather than risk a transaction that would
                fail. Try again in a moment.
              </>
            }
          />
        )}
      </div>
    )
  }

  // Authorization checks
  if (!connectedAddress) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <div className="flex items-center gap-2 mb-6">
          <Link to="/$name" params={{ name }} className="hover:opacity-70">
            <ArrowLeftIcon className="w-5 h-5" />
          </Link>
          <h1 className="text-h1">{name}</h1>
        </div>
        <ConnectWalletAlert />
      </div>
    )
  }

  if (!canEdit) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <div className="flex items-center gap-2 mb-6">
          <Link to="/$name" params={{ name }} className="hover:opacity-70">
            <ArrowLeftIcon className="w-5 h-5" />
          </Link>
          <h1 className="text-h1">{name}</h1>
        </div>
        <EditRecordsDeniedMessage
          editLock={editLock}
          isPermissionsError={isPermissionsError}
          name={name}
        />
      </div>
    )
  }

  return (
    <EditRecordsContent
      key={JSON.stringify([
        name,
        resolverAddress,
        connectedAddress.toLowerCase(),
        connector?.uid,
      ])}
      address={connectedAddress}
      connectorUid={connector?.uid}
      name={name}
      owner={ownerQuery.data.owner}
      records={profileQuery.data.records}
      resolverAddress={resolverAddress}
      editableTypes={editableTypes}
    />
  )
}

const EditRecordsContent = ({
  address,
  connectorUid,
  name,
  owner,
  records: rawRecords,
  resolverAddress,
  editableTypes,
}: {
  readonly address: Address
  readonly connectorUid: string | undefined
  readonly name: string
  readonly owner: Address
  readonly records: GetRecordsReturnType
  readonly resolverAddress: Address
  readonly editableTypes: EditableTypes
}) => {
  const navigate = useNavigate()
  const { isConnected } = useAccount()

  // Form state
  const [pickedType, setPickedType] = useState<RecordType | ''>('')
  const selectedType =
    pickedType !== '' && canEditType(editableTypes, pickedType)
      ? pickedType
      : ''
  const [keyInput, setKeyInput] = useState('')
  const [valueInput, setValueInput] = useState('')

  // Reset key input when type changes (different types have different key requirements)
  const handleTypeChange = (newType: RecordType | '') => {
    setPickedType(newType)
    setKeyInput('') // Reset key when type changes
  }

  // UI state
  const [activeTab, setActiveTab] = useState<string>('all')
  const [globalFilter, setGlobalFilter] = useState('')

  // Convert raw records to table data
  const originalRecords = useMemo(
    () => recordsToTableData(rawRecords),
    [rawRecords],
  )

  // Change tracking state (extracted to custom hook)
  const {
    records,
    changesCount,
    updatesCount,
    pendingChanges,
    pendingImages,
    stageImage,
    markImageUploaded,
    hasImageRecordDraft,
    keepHostedImage,
    addRecord,
    deleteRecord,
    updateRecord,
    discardAll,
  } = useEditRecordsState(originalRecords)

  const { isOpen: isTransactionModalOpen } = useTransactionModal()
  const imageEditor = useRecordImageEditor({
    address,
    connectorUid,
    name,
    owner,
    originalRecords,
    editableTypes,
    isTransactionModalOpen,
    stageImage,
    keepHostedImage,
  })
  const {
    isEditorLocked,
    operation,
    imageDialog,
    closeImageDialog,
    handleConfirmImage,
    getImageChoice,
    openImageDialog,
    canUploadImage,
    onUploadImage,
  } = imageEditor

  const { validationErrors, saveControls, transactions, dismissReview } =
    useSaveRecordsFlow({
      address,
      name,
      resolverAddress,
      draft: { originalRecords, pendingChanges },
      records,
      editableTypes,
      changesCount,
      pendingImages,
      imageEditor,
      markImageUploaded,
      onSyncComplete: () =>
        navigate({ to: '/$name/records', params: { name } }),
    })

  // Compute counts for each tab (excluding deleted records)
  const tabCounts = useMemo(() => {
    const visible = records.filter((record) => !record.isDeleted)
    const counts = {
      all: visible.length,
      text: 0,
      address: 0,
      abi: 0,
      contentHash: 0,
    }
    for (const record of visible) {
      if (record.type === 'text') counts.text++
      if (record.type === 'address') counts.address++
      if (record.type === 'abi') counts.abi++
      if (record.type === 'contentHash') counts.contentHash++
    }
    return counts
  }, [records])

  // Filter records based on active tab (excluding deleted records from view)
  const filteredRecords = useMemo(() => {
    const visible = records.filter((record) => !record.isDeleted)
    if (activeTab === 'all') return visible
    return visible.filter((record) => record.type === activeTab)
  }, [records, activeTab])

  const searchRecordsId = useId()
  const typeSelectId = useId()
  const keyInputId = useId()
  const valueInputId = useId()

  // Check if the selected type requires a key
  const requiresKey =
    selectedType !== '' && !KEYLESS_RECORD_TYPES.includes(selectedType)

  const addImageKind = getRecordImageKind({ type: selectedType, key: keyInput })
  const addImageChoice = getImageChoice(addImageKind)

  const handleAddRecord = () => {
    if (operation.current || !selectedType) return
    if (requiresKey && !keyInput) return

    addRecord(selectedType, keyInput, valueInput)

    // Reset form
    setPickedType('')
    setKeyInput('')
    setValueInput('')
  }

  const handleUpdateRecord = useCallback(
    (record: EditableRecord, value: string) => {
      if (!operation.current) updateRecord(record, value)
    },
    [operation, updateRecord],
  )

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <header className="border-b border-border pb-6">
        <Link to="/$name/records" params={{ name }}>
          <Button variant="ghost" className="flex items-center gap-2 -ml-2">
            <ArrowLeftIcon className="size-4" />
            Back to View
          </Button>
        </Link>
        <PageHeading parent={{ type: 'name', name }} className="mb-6">
          Edit records
        </PageHeading>

        <div
          className="flex flex-col gap-3 sm:flex-row sm:flex-wrap"
          inert={isEditorLocked}
        >
          {/* Type Select */}
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label
              htmlFor={typeSelectId}
              className="text-small text-muted-foreground flex items-center gap-1"
            >
              Type
            </label>
            <div className="relative">
              <select
                id={typeSelectId}
                value={selectedType}
                onChange={(e) => handleTypeChange(e.target.value as RecordType)}
                className="h-9 w-full appearance-none rounded-sm border border-input bg-background px-3 pr-8 shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] cursor-pointer"
              >
                <option value="">Select...</option>
                {RECORD_TYPES.filter((type) =>
                  canEditType(editableTypes, type.value),
                ).map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          {/* Key Input - dropdown for address, text input for text, hidden for contentHash and abi */}
          {selectedType === 'address' && (
            <div className="flex flex-col gap-1 min-w-[220px]">
              <label
                htmlFor={keyInputId}
                className="text-small text-muted-foreground flex items-center gap-1"
              >
                Coin
              </label>
              <CoinSelect
                value={keyInput}
                onChange={setKeyInput}
                placeholder="Select coin..."
                coinTypes={
                  editableTypes.address === 'all'
                    ? undefined
                    : editableTypes.address
                }
                // Sits in a row of plain inputs, so it takes their flat fill
                // rather than the outline button's dark tint.
                className="dark:bg-background dark:hover:bg-accent"
              />
            </div>
          )}
          {selectedType === 'text' && (
            <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
              <label
                htmlFor={keyInputId}
                className="text-small text-muted-foreground flex items-center gap-1"
              >
                Key
              </label>
              {editableTypes.text === 'all' ? (
                <input
                  id={keyInputId}
                  type="text"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder=""
                  className="h-9 w-full rounded-sm border border-input bg-background px-3 shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                />
              ) : (
                <div className="relative">
                  <select
                    id={keyInputId}
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    className="h-9 w-full appearance-none rounded-sm border border-input bg-background px-3 pr-8 shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] cursor-pointer"
                  >
                    <option value="">Select...</option>
                    {[...editableTypes.text].toSorted().map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              )}
            </div>
          )}

          {/* Value Input */}
          <div className="flex flex-col gap-1 flex-2 min-w-[200px]">
            <label
              htmlFor={valueInputId}
              className="text-small text-muted-foreground"
            >
              Value
            </label>
            <input
              id={valueInputId}
              type="text"
              value={valueInput}
              onChange={(e) => setValueInput(e.target.value)}
              placeholder=""
              className="h-9 w-full rounded-sm border border-input bg-background px-3 shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            />
          </div>

          <div className="flex shrink-0 items-end gap-2 sm:ml-auto">
            {addImageChoice && (
              <Button
                variant="outline"
                onClick={() => openImageDialog(addImageChoice.kind)}
                className="whitespace-nowrap"
              >
                Upload image
              </Button>
            )}
            <Button
              variant="default"
              onClick={handleAddRecord}
              disabled={!selectedType || (requiresKey && !keyInput)}
              className="flex items-center gap-2 whitespace-nowrap"
            >
              Add record
              <CirclePlus className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div
        className="flex-1 bg-background border rounded-sm mx-6 my-4"
        inert={isEditorLocked}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="overflow-x-auto">
            <TabsList className="w-full justify-start border-b rounded-none px-4 py-0 h-auto bg-transparent">
              <TabsTrigger value="all" className="py-3 gap-2">
                All records
                <span className="text-muted-foreground">{tabCounts.all}</span>
              </TabsTrigger>
              <TabsTrigger value="text" className="py-3 gap-2">
                Text
                <span className="text-muted-foreground">{tabCounts.text}</span>
              </TabsTrigger>
              <TabsTrigger value="address" className="py-3 gap-2">
                Address
                <span className="text-muted-foreground">
                  {tabCounts.address}
                </span>
              </TabsTrigger>
              <TabsTrigger value="abi" className="py-3 gap-2">
                ABI
                <span className="text-muted-foreground">{tabCounts.abi}</span>
              </TabsTrigger>
              <TabsTrigger value="contentHash" className="py-3 gap-2">
                Contenthash
                <span className="text-muted-foreground">
                  {tabCounts.contentHash}
                </span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value={activeTab} className="p-0 mt-0">
            {/* Search Input */}
            <div className="p-4">
              <InputGroup className="bg-background rounded-sm">
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  id={searchRecordsId}
                  className="w-full"
                  placeholder="Search records..."
                  value={globalFilter}
                  onChange={(event) => setGlobalFilter(event.target.value)}
                />
              </InputGroup>
            </div>

            {/* Table */}
            <EditRecordsTable
              records={filteredRecords}
              globalFilter={globalFilter}
              editableTypes={editableTypes}
              onDeleteRecord={(record) => {
                if (!operation.current) deleteRecord(record)
              }}
              onUpdateRecord={handleUpdateRecord}
              onUploadImage={onUploadImage}
              canUploadImage={canUploadImage}
              validationErrors={validationErrors}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Bottom Action Bar - shown when there are pending changes */}
      <PendingChangesBar
        updatesCount={updatesCount}
        changesCount={changesCount}
        {...saveControls}
        onDiscard={() => {
          if (!operation.current && !isTransactionModalOpen) discardAll()
        }}
        isConnected={isConnected}
      />
      {imageDialog && (
        <RecordImageUploadDialog
          kind={imageDialog.kind}
          mode={imageDialog.mode}
          hasConflictingDraft={hasImageRecordDraft(imageDialog.kind)}
          onConfirm={handleConfirmImage}
          onClose={closeImageDialog}
        />
      )}
      <TransactionModal onDismiss={dismissReview} transactions={transactions} />
    </div>
  )
}
