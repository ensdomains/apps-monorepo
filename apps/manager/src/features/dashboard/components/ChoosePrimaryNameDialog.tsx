import { Domain_OrderBy, OrderDirection } from '@ens-apps/indexer'
import { primaryNameMachine } from '@ens-apps/transaction-manager'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useActorRef, useSelector } from '@xstate/react'
import { AlertCircle, Check } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { match } from 'ts-pattern'
import type { Address, PublicClient } from 'viem'
import { getAddress } from 'viem'
import { useAccount, useChainId } from 'wagmi'
import * as ImageFallback from '@/components/atoms/ImageFallback'
import { PatternAvatar } from '@/components/atoms/PatternAvatar/PatternAvatar'
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
  getEthAddressFromRecords,
  handlePrimaryNameCancel,
  handleSetPrimaryName,
  hasMatchingEthAddress,
  type PrimaryNameOptions,
  type PrimaryNameParams,
} from '@/features/profile/components/ProfileEdit.handlers'
import { saveRecords } from '@/features/profile/components/ProfileEdit.transactions'
import {
  type AvatarLookupEntry,
  namesAvatarsQuery,
} from '@/features/profile/service/profileAvatar'
import { getProfileEthAddressSnapshot } from '@/features/profile/service/profileEthAddress'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { useSmartAccountContext } from '@/lib/smart-account'
import { publicClient } from '@/lib/wagmi'
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
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const { address } = useAccount()
  const account = useSmartAccountContext()
  const queryClient = useQueryClient()
  const chainId = useChainId()

  const primaryNameActor = useActorRef(primaryNameMachine, {
    input: { chainId },
  })

  const primaryNameState = useSelector(primaryNameActor, (state) => state)

  const isSubmitting =
    primaryNameState.matches('submittingUpdate') ||
    primaryNameState.matches('waitingForUpdate') ||
    primaryNameState.matches('submittingReverse') ||
    primaryNameState.matches('waitingForReverse')
  const isError = primaryNameState.matches('error')

  // Fetch current primary name from reverse resolver
  const { data: reverseName } = useQuery({
    ...profileReverseNameQuery(account.ownerAddress ?? undefined),
    enabled: open && !!account.ownerAddress,
  })

  // Fetch all owned names
  const normalizedAddress = address?.toLowerCase()
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
    getDomainsQuery(open ? queryVariables : undefined),
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

  const avatarLookups = useMemo<AvatarLookupEntry[]>(() => {
    if (!open) return []
    return domains.flatMap((domain) => {
      const resolverAddress = domain.resolver?.address as Address | undefined
      if (!resolverAddress) return []
      return [{ name: resolveDomainLabel(domain), resolverAddress }]
    })
  }, [open, domains])

  const { data: avatarsByName } = useQuery(namesAvatarsQuery(avatarLookups))

  const { data: selectedNameRecords, isLoading: isLoadingRecords } = useQuery({
    ...profileRecordsQuery(selectedName ?? ''),
    enabled: open && !!selectedName,
  })
  const existingEthAddress = getEthAddressFromRecords(selectedNameRecords)
  const needsEthAddressUpdate =
    !!selectedName &&
    !isLoadingRecords &&
    !hasMatchingEthAddress(
      selectedNameRecords,
      account.ownerAddress ?? undefined,
    )
  const updateEthAddressMutation = useMutation({
    mutationFn: async () => {
      if (!selectedName || !account.ownerAddress) return
      if (!account.signer || !account.accountAddress) return

      const walletAddress = account.ownerAddress as Address

      const snapshot = await getProfileEthAddressSnapshot(
        selectedName,
        selectedNameRecords?.resolverAddress as Address | undefined,
      )

      if (snapshot.isErr()) {
        const name = selectedName
        throw new Error(t`Could not read ETH address record for ${name}`)
      }

      const { resolverAddress, ethAddress } = snapshot.value
      if (!resolverAddress) {
        const name = selectedName
        throw new Error(t`Could not find resolver for ${name}`)
      }

      if (ethAddress?.toLowerCase() === walletAddress.toLowerCase()) return

      await saveRecords({
        name: selectedName,
        before: {
          texts: [],
          coins: ethAddress ? [{ coinType: 60, value: ethAddress }] : [],
        },
        after: {
          texts: [],
          coins: [{ coinType: 60, value: getAddress(walletAddress) }],
        },
        signer: account.signer,
        accountAddress: account.accountAddress,
        publicClient: publicClient as PublicClient,
        chainId,
        resolverAddress,
      })
    },
    onError: (error) => {
      console.error('Failed to set ETH address record:', error)
      toast.error(error.message || t`Failed to set ETH address record`)
    },
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
        toast.success(t`Primary name set successfully`)
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
  }, [primaryNameActor, queryClient, onUpdated, t])

  const handleSelectName = (name: string) => {
    if (!isSubmitting) {
      setSelectedName(name)
    }
  }

  const handleConfirm = async () => {
    if (!selectedName || !account.ownerAddress) return

    if (!account.signer || !account.accountAddress) {
      toast.error(t`Wallet signer not available`)
      return
    }

    try {
      await updateEthAddressMutation.mutateAsync()
    } catch {
      return
    }

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
      <DialogContent className="flex max-h-[90vh] max-w-125 flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-[24px] text-foreground">
            <Trans>Choose Primary Name</Trans>
          </DialogTitle>
          <DialogDescription className="font-sans text-muted-foreground text-sm">
            <Trans>
              Set which ENS name displays as your identity across apps and
              wallets.
            </Trans>
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
          {/* Names List */}
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {match({ isLoading, domains })
              .with({ isLoading: true }, () => (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 3 }, (_, i) => `skeleton-${i}`).map(
                    (skeletonId) => (
                      <div
                        className="flex items-center gap-3 rounded-sm p-3"
                        key={skeletonId}
                      >
                        <div className="size-10 shrink-0 animate-pulse rounded-full bg-gray-200" />
                        <div className="h-5 w-37.5 animate-pulse rounded bg-gray-200" />
                      </div>
                    ),
                  )}
                </div>
              ))
              .with({ domains: [] }, () => (
                <div className="py-8 text-center font-sans text-muted-foreground text-sm">
                  <Trans>No names found</Trans>
                </div>
              ))
              .otherwise(({ domains }) =>
                domains.map((domain) => {
                  const label = resolveDomainLabel(domain)
                  const isSelected = selectedName === label
                  const avatarUrl = avatarsByName?.[label]

                  return (
                    <button
                      aria-label={t`Select ${label} as primary name`}
                      aria-pressed={isSelected}
                      className={`flex items-center justify-between gap-3 rounded-sm border p-3 transition-colors ${
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
                        <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-ens-white">
                          <ImageFallback.Root className="contents">
                            <ImageFallback.Image
                              alt={t`${label} avatar`}
                              className="size-full object-cover"
                              src={avatarUrl}
                            />
                            <ImageFallback.Fallback>
                              <PatternAvatar
                                className="size-full rounded-full border-none bg-transparent p-0 shadow-none"
                                name={label}
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
            <div className="rounded-sm border border-red-200 bg-red-50 p-3 text-red-600 text-sm">
              <Trans>Failed to set primary name. Please try again.</Trans>
            </div>
          )}
          {/* ETH Address Mismatch/Missing Info */}
          {needsEthAddressUpdate && account.ownerAddress && (
            <div className="flex items-start gap-2 rounded-sm border border-amber-200 bg-amber-50 p-3">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div className="text-amber-800 text-sm">
                <p>
                  {existingEthAddress
                    ? t`The ETH address record does not match your wallet. If you proceed, it will be updated to your current wallet address and this name will be set as your primary name.`
                    : t`No ETH address record set. If you proceed, your current wallet address will be set as the ETH address and this name will be set as your primary name.`}
                </p>
                <div className="mt-2 rounded-md bg-amber-100/60 px-2.5 py-1.5">
                  <p className="break-all font-mono text-amber-900 text-xs">
                    {account.ownerAddress}
                  </p>
                </div>
              </div>
            </div>
          )}
          {/* Action Buttons */}
          <div className="flex shrink-0 gap-3">
            <Button
              className="h-12 flex-1 rounded-xs border-ens-white bg-ens-white font-mono text-ens-blue text-sm uppercase tracking-wider transition-colors hover:bg-ens-white/80 disabled:border-border disabled:bg-ens-white disabled:text-muted-foreground"
              disabled={isSubmitting || updateEthAddressMutation.isPending}
              onClick={handleCancel}
              variant="outline"
            >
              <Trans>Cancel</Trans>
            </Button>
            <Button
              className="h-12 flex-1 rounded-xs border-ens-blue bg-ens-blue font-mono text-sm text-white uppercase tracking-wider transition-colors hover:bg-ens-blue-hover disabled:border-border disabled:bg-ens-white disabled:text-muted-foreground"
              disabled={
                isSubmitting ||
                updateEthAddressMutation.isPending ||
                !hasChanges ||
                !selectedName
              }
              onClick={handleConfirm}
            >
              {updateEthAddressMutation.isPending
                ? t`Setting ETH address...`
                : isSubmitting
                  ? t`Setting...`
                  : t`Set as Primary`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
