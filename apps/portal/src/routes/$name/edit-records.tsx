import type { GetRecordsReturnType } from '@ensdomains/ensjs/public'
import { useQueries } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon, ChevronDown, CirclePlus, Search } from 'lucide-react'
import { useCallback, useId, useMemo, useState } from 'react'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { CoinSelect } from '@/components/CoinSelect'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import { EditRecordsTable } from '@/features/records/components/EditRecordsTable/EditRecordsTable'
import { PendingChangesBar } from '@/features/records/components/PendingChangesBar'
import { useEditRecordsState } from '@/features/records/hooks/useEditRecordsState'
import { useNameResolverAddress } from '@/features/records/hooks/useNameResolverAddress'
import { useSaveRecords } from '@/features/records/hooks/useSaveRecords'
import { queryClient } from '@/utils/queryClient'
import type { RecordType } from '@/utils/records/editRecordUtils'
import { recordsToTableData } from '@/utils/records/recordsToTableData'
import { validateRecords } from '@/utils/records/validateRecord'

export const Route = createFileRoute('/$name/edit-records')({
  component: EditRecordsPage,
  notFoundComponent: () => <NotFoundMessage />,
  loader: ({ params }) => {
    return queryClient.prefetchQuery(getProfileQueryOptions(params.name))
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
  const { address: connectedAddress } = useConnection()

  // Fetch profile and owner data in parallel
  const [profileQuery, ownerQuery] = useQueries({
    queries: [getProfileQueryOptions(name), getEnsOwnerQueryOptions({ name })],
  })

  // Get resolver address from the correct registry (V1 or V2)
  const { data: resolverAddress, isLoading: isResolverLoading } =
    useNameResolverAddress({ name, network: ownerQuery.data?.network })

  const isLoading =
    profileQuery.isLoading || ownerQuery.isLoading || isResolverLoading

  if (isLoading) return <LoadingMessage />

  if (profileQuery.error) {
    return (
      <ErrorMessage
        title="Records unavailable"
        description={profileQuery.error.cause.message}
      />
    )
  }

  if (ownerQuery.error) {
    return (
      <ErrorMessage
        title="Owner unavailable"
        description={ownerQuery.error.cause.message}
      />
    )
  }

  if (!profileQuery.data) {
    return (
      <NoResultsMessage
        title="No records yet"
        description="This name doesn't have any records set. Records will appear here once they're configured."
      />
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

  // Authorization checks
  if (!connectedAddress) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <div className="flex items-center gap-2 mb-6">
          <Link to="/$name" params={{ name }} className="hover:opacity-70">
            <ArrowLeftIcon className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold">{name}</h1>
        </div>
        <ErrorMessage
          title="Wallet Not Connected"
          description="Please connect your wallet to edit records."
        />
      </div>
    )
  }

  // Check if connected address is the owner
  const isOwner =
    connectedAddress.toLowerCase() === ownerQuery.data.owner.toLowerCase()

  if (!isOwner) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <div className="flex items-center gap-2 mb-6">
          <Link to="/$name" params={{ name }} className="hover:opacity-70">
            <ArrowLeftIcon className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold">{name}</h1>
        </div>
        <ErrorMessage
          title="Permission Denied"
          description={
            <>
              You don't have permission to edit records for{' '}
              <strong>{name}</strong>. Only the owner (
              <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">
                {ownerQuery.data.owner}
              </code>
              ) can edit records.
            </>
          }
        />
      </div>
    )
  }

  return (
    <EditRecordsContent
      name={name}
      records={profileQuery.data.records}
      resolverAddress={resolverAddress}
    />
  )
}

