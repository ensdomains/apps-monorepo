import type { DomainsQuery } from '@ens-apps/indexer'
import { HcaFundingDeclinedError } from '@ens-apps/transaction-manager'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { match } from 'ts-pattern'
import type { Address, PublicClient } from 'viem'
import { getAddress } from 'viem'
import { useChainId, useConnection } from 'wagmi'
import * as ImageFallback from '@/components/atoms/ImageFallback'
import { PatternAvatar } from '@/components/atoms/PatternAvatar/PatternAvatar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { HcaFundingConfirmDialog } from '@/features/profile/components/dialogs/HcaFundingConfirmDialog'
import { ResolverSetupConfirmDialog } from '@/features/profile/components/dialogs/ResolverSetupConfirmDialog'
import { useSetPrimaryName } from '@/features/profile/hooks/useSetPrimaryName'
import {
  getPrimaryNamePreparation,
  type PrimaryNamePreparation,
} from '@/features/profile/service/primaryNamePreparation'
import { profileAvatarRecordsQuery } from '@/features/profile/service/profileAvatarRecords'
import { getProfileEthAddressSnapshot } from '@/features/profile/service/profileEthAddress'
import { imageRecordQuery } from '@/features/profile/service/profileImageRecord'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { saveRecords } from '@/features/profile/service/profileRecordTransactions'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { resolverWriteAccessQuery } from '@/features/profile/service/resolverWriteAccess'
import {
  OwnedResolverNotReadyError,
  ResolverChangeNotAuthorizedError,
  setupControlledResolver,
} from '@/features/profile/service/setupControlledResolver'
import {
  type SmartAccountContextValue,
  useSmartAccountContext,
} from '@/lib/smart-account'
import { publicClient } from '@/lib/wagmi'
import { hasOwnerWallet } from '@/lib/wallet'
import { usePrimaryNameDomains } from '../hooks/usePrimaryNameDomains'
import { resolveDomainLabel } from '../utils'
import {
  isConfirmationForSelection,
  isConfirmBlocked,
  needsPrimaryNameConfirmation,
  PRIMARY_NAME_PAGE_SIZE,
  type PrimaryNameConfirmation,
} from './ChoosePrimaryNameDialog.handlers'
import {
  PrimaryNameListFooter,
  PrimaryNameSearch,
} from './PrimaryNameListControls'

interface ChoosePrimaryNameDialogProps {
  readonly onUpdated?: () => void
  readonly children?: React.ReactNode
  readonly open?: boolean
  readonly onOpenChange?: (open: boolean) => void
  readonly onCloseAutoFocus?: React.ComponentProps<
    typeof DialogContent
  >['onCloseAutoFocus']
}

type PrimaryNameDomain = DomainsQuery['domains'][number]

const getPrimaryNameErrorMessage = (
  error: Error | null,
  fallback: string,
): string | undefined =>
  error && !(error instanceof HcaFundingDeclinedError)
    ? error.message || fallback
    : undefined

const getSetupResolverErrorMessage = (
  error: Error | null,
  messages: {
    readonly notAuthorized: string
    readonly notReady: string
  },
): string | undefined => {
  if (error instanceof ResolverChangeNotAuthorizedError) {
    return messages.notAuthorized
  }
  if (error instanceof OwnedResolverNotReadyError) {
    return messages.notReady
  }
  return error?.message
}

const PrimaryNameSkeletonList = () => (
  <div className="flex flex-col gap-2">
    {Array.from(
      { length: PRIMARY_NAME_PAGE_SIZE },
      (_, i) => `skeleton-${i}`,
    ).map((skeletonId) => (
      <div className="flex items-center gap-3 rounded-sm p-3" key={skeletonId}>
        <div className="size-8.5 shrink-0 animate-pulse rounded-sm bg-gray-200" />
        <div className="h-5 w-37.5 animate-pulse rounded bg-gray-200" />
      </div>
    ))}
  </div>
)

