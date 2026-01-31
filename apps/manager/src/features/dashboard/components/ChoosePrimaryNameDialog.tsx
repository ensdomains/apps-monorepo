import { Domain_OrderBy, OrderDirection } from '@ens-apps/indexer'
import { primaryNameMachine } from '@ens-apps/transaction-manager'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useWallet } from '@getpara/react-sdk-lite'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useActorRef, useSelector } from '@xstate/react'
import { Check } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { match } from 'ts-pattern'
import type { Address, PublicClient } from 'viem'
import placeholderAvatar from '@/assets/placeholder-avatar.svg'
import * as ImageFallback from '@/components/atoms/ImageFallback'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  handlePrimaryNameCancel,
  handleSetPrimaryName,
  type PrimaryNameOptions,
  type PrimaryNameParams,
} from '@/features/profile/components/ProfileEdit.handlers'
import { parseAvatarQuery } from '@/features/profile/service/profileAvatar'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { useSmartAccountContext } from '@/lib/smart-account'
import { customSepolia, publicClient } from '@/lib/wagmi'
import { getDomainsQuery } from '../service/queries/getDashboardDomains'
import { resolveDomainLabel } from '../utils'

interface ChoosePrimaryNameDialogProps {
  readonly onUpdated?: () => void
  readonly children?: React.ReactNode
}