const EditRecordsContent = ({
  name,
  records: rawRecords,
  resolverAddress,
}: {
  name: string
  records: GetRecordsReturnType
  resolverAddress: Address
}) => {
  const navigate = useNavigate()

  // Form state
  const [selectedType, setSelectedType] = useState<RecordType | ''>('')
  const [keyInput, setKeyInput] = useState('')
  const [valueInput, setValueInput] = useState('')

  // Reset key input when type changes (different types have different key requirements)
  const handleTypeChange = (newType: RecordType | '') => {
    setSelectedType(newType)
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
    addRecord,
    deleteRecord,
    updateRecord,
    discardAll,
  } = useEditRecordsState(originalRecords)

  // Validate records whenever they change
  const validationErrors = useMemo(() => validateRecords(records), [records])
  const hasValidationErrors = validationErrors.length > 0

  // Navigate to records page after sync completes.
  // This avoids the issue where deleted records reappear if we clear local state
  // before the indexer has caught up.
  const handleSyncComplete = useCallback(() => {
    navigate({ to: '/$name/records', params: { name } })
  }, [navigate, name])

  // Save records hook
  const {
    saveRecords,
    isWriting,
    isConfirming,
    isSyncing,
    error: saveError,
    reset: resetSaveError,
  } = useSaveRecords({
    onSyncComplete: handleSyncComplete,
  })

  const handleSaveRecords = () => {
    saveRecords({
      name,
      resolverAddress,
      originalRecords,
      pendingChanges,
    })
  }

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

  const handleAddRecord = () => {
    if (!selectedType) return
    if (requiresKey && !keyInput) return

    addRecord(selectedType, keyInput, valueInput)

    // Reset form
    setSelectedType('')
    setKeyInput('')
    setValueInput('')
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <header className="bg-gray-100 px-8 pb-6 pt-6">
        <Link to="/$name/records" params={{ name }}>
          <Button variant="ghost" className="flex items-center gap-2 -ml-2">
            <ArrowLeftIcon className="size-4" />
            Back to View
          </Button>
        </Link>
        <h1 className="text-[28px] font-medium mb-6">Edit records</h1>

        {/* Add Record Form */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Type Select */}
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label
              htmlFor={typeSelectId}
              className="text-xs text-gray-500 flex items-center gap-1"
            >
              Type
            </label>
            <div className="relative">
              <select
                id={typeSelectId}
                value={selectedType}
                onChange={(e) => handleTypeChange(e.target.value as RecordType)}
                className="h-9 w-full appearance-none rounded-sm border border-input bg-white px-3 pr-8 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] cursor-pointer"
              >
                <option value="">Select...</option>
                {RECORD_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-gray-500" />
            </div>
          </div>

          {/* Key Input - dropdown for address, text input for text, hidden for contentHash and abi */}
          {selectedType === 'address' && (
            <div className="flex flex-col gap-1 min-w-[220px]">
              <label
                htmlFor={keyInputId}
                className="text-xs text-gray-500 flex items-center gap-1"
              >
                Coin
              </label>
              <CoinSelect
                value={keyInput}
                onChange={setKeyInput}
                placeholder="Select coin..."
              />
            </div>
          )}
          {selectedType === 'text' && (
            <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
              <label
                htmlFor={keyInputId}
                className="text-xs text-gray-500 flex items-center gap-1"
              >
                Key
              </label>
              <input
                id={keyInputId}
                type="text"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder=""
                className="h-9 w-full rounded-sm border border-input bg-white px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              />
            </div>
          )}

          {/* Value Input */}
          <div className="flex flex-col gap-1 flex-2 min-w-[200px]">
            <label htmlFor={valueInputId} className="text-xs text-gray-500">
              Value
            </label>
            <input
              id={valueInputId}
              type="text"
              value={valueInput}
              onChange={(e) => setValueInput(e.target.value)}
              placeholder=""
              className="h-9 w-full rounded-sm border border-input bg-white px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            />
          </div>

          {/* Add Button */}
          <div className="flex flex-col gap-1 justify-end">
            <span className="text-xs text-transparent select-none">Action</span>
            <Button
              variant="secondary"
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
      <div className="flex-1 bg-white border rounded-lg mx-6 my-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="overflow-x-auto">
            <TabsList className="w-full justify-start border-b rounded-none px-4 py-0 h-auto bg-transparent">
              <TabsTrigger value="all" className="py-3 gap-2">
                All records
                <span className="text-gray-500">{tabCounts.all}</span>
              </TabsTrigger>
              <TabsTrigger value="text" className="py-3 gap-2">
                Text
                <span className="text-gray-500">{tabCounts.text}</span>
              </TabsTrigger>
              <TabsTrigger value="address" className="py-3 gap-2">
                Address
                <span className="text-gray-500">{tabCounts.address}</span>
              </TabsTrigger>
              <TabsTrigger value="abi" className="py-3 gap-2">
                ABI
                <span className="text-gray-500">{tabCounts.abi}</span>
              </TabsTrigger>
              <TabsTrigger value="contentHash" className="py-3 gap-2">
                Contenthash
                <span className="text-gray-500">{tabCounts.contentHash}</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value={activeTab} className="p-0 mt-0">
            {/* Search Input */}
            <div className="p-4">
              <InputGroup className="bg-white rounded-sm">
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
              onDeleteRecord={deleteRecord}
              onUpdateRecord={updateRecord}
              validationErrors={validationErrors}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Bottom Action Bar - shown when there are pending changes */}
      <PendingChangesBar
        updatesCount={updatesCount}
        changesCount={changesCount}
        onSave={handleSaveRecords}
        onDiscard={discardAll}
        onDismissError={resetSaveError}
        isSaving={isWriting || isConfirming}
        isSyncing={isSyncing}
        errorMessage={saveError?.message}
        hasValidationErrors={hasValidationErrors}
      />
    </div>
  )
}