const PrimaryNameOptionAvatar = ({
  label,
  avatarRecord,
}: {
  readonly label: string
  readonly avatarRecord?: string
}) => {
  const { t } = useLingui()
  const { data: avatarUrl } = useQuery(imageRecordQuery(avatarRecord))

  return (
    <ImageFallback.Root className="contents">
      <ImageFallback.Image
        alt={t`${label} avatar`}
        className="size-full object-cover"
        src={avatarUrl ?? undefined}
      />
      <ImageFallback.Fallback>
        <PatternAvatar
          className="size-full rounded-sm border-none bg-transparent p-0 shadow-none"
          name={label}
        />
      </ImageFallback.Fallback>
    </ImageFallback.Root>
  )
}

const PrimaryNameOption = ({
  domain,
  selectedName,
  isSubmitting,
  onSelectName,
}: {
  readonly domain: PrimaryNameDomain
  readonly selectedName: string | null
  readonly isSubmitting: boolean
  readonly onSelectName: (name: string) => void
}) => {
  const { t } = useLingui()
  const label = resolveDomainLabel(domain)
  const isSelected = selectedName === label
  const { data: avatarRecords } = useQuery(profileAvatarRecordsQuery(label))
  const avatarRecord = avatarRecords?.texts
    .find((record) => record.key === 'avatar')
    ?.value.trim()

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
      onClick={() => onSelectName(label)}
      type="button"
    >
      <div className="flex items-center gap-3">
        <div className="relative size-8.5 shrink-0 overflow-hidden rounded-sm bg-ens-white">
          <PrimaryNameOptionAvatar avatarRecord={avatarRecord} label={label} />
        </div>
        <span className="font-mono text-[16px] text-foreground leading-[0.96] tracking-[-0.32px]">
          {label}
        </span>
      </div>
      {isSelected && (
        <Check className="size-5 shrink-0 text-ens-blue" strokeWidth={2.5} />
      )}
    </button>
  )
}

/**
 * The connected wallet can't write to the name's resolver — either it has no
 * resolver (reset during transfer) or the resolver belongs to a previous owner.
 * Surfaced from the write path as a fallback; the pre-flight normally catches
 * this first and routes the flow through the resolver-setup path instead.
 */
class ResolverNotControlledError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('Wallet cannot write to this name’s resolver', options)
    this.name = 'ResolverNotControlledError'
  }
}

/** Label for the confirm button, reflecting the current step of the flow. */
const ConfirmButtonLabel = ({
  settingUpResolver,
  settingEthAddress,
  isSubmitting,
}: {
  readonly settingUpResolver: boolean
  readonly settingEthAddress: boolean
  readonly isSubmitting: boolean
}) => {
  const { t } = useLingui()

  return match({
    settingUpResolver,
    settingEthAddress,
    isSubmitting,
  })
    .with({ settingUpResolver: true }, () => <>{t`Updating profile...`}</>)
    .with({ settingEthAddress: true }, () => <>{t`Updating address...`}</>)
    .with({ isSubmitting: true }, () => <>{t`Setting...`}</>)
    .otherwise(() => <>{t`Set as Primary`}</>)
}

/** Renders a plain error message for any failure in the set-primary flow. */
const PrimaryNameErrorNotice = ({
  errorMessage,
}: {
  readonly errorMessage: string | undefined
}) => {
  if (!errorMessage) return null

  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertDescription>{errorMessage}</AlertDescription>
    </Alert>
  )
}

const EthAddressUpdateNotice = ({
  id,
  ownerAddress,
  existingEthAddress,
}: {
  readonly id?: string
  readonly ownerAddress: Address | null
  readonly existingEthAddress: Address | null
}) => {
  const { t } = useLingui()
  if (!ownerAddress) return null
  return (
    <Alert id={id} variant="warning">
      <AlertCircle />
      <AlertDescription>
        <p>
          {existingEthAddress
            ? t`This name points to a different wallet. If you continue, we’ll update it to your current wallet and set this name as your primary.`
            : t`This name doesn’t have a wallet address yet. If you continue, we’ll set it to your current wallet and make this name your primary.`}
        </p>
        <div className="mt-2 w-full rounded-md bg-amber-100/60 px-2.5 py-1.5">
          <p className="break-all font-mono text-amber-900 text-xs">
            {ownerAddress}
          </p>
        </div>
      </AlertDescription>
    </Alert>
  )
}

