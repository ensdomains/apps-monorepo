import { ChildFuseKeys, type DecodedFuses } from '@ensdomains/ensjs/utils'
import { setFusesWriteParameters } from '@ensdomains/ensjs/wallet'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle,
  ShieldX,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { sepolia } from 'viem/chains'
import {
  useConnection,
  useWaitForTransactionReceipt,
  useWalletClient,
  useWriteContract,
} from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { MessageCard } from '@/components/ui/message-card'
import { getWrapperDataQueryOptions } from '@/features/resolver/hooks/useWrapperData'
import { sepoliaWithEns } from '@/lib/wagmi'

export const Route = createFileRoute('/$name/fuses/burn')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

type ChildFuseKey = (typeof ChildFuseKeys)[number]

const childFuseDisplayNames: Record<ChildFuseKey, string> = {
  CANNOT_UNWRAP: 'Cannot Unwrap',
  CANNOT_BURN_FUSES: 'Cannot Burn Fuses',
  CANNOT_TRANSFER: 'Cannot Transfer',
  CANNOT_SET_RESOLVER: 'Cannot Set Resolver',
  CANNOT_SET_TTL: 'Cannot Set TTL',
  CANNOT_CREATE_SUBDOMAIN: 'Cannot Create Subname',
  CANNOT_APPROVE: 'Cannot Approve',
}