export const ChoosePrimaryNameDialog = ({
  onUpdated,
  children,
}: ChoosePrimaryNameDialogProps) => {
  const [open, setOpen] = useState(false)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const { data: wallet } = useWallet()
  const account = useSmartAccountContext()
  const queryClient = useQueryClient()

  const primaryNameActor = useActorRef(primaryNameMachine, {
    input: { chainId: customSepolia.id },
  })

  const primaryNameState = useSelector(primaryNameActor, (state) => state)

  const isSubmitting =
    primaryNameState.matches('submittingUpdate') ||
    primaryNameState.matches('waitingForUpdate')
  const isError = primaryNameState.matches('error')

  // Fetch current primary name from reverse resolver
  const { data: reverseName } = useQuery({
    ...profileReverseNameQuery(account.ownerAddress ?? undefined),
    enabled: !!account.ownerAddress,
  })

  // Fetch all owned names
  const normalizedAddress = wallet?.address?.toLowerCase()
  const queryVariables = normalizedAddress
    ? {
        where: { owner: normalizedAddress },
        first: 100, // Get all names (reasonable limit)
        skip: 0,
        orderBy: Domain_OrderBy.Name,
        orderDirection: OrderDirection.Asc,
      }
    : undefined

  const { data: domainsData, isLoading } = useQuery(
    getDomainsQuery(queryVariables),
  )
  const allDomains = domainsData?.domains ?? []

  // Sort domains to always show primary name first
  const domains = useMemo(
    () =>
      [...allDomains].sort((a, b) => {
        const labelA = resolveDomainLabel(a)
        const labelB = resolveDomainLabel(b)
        const isPrimaryA = labelA.toLowerCase() === reverseName?.toLowerCase()
        const isPrimaryB = labelB.toLowerCase() === reverseName?.toLowerCase()

        if (isPrimaryA) return -1
        if (isPrimaryB) return 1
        return 0
      }),
    [allDomains, reverseName],
  )

  // Fetch avatars for all names
  const avatarQueries = useQueries({
    queries: domains.map((domain) =>
      parseAvatarQuery(domain.resolver?.avatar ?? undefined),
    ),
  })

  // Set selected name to current primary on mount
  useEffect(() => {
    if (reverseName && !selectedName) {
      setSelectedName(reverseName)
    }
  }, [reverseName, selectedName])

  // Subscribe to actor state changes
  useEffect(() => {
    const subscription = primaryNameActor.subscribe((snapshot) => {
      if (snapshot.matches('success')) {
        toast.success('Primary name set successfully')
        queryClient.invalidateQueries({
          queryKey: $qk({ $scope: 'profile', $action: 'reverse_name' }),
        })
        setOpen(false)
        onUpdated?.()
        setTimeout(() => {
          handlePrimaryNameCancel(primaryNameActor)
        }, 300)
      }
    })

    return () => subscription.unsubscribe()
  }, [primaryNameActor, queryClient, onUpdated])

  const handleSelectName = (name: string) => {
    if (!isSubmitting) {
      setSelectedName(name)
    }
  }

  const handleConfirm = () => {
    if (!selectedName || !account.ownerAddress) return

    const params: PrimaryNameParams = {
      name: selectedName,
      owner: account.ownerAddress as Address,
    }

    const options: PrimaryNameOptions = {
      account,
      primaryNameActor,
      publicClient: publicClient as PublicClient,
    }

    const error = handleSetPrimaryName(params, options)
    if (error) {
      console.error(error)
    }
  }

  const handleCancel = () => {
    if (!isSubmitting) {
      setOpen(false)
      setSelectedName(reverseName ?? null)
    }
  }

  const hasChanges = selectedName !== reverseName

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-[500px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-[24px] text-foreground">
            Choose Primary Name
          </DialogTitle>
          <DialogDescription className="font-sans text-[14px] text-muted-foreground">
            Set which ENS name displays as your identity across apps and
            wallets.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-4">
          {/* Names List */}
          <div className="flex flex-col gap-2">
            {match({ isLoading, domains })
              .with({ isLoading: true }, () => (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 3 }, (_, i) => `skeleton-${i}`).map(
                    (skeletonId) => (
                      <div
                        className="flex items-center gap-3 rounded-[4px] p-3"
                        key={skeletonId}
                      >
                        <div className="size-[40px] shrink-0 animate-pulse rounded-full bg-gray-200" />
                        <div className="h-[20px] w-[150px] animate-pulse rounded bg-gray-200" />
                      </div>
                    ),
                  )}
                </div>
              ))
              .with({ domains: [] }, () => (
                <div className="py-8 text-center font-sans text-muted-foreground text-sm">
                  No names found
                </div>
              ))
              .otherwise(({ domains }) =>
                domains.map((domain, index) => {
                  const label = resolveDomainLabel(domain)
                  const isSelected = selectedName === label
                  const avatarUrl =
                    avatarQueries[index]?.data ??
                    domain.resolver?.avatar ??
                    undefined

                  return (
                    <button
                      aria-label={`Select ${label} as primary name`}
                      aria-pressed={isSelected}
                      className={`flex items-center justify-between gap-3 rounded-[4px] border p-3 transition-colors ${
                        isSelected
                          ? 'border-ens-blue bg-ens-lapis-dust'
                          : 'border-ens-gray-two hover:border-ens-blue/50 hover:bg-ens-white'
                      } ${isSubmitting ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                      disabled={isSubmitting}
                      key={domain.id}
                      onClick={() => handleSelectName(label)}
                      type="button"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative size-[40px] shrink-0 overflow-hidden rounded-full bg-ens-white">
                          <ImageFallback.Root className="contents">
                            <ImageFallback.Image
                              alt={`${label} avatar`}
                              className="size-full object-cover"
                              src={avatarUrl}
                            />
                            <ImageFallback.Fallback>
                              <img
                                alt={`${label} avatar placeholder`}
                                className="size-full object-cover"
                                src={placeholderAvatar}
                              />
                            </ImageFallback.Fallback>
                          </ImageFallback.Root>
                        </div>
                        <span className="font-mono text-[16px] text-foreground leading-[0.96] tracking-[-0.32px]">
                          {label}
                        </span>
                      </div>
                      {isSelected && (
                        <Check
                          className="size-[20px] shrink-0 text-ens-blue"
                          strokeWidth={2.5}
                        />
                      )}
                    </button>
                  )
                }),
              )}
          </div>

          {/* Error Message */}
          {isError && (
            <div className="rounded-[4px] border border-red-200 bg-red-50 p-3 text-red-600 text-sm">
              Failed to set primary name. Please try again.
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              className="h-[48px] flex-1 rounded-xs border-ens-white bg-ens-white font-mono text-ens-blue text-sm uppercase tracking-wider transition-colors hover:bg-ens-white/80 disabled:border-border disabled:bg-ens-white disabled:text-muted-foreground"
              disabled={isSubmitting}
              onClick={handleCancel}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="h-[48px] flex-1 rounded-xs border-ens-blue bg-ens-blue font-mono text-sm text-white uppercase tracking-wider transition-colors hover:bg-ens-blue-hover disabled:border-border disabled:bg-ens-white disabled:text-muted-foreground"
              disabled={isSubmitting || !hasChanges || !selectedName}
              onClick={handleConfirm}
            >
              {isSubmitting ? 'Setting...' : 'Set as Primary'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