const EthAddressConfirmDialog = ({
  confirmation,
  onConfirm,
  onOpenChange,
}: {
  readonly confirmation: PrimaryNameConfirmation | null
  readonly onConfirm: () => void
  readonly onOpenChange: (open: boolean) => void
}) => (
  <AlertDialog
    onOpenChange={onOpenChange}
    open={confirmation?.kind === 'update-eth-address'}
  >
    <AlertDialogContent aria-describedby="primary-name-eth-address-warning">
      <AlertDialogHeader>
        <AlertDialogTitle>
          <Trans>Set this as your primary name?</Trans>
        </AlertDialogTitle>
      </AlertDialogHeader>
      <EthAddressUpdateNotice
        existingEthAddress={confirmation?.existingEthAddress ?? null}
        id="primary-name-eth-address-warning"
        ownerAddress={confirmation?.ownerAddress ?? null}
      />
      <AlertDialogFooter className="flex-row md:ml-auto md:w-2/3">
        <Button
          className="flex-1/3 uppercase"
          onClick={() => onOpenChange(false)}
          size="lg"
          variant="outline"
        >
          <Trans>Cancel</Trans>
        </Button>
        <Button
          className="flex-2/3 uppercase"
          onClick={() => {
            onConfirm()
            onOpenChange(false)
          }}
          size="lg"
        >
          <Trans>Confirm</Trans>
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)

const useUpdateEthAddressMutation = ({
  account,
  chainId,
  selectedName,
}: {
  readonly account: SmartAccountContextValue
  readonly chainId: number
  readonly selectedName: string | null
}) => {
  const { t } = useLingui()

  return useMutation({
    mutationFn: async () => {
      if (!selectedName || !account.ownerAddress) return

      const walletAddress = account.ownerAddress as Address

      // Writing a record on an existing resolver is an owner-EOA transaction,
      // not an HCA intent — the resolver authorizes the owner wallet, and the
      // session validator's action policy rejects the same call as an intent.
      // Require the wallet still bound to the owner: `resolverWriteAccess`
      // probed from that address, so a mid-switch wallet would revert on-chain.
      const { walletClient } = account
      if (!hasOwnerWallet(walletClient, walletAddress)) {
        return
      }

      // Resolve the live pointer. An indexer resolver hint can refer to a
      // resolver that is no longer attached to the name after a transfer.
      const snapshot = await getProfileEthAddressSnapshot(selectedName)

      if (snapshot.isErr()) {
        const name = selectedName
        throw new Error(t`Couldn’t read the wallet address for ${name}`)
      }

      const { resolverAddress, ethAddress } = snapshot.value

      if (!resolverAddress) {
        throw new ResolverNotControlledError()
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
        signer: { type: 'eoa', walletClient },
        accountAddress: walletClient.account.address,
        publicClient: publicClient as PublicClient,
        chainId,
        resolverAddress,
      })
    },
    onError: (error) => {
      console.error('Failed to set ETH address record:', error)
    },
  })
}

/**
 * Set up a resolver this wallet can write to, then seed the ETH address.
 * Owner-EOA transactions; runs before set-primary when write access is missing.
 */