function RouteComponent() {
  const { name } = Route.useParams()
  const { address } = useConnection()
  const queryClient = useQueryClient()

  const { data: walletClient } = useWalletClient({ chainId: sepolia.id })

  const wrapperDataQuery = useQuery({
    ...getWrapperDataQueryOptions({ name }),
  })

  const [selectedChildFuses, setSelectedChildFuses] = useState<
    Set<ChildFuseKey>
  >(new Set())
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined)
  const [isWriting, setIsWriting] = useState(false)

  const { writeContractAsync, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  })

  useEffect(() => {
    if (isSuccess) {
      queryClient.invalidateQueries({ queryKey: ['get-wrapper-data'] })
      setSelectedChildFuses(new Set())
      setTxHash(undefined)
    }
  }, [isSuccess, queryClient])

  if (wrapperDataQuery.isLoading) {
    return <LoadingMessage title="Loading fuses..." />
  }

  if (wrapperDataQuery.error) {
    return (
      <ErrorMessage
        title="Failed to load fuses"
        description={wrapperDataQuery.error.cause?.message}
      />
    )
  }

  const wrapperData = wrapperDataQuery.data

  if (!wrapperData) {
    return <V2NameMessage />
  }

  const isOwner = address && wrapperData.owner === address

  if (!isOwner) {
    return <NotOwnerMessage />
  }

  const fuses = wrapperData.fuses as DecodedFuses | undefined
  const expiry = wrapperData.expiry

  const isParentFuseBurnt = (fuseKey: string): boolean => {
    if (!fuses?.parent) return false
    return (fuses.parent as Record<string, unknown>)[fuseKey] === true
  }

  const isChildFuseBurnt = (fuseKey: ChildFuseKey): boolean => {
    if (!fuses?.child) return false
    return (fuses.child as Record<string, unknown>)[fuseKey] === true
  }

  // For .eth 2LDs, PCC and IS_DOT_ETH are automatically burnt when wrapped
  // Check if PCC is burnt (required to burn CANNOT_UNWRAP)
  const isPCCBurnt = isParentFuseBurnt('PARENT_CANNOT_CONTROL')
  // Check if CANNOT_UNWRAP is burnt (required to burn other child fuses)
  const isCannotUnwrapBurnt = isChildFuseBurnt('CANNOT_UNWRAP')
  // Check if CANNOT_UNWRAP is selected (to enable other fuses in the same tx)
  const isCannotUnwrapSelected = selectedChildFuses.has('CANNOT_UNWRAP')

  const canSelectChildFuse = (fuseKey: ChildFuseKey): boolean => {
    // Already burnt - can't select
    if (isChildFuseBurnt(fuseKey)) return false

    // CANNOT_UNWRAP requires PCC to be burnt first
    if (fuseKey === 'CANNOT_UNWRAP') {
      return isPCCBurnt
    }

    // Other child fuses require CANNOT_UNWRAP to be burnt OR selected in this tx
    return isCannotUnwrapBurnt || isCannotUnwrapSelected
  }

  const toggleChildFuse = (fuseKey: ChildFuseKey) => {
    if (!canSelectChildFuse(fuseKey)) return
    const newSelected = new Set(selectedChildFuses)
    if (newSelected.has(fuseKey)) {
      newSelected.delete(fuseKey)
      // If deselecting CANNOT_UNWRAP and it's not already burnt,
      // clear all other child fuses since they require CANNOT_UNWRAP
      if (fuseKey === 'CANNOT_UNWRAP' && !isCannotUnwrapBurnt) {
        for (const key of ChildFuseKeys) {
          if (key !== 'CANNOT_UNWRAP') newSelected.delete(key)
        }
      }
    } else {
      newSelected.add(fuseKey)
    }
    setSelectedChildFuses(newSelected)
  }

  const handleBurn = async () => {
    if (selectedChildFuses.size === 0) return
    if (!address || !walletClient) return

    try {
      setIsWriting(true)

      const childFusesArray = Array.from(selectedChildFuses)

      const params = setFusesWriteParameters(
        {
          ...walletClient,
          chain: sepoliaWithEns,
        },
        {
          name,
          fuses: { named: childFusesArray },
        },
      )

      const hash = await writeContractAsync({
        address: params.address,
        abi: params.abi,
        functionName: params.functionName,
        args: params.args,
      })

      setTxHash(hash)
    } finally {
      setIsWriting(false)
    }
  }

  const isPending = isWriting || isConfirming
  const hasChanges = selectedChildFuses.size > 0

  return (
    <div className="flex flex-col items-center px-8 py-6 w-full">
      <div className="flex flex-col gap-6 max-w-[640px] w-full">
        {/* Back link */}
        <Link
          to="/$name/fuses"
          params={{ name }}
          className="flex items-center gap-1 text-quartz-400 hover:text-quartz-600 text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>

        {/* Title */}
        <h1 className="text-[34px] font-medium leading-tight">Burn fuses</h1>

        {/* Warning box */}
        <div className="bg-[#f2f2f2] rounded-2xl p-6 flex gap-4 items-start">
          <AlertTriangle className="w-8 h-8 shrink-0" />
          <p className="text-black">
            Burning fuses will make permanent changes to your name.
            <br />
            You will not be able to undo these changes, and they will only be
            reset if the name expires.
          </p>
        </div>

        {/* Fuse expiry */}
        <div className="flex flex-col gap-1">
          <span className="font-medium">Fuse expiry</span>
          <div className="flex items-center h-[38px] px-2 border border-quartz-100 rounded bg-white">
            <span className="flex-1 text-sm">
              {expiry
                ? new Date(Number(expiry) * 1000).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    timeZoneName: 'short',
                  })
                : 'N/A'}
            </span>
            <Calendar className="w-4 h-4 text-quartz-400" />
          </div>
        </div>

        {/* Fuses */}
        <div className="flex flex-col gap-1">
          <span className="font-medium">Fuses</span>
          <div className="flex flex-col gap-2">
            {ChildFuseKeys.map((fuseKey) => {
              const burnt = isChildFuseBurnt(fuseKey)
              const canSelect = canSelectChildFuse(fuseKey)
              const isSelected = selectedChildFuses.has(fuseKey)

              return (
                <div key={fuseKey} className="flex gap-2 items-center">
                  <Checkbox
                    checked={isSelected || burnt}
                    disabled={!canSelect}
                    onCheckedChange={() => toggleChildFuse(fuseKey)}
                  />
                  <span
                    className={
                      !canSelect || burnt ? 'text-quartz-400' : 'text-black'
                    }
                  >
                    {childFuseDisplayNames[fuseKey]}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Save button */}
        <Button
          variant="secondary"
          onClick={handleBurn}
          disabled={!hasChanges || isPending || !address || !walletClient}
          className="flex items-center justify-center gap-2 h-[38px] w-fit"
        >
          <CheckCircle className="w-5 h-5" />
          {isWriting
            ? 'Confirm in wallet...'
            : isConfirming
              ? 'Confirming...'
              : 'Save changes'}
        </Button>

        {!address && (
          <p className="text-quartz-400 text-sm">
            Connect your wallet to burn fuses
          </p>
        )}

        {isSuccess && (
          <p className="text-green-600 text-sm">Fuses burned successfully!</p>
        )}

        {writeError && (
          <p className="text-red-600 text-sm">{writeError.message}</p>
        )}
      </div>
    </div>
  )
}

const V2NameMessage = () => (
  <MessageCard
    icon={<AlertTriangle className="size-8" />}
    title="Fuses not available"
    description={
      <>
        <p>Fuses are not available for ENSv2 names.</p>
        <p className="text-quartz-500 text-sm mt-2">
          Only ENSv1 names have fuses.
        </p>
      </>
    }
  />
)

const NotOwnerMessage = () => (
  <MessageCard
    icon={<ShieldX className="size-8" />}
    title="Not authorized"
    description={
      <>
        <p>You are not the owner of this name.</p>
        <p className="text-quartz-500 text-sm mt-2">
          Only the owner can burn fuses on this name.
        </p>
      </>
    }
  />
)