const useSetupResolverMutation = ({
  account,
  chainId,
  selectedName,
}: {
  readonly account: SmartAccountContextValue
  readonly chainId: number
  readonly selectedName: string | null
}) => {
  const { t } = useLingui()

  return useMutation({
    mutationFn: async () => {
      if (!selectedName || !account.ownerAddress) return

      const { walletClient } = account
      if (!hasOwnerWallet(walletClient, account.ownerAddress)) {
        throw new Error(t`Please finish connecting your wallet, then try again`)
      }

      await setupControlledResolver({
        name: selectedName,
        signer: { type: 'eoa', walletClient },
        ownerAddress: account.ownerAddress,
        publicClient: publicClient as PublicClient,
        chainId,
        before: { texts: [], coins: [] },
        after: {
          texts: [],
          coins: [{ coinType: 60, value: getAddress(account.ownerAddress) }],
        },
      })
    },
    onError: (error) => {
      console.error('Failed to set up resolver for primary name:', error)
    },
  })
}

export const ChoosePrimaryNameDialog = ({
  onUpdated,
  children,
  open: controlledOpen,
  onOpenChange,
  onCloseAutoFocus,
}: ChoosePrimaryNameDialogProps) => {
  const { t } = useLingui()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = (nextOpen: boolean) => {
    setInternalOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [confirmation, setConfirmation] =
    useState<PrimaryNameConfirmation | null>(null)
  const [isCheckingPreparation, setIsCheckingPreparation] = useState(false)
  const [preparationError, setPreparationError] = useState<Error | null>(null)
  const { address } = useConnection()
  const account = useSmartAccountContext()
  const queryClient = useQueryClient()
  const chainId = useChainId()

  const {
    submit: submitPrimaryName,
    isSubmitting,
    error: primaryNameError,
    fundingPrompt,
    approveFunding,
    declineFunding,
  } = useSetPrimaryName({
    onSuccess: () => {
      toast.success(t`Primary name set successfully`)
      queryClient.invalidateQueries({
        queryKey: $qk({ $scope: 'profile', $action: 'reverse_name' }),
      })
      queryClient.invalidateQueries({
        queryKey: $qk({ $scope: 'profile', $action: 'resolver_write_access' }),
      })
      queryClient.invalidateQueries({
        queryKey: $qk({ $scope: 'profile', $action: 'get_records' }),
      })
      setConfirmation(null)
      setOpen(false)
      onUpdated?.()
    },
  })

  // Declining the funding prompt is a user cancellation, not an error.
  const primaryNameErrorMessage = getPrimaryNameErrorMessage(
    primaryNameError,
    t`Failed to set primary name`,
  )

  // Fetch current primary name from reverse resolver
  const { data: reverseName } = useQuery({
    ...profileReverseNameQuery(account.ownerAddress ?? undefined),
    enabled: open && !!account.ownerAddress,
  })

  const nameList = usePrimaryNameDomains({
    address,
    ownerAddress: account.ownerAddress,
    open,
    reverseName,
    selectedName,
  })
  const { domains, isLoading, hasForwardAddressError, isSelectedNameOffered } =
    nameList

  const { isSuccess: recordsSettled, isError: isRecordsError } = useQuery({
    ...profileRecordsQuery(selectedName ?? ''),
    enabled: open && isSelectedNameOffered,
  })
  const updateEthAddressMutation = useUpdateEthAddressMutation({
    account,
    chainId,
    selectedName,
  })
  const setupResolverMutation = useSetupResolverMutation({
    account,
    chainId,
    selectedName,
  })

  // Probe whether this wallet can write to the selected name's resolver.
  const resolverWriteAccess = useQuery({
    ...resolverWriteAccessQuery(
      selectedName ?? undefined,
      (account.ownerAddress as Address | null) ?? undefined,
    ),
    enabled: open && isSelectedNameOffered,
  })

  // Set selected name to current primary on mount
  useEffect(() => {
    if (reverseName && !selectedName) {
      setSelectedName(reverseName)
    }
  }, [reverseName, selectedName])

  const handleSelectName = (name: string) => {
    if (!isSubmitting && !isPreparing) {
      updateEthAddressMutation.reset()
      setupResolverMutation.reset()
      setPreparationError(null)
      setConfirmation(null)
      setSelectedName(name)
    }
  }

  const readPreparation = async (
    name: string,
    ownerAddress: Address,
  ): Promise<PrimaryNamePreparation | null> => {
    setPreparationError(null)
    setIsCheckingPreparation(true)
    try {
      return await getPrimaryNamePreparation(
        publicClient as PublicClient,
        name,
        ownerAddress,
      )
    } catch (error) {
      setPreparationError(
        error instanceof Error ? error : new Error(String(error)),
      )
      return null
    } finally {
      setIsCheckingPreparation(false)
    }
  }

  const applyPreparation = async (preparation: PrimaryNamePreparation) => {
    if (preparation.kind === 'setup-resolver') {
      await setupResolverMutation.mutateAsync()
    } else if (preparation.kind === 'update-eth-address') {
      await updateEthAddressMutation.mutateAsync()
    }
  }

  const submitPreparedName = async (
    preparation: PrimaryNamePreparation,
    name: string,
    ownerAddress: Address,
  ) => {
    try {
      await applyPreparation(preparation)
    } catch {
      return
    }

    try {
      await submitPrimaryName({ name, owner: ownerAddress })
    } catch {
      // Error surfaced via isError / primaryNameErrorMessage.
    }
  }

  const runConfirm = async (confirmed?: PrimaryNameConfirmation) => {
    if (!selectedName || !account.ownerAddress || !isSelectedNameOffered) return

    if (
      confirmed &&
      !isConfirmationForSelection(
        confirmed,
        selectedName,
        account.ownerAddress as Address,
      )
    ) {
      setConfirmation(null)
      return
    }

    if (!hasOwnerWallet(account.walletClient, account.ownerAddress)) {
      toast.error(t`Wallet isn’t ready yet. Try again in a moment.`)
      return
    }

    const preparation = await readPreparation(
      selectedName,
      account.ownerAddress as Address,
    )
    if (!preparation) {
      setConfirmation(null)
      return
    }

    if (needsPrimaryNameConfirmation(preparation, confirmed)) {
      setConfirmation({
        ...preparation,
        name: selectedName,
        ownerAddress: account.ownerAddress as Address,
      })
      return
    }

    setConfirmation(null)
    await submitPreparedName(
      preparation,
      selectedName,
      account.ownerAddress as Address,
    )
  }

  const handleConfirm = () => {
    void runConfirm()
  }

  const handleCancel = () => {
    if (!isSubmitting) {
      setConfirmation(null)
      setOpen(false)
      setSelectedName(reverseName ?? null)
    }
  }

  const hasChanges = selectedName !== reverseName

  const isPreparing =
    isCheckingPreparation ||
    updateEthAddressMutation.isPending ||
    setupResolverMutation.isPending
  const isBusy = isSubmitting || isPreparing
  const confirmDisabled = isConfirmBlocked({
    isSubmitting,
    isPreparing,
    resolverAccessSettled: resolverWriteAccess.isSuccess,
    recordsSettled,
    hasChanges,
    selectedName: isSelectedNameOffered ? selectedName : null,
  })
  const actionErrorMessage =
    // Probe failures first: both choose the branch, so neither can be silent —
    // confirm is disabled and nothing else would say why.
    match({ isRecordsError, isAccessError: resolverWriteAccess.isError })
      .with(
        { isRecordsError: true },
        () =>
          t`Couldn’t load this name’s records. Please try again in a moment.`,
      )
      .with(
        { isAccessError: true },
        () =>
          t`Couldn’t check this name’s resolver. Please try again in a moment.`,
      )
      .otherwise(() => undefined) ??
    getSetupResolverErrorMessage(setupResolverMutation.error, {
      notAuthorized: t`Your wallet does not have permission to change the resolver for this name. For a subname, the parent name’s owner controls this.`,
      notReady: t`The replacement resolver could not be verified. Please try again.`,
    }) ??
    preparationError?.message ??
    updateEthAddressMutation.error?.message ??
    primaryNameErrorMessage ??
    (hasForwardAddressError
      ? t`Couldn’t load this name’s records. Please try again in a moment.`
      : undefined)

  return (
    <>
      <Dialog onOpenChange={setOpen} open={open}>
        {children ? <DialogTrigger asChild>{children}</DialogTrigger> : null}
        <DialogContent
          className="flex max-h-[90dvh] max-w-125 flex-col overflow-hidden sm:h-[min(90dvh,50rem)]"
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <DialogHeader>
            <DialogTitle className="text-[24px] text-foreground">
              <Trans>Choose Primary Name</Trans>
            </DialogTitle>
            <DialogDescription className="font-sans text-muted-foreground text-sm">
              <Trans>
                Your wallet address can only have one primary ENS name, which
                will display instead of your wallet address across apps and
                wallets.
              </Trans>
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
            <PrimaryNameSearch
              disabled={isBusy}
              onChange={nameList.onSearchChange}
              value={nameList.searchQuery}
            />
            {/* Names List */}
            <div
              aria-busy={isLoading}
              className="flex h-80 min-h-0 flex-col gap-2 overflow-y-auto pr-1 sm:h-auto sm:flex-1"
            >
              {match({ isLoading, domains, hasForwardAddressError })
                .with({ isLoading: true }, () => <PrimaryNameSkeletonList />)
                .with({ domains: [], hasForwardAddressError: true }, () => null)
                .with({ domains: [] }, () => (
                  <div className="py-8 text-center font-sans text-muted-foreground text-sm">
                    <Trans>No names found</Trans>
                  </div>
                ))
                .otherwise(({ domains }) =>
                  domains.map((domain) => (
                    <PrimaryNameOption
                      domain={domain}
                      isSubmitting={isBusy}
                      key={domain.id}
                      onSelectName={handleSelectName}
                      selectedName={selectedName}
                    />
                  )),
                )}
            </div>

            <PrimaryNameListFooter
              disabled={isBusy}
              pagination={nameList}
              selectedName={selectedName}
            />

            {/* Error Message */}
            <PrimaryNameErrorNotice errorMessage={actionErrorMessage} />
            {/* Action Buttons */}
            <div className="flex shrink-0 gap-3">
              <Button
                className="h-12 flex-1 rounded-xs border-ens-white bg-ens-white font-mono text-ens-blue text-sm uppercase tracking-wider transition-colors hover:bg-ens-white/80 disabled:border-border disabled:bg-ens-white disabled:text-muted-foreground"
                disabled={isBusy}
                onClick={handleCancel}
                variant="outline"
              >
                <Trans>Cancel</Trans>
              </Button>
              <Button
                className="h-12 flex-1 rounded-xs border-ens-blue bg-ens-blue font-mono text-sm text-white uppercase tracking-wider transition-colors hover:bg-ens-blue-hover disabled:border-border disabled:bg-ens-white disabled:text-muted-foreground"
                disabled={confirmDisabled}
                onClick={handleConfirm}
              >
                <ConfirmButtonLabel
                  isSubmitting={isSubmitting}
                  settingEthAddress={updateEthAddressMutation.isPending}
                  settingUpResolver={setupResolverMutation.isPending}
                />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <EthAddressConfirmDialog
        confirmation={confirmation}
        onConfirm={() => {
          if (confirmation) void runConfirm(confirmation)
        }}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setConfirmation(null)
        }}
      />
      <HcaFundingConfirmDialog
        onApprove={approveFunding}
        onDecline={declineFunding}
        prompt={fundingPrompt}
      />

      <ResolverSetupConfirmDialog
        intent="primary-name"
        onConfirm={() => {
          if (confirmation) void runConfirm(confirmation)
        }}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setConfirmation(null)
        }}
        open={confirmation?.kind === 'setup-resolver'}
      >
        <EthAddressUpdateNotice
          existingEthAddress={confirmation?.existingEthAddress ?? null}
          ownerAddress={confirmation?.ownerAddress ?? null}
        />
      </ResolverSetupConfirmDialog>
    </>
  )
}
