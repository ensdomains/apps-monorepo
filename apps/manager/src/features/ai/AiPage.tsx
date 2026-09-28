import { Trans } from '@lingui/react/macro'
import { useFeatureFlagEnabled } from '@posthog/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useSelector } from '@xstate/store-react'
import { ArrowRight, Loader2 } from 'lucide-react'
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { BulkRenewDialog, type BulkRenewName } from '@/features/bulk-renew'
import {
  toBulkRenewName,
  toSelectableDomain,
} from '@/features/dashboard/bulkRenewSelection'
import { ChoosePrimaryNameDialog } from '@/features/dashboard/components/ChoosePrimaryNameDialog'
import { addFavoriteMutationOptions } from '@/features/dashboard/service/mutations/addFavorite'
import { removeFavoriteMutationOptions } from '@/features/dashboard/service/mutations/removeFavorite'
import { favoritesQueryOptions } from '@/features/dashboard/service/queries/getFavorites'
import {
  buildDashboardSearchResults,
  isSmartFilterAvailable,
  type SmartNameFilters,
} from '@/features/dashboard/smartNameSearch'
import { useDashboardV1Names } from '@/features/dashboard/useDashboardV1Names'
import { useOwnedDomains } from '@/features/dashboard/useOwnedDomains'
import { resolveDomainLabel } from '@/features/dashboard/utils'
import { GrainOverlay } from '@/features/migration/components/GrainOverlay'
import { EditProfileDialog } from '@/features/profile/components/dialogs/edit-profile/EditProfileDialog'
import { isConnectedProfileOwner } from '@/features/profile/components/view/connectedAccounts.helpers'
import {
  getProfileExpiryResultStatus,
  profileExpiryQuery,
} from '@/features/profile/service/profileExpiry'
import {
  getProfileFieldDefinition,
  getProfileNetwork,
} from '@/features/profile/service/profileFieldRegistry'
import { normalizeEthName } from '@/features/profile/service/profileName'
import { profileOwnerQuery } from '@/features/profile/service/profileOwner'
import { checkProfileEditProposal } from '@/features/profile/service/profileRecordProposal'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { profileReverseNameStrictQuery } from '@/features/profile/service/profileReverseName'
import { transformProfileRecords } from '@/features/profile/utils/transformRecords'
import { POSTHOG_FEATURE_FLAGS } from '@/lib/posthog/feature-flags'
import { useSmartAccountContext } from '@/lib/smart-account'
import { backendAuthStore } from '@/utils/backend-client'
import { AiConfirmationPreview } from './AiConfirmationPreview'
import { AiNamesResults } from './AiNamesResults'
import { AiPrompt } from './AiPrompt'
import {
  type AiConfirmationContext,
  confirmAiInterpretation,
  isAiConfirmationCurrent,
} from './actionConfirmation'
import { type AiDialog, resolveAiDialog } from './actionDialog'
import type { AiInterpretResult } from './intent'
import { interpretAiAction } from './interpretAiAction'
import { ManagerActionReview } from './ManagerActionReview'
import {
  getManagerActionTitle,
  type PreparedManagerAction,
} from './managerActions'
import { getNameSelectionIssue } from './nameSelection'
import { openAiAction } from './openAiAction'
import { prepareAiDetail } from './prepareAiDetail'
import {
  type AiHandoffInputs,
  type AiHandoffPreparation,
  type PreparedAiAction,
  prepareAiHandoff,
} from './prepareAiHandoff'

const actionTitle = (action: PreparedAiAction): string => {
  switch (action.intent) {
    case 'manager_action':
      return getManagerActionTitle(action)
    case 'set_primary':
      return `Set ${action.name} as primary`
    case 'register':
      return `Register ${action.name}`
    case 'renew':
      return `Renew ${action.name}`
    case 'find_names':
      return action.filters.expiry === 'in-grace'
        ? 'Names in grace'
        : action.filters.expiry === 'past-grace'
          ? 'Names past grace'
          : 'Your names'
    case 'bulk_renew':
      return 'Review names for bulk renewal'
    case 'migrate':
      return 'Upgrade eligible ENSv1 names'
    case 'edit_profile':
      return `Edit ${action.name}`
    case 'notification':
      return action.enabled ? 'Turn on notifications' : 'Turn off notifications'
    case 'favorite':
      return `Favourite ${action.name}`
    case 'view_name':
      return `View ${action.name}`
  }
}

const profileDescription = (
  action: Extract<PreparedAiAction, { intent: 'edit_profile' }>,
): string => {
  if (action.link)
    return `Open Links with ${action.link.url} proposed. Review and save it in the editor.`
  const proposal = action.proposal
  if (!proposal)
    return `Open the ${action.section} section of the profile editor.`
  const field =
    proposal.field === 'address'
      ? `${getProfileNetwork(proposal.coinType)?.name ?? 'Network'} address`
      : proposal.field === 'link'
        ? `link “${proposal.linkTarget ?? proposal.linkName}”`
        : (getProfileFieldDefinition(proposal.field)?.label ??
          proposal.field.replaceAll('_', ' '))
  switch (proposal.operation) {
    case 'remove':
      return `Remove ${field} from the draft. Review and save it in the editor.`
    case 'feature':
      return `Feature ${field} on this profile. Review and save it in the editor.`
    case 'unfeature':
      return `Stop featuring ${field} on this profile. Review and save it in the editor.`
    case 'use_eth':
      return 'Use the existing Ethereum address for this network. Review and save it in the editor.'
    case 'rename':
      return `Rename ${field} to ${proposal.field === 'link' ? proposal.linkName : proposal.value}. Review and save it in the editor.`
    default:
      return `Set ${field} to ${proposal.value} in the draft. Review and save it in the editor.`
  }
}

const actionDescription = (action: PreparedAiAction): string => {
  switch (action.intent) {
    case 'set_primary':
      return 'Review this name, then confirm with your wallet.'
    case 'register':
      return `Register for ${action.durationDays} days. Review availability and pricing in the next step.`
    case 'renew':
      if (action.targetDate)
        return `Renew to the end of ${action.targetDate} in your local calendar. Review the date and pricing before confirming.`
      return `Extend by ${action.durationYears ? `${action.durationYears} ${action.durationYears === 1 ? 'year' : 'years'}` : `${action.durationDays} days`}. Review pricing before confirming.`
    case 'find_names':
      return 'These filters are applied to the names loaded for your connected wallet.'
    case 'bulk_renew':
      return action.targetDate
        ? `Renew the eligible names to the end of ${action.targetDate} in your local calendar. Review each name’s expiry and price before confirming.`
        : 'Review the eligible names and renewal price before confirming.'
    case 'migrate':
      return action.excludeManagerRestoration
        ? 'Manager will check fresh eligibility and exclude names that need manager restoration.'
        : 'Manager will check fresh eligibility before showing the migration flow.'
    case 'edit_profile':
      return profileDescription(action)
    case 'notification':
      return `Open settings with ${action.preference === 'ensLabsUpdates' ? 'ENS Labs updates' : action.preference === 'ownedNameExpiry' ? 'owned name expiry reminders' : 'favourite name expiry reminders'} turned ${action.enabled ? 'on' : 'off'} in the draft. Review and save the change.`
    case 'manager_action':
      return 'Open the existing Manager control to review this request.'
    case 'favorite':
      return 'Add this name to your favourites after you confirm here.'
    case 'view_name':
      return 'Open the existing ENS profile page.'
  }
}

const resultMessage = (result: AiInterpretResult | null): string | null => {
  if (
    !result ||
    result.status === 'ok' ||
    result.status === 'needs_confirmation'
  )
    return null
  switch (result.status) {
    case 'unsupported':
      return 'I couldn’t match that request. Try finding names, editing a profile, or renewing a name.'
    case 'unauthorized':
      return 'Your Manager sign-in expired. Sign in with your wallet again to use AI actions.'
    case 'rate_limited':
      return 'You have reached the AI request limit. Try again in about a minute.'
    case 'unavailable':
      return 'AI interpretation is unavailable right now. Your existing Manager pages still work.'
  }
}

const resultTitle = (result: AiInterpretResult | null): string => {
  switch (result?.status) {
    case 'ok':
      return 'One more detail'
    case 'needs_confirmation':
      return 'Is this what you meant?'
    case 'unauthorized':
      return 'Sign in to continue'
    case 'rate_limited':
      return 'Try again shortly'
    case 'unavailable':
      return 'AI is unavailable'
    default:
      return 'Try another request'
  }
}

const previewDialogTitle = (
  isPending: boolean,
  action: PreparedAiAction | null,
  result: AiInterpretResult | null,
): string => {
  if (isPending) return 'Working on your request'
  return action ? actionTitle(action) : resultTitle(result)
}

const prepareNameSelection = (
  result: AiInterpretResult,
  inputs: AiHandoffInputs,
) => {
  if (result.status !== 'ok' || result.action.intent !== 'find_names')
    return null
  const selection = prepareAiHandoff(result.action, inputs)
  return selection.status === 'ready' &&
    selection.action.intent === 'find_names'
    ? selection.action
    : null
}

const actionButtonLabel = (action: PreparedAiAction): string => {
  switch (action.intent) {
    case 'manager_action':
      return 'Continue'
    case 'set_primary':
      return 'Review primary name'
    case 'register':
      return 'Continue to registration'
    case 'renew':
      return 'Continue to renewal'
    case 'find_names':
      return 'View matching names'
    case 'bulk_renew':
      return 'Review bulk renewal'
    case 'migrate':
      return 'Continue to migration'
    case 'edit_profile':
      return 'Open profile editor'
    case 'notification':
      return 'Open notification settings'
    case 'favorite':
      return 'Add to favourites'
    case 'view_name':
      return 'Open profile'
  }
}

type NameMatch = ReturnType<typeof buildDashboardSearchResults>[number]

const NameMatchesPreview = ({
  action,
  data,
}: {
  action: Extract<PreparedAiAction, { intent: 'find_names' | 'bulk_renew' }>
  data: ActionPreviewData
}) => {
  if (!data.filterDataAvailable) {
    return (
      <p className="py-8 text-center text-ens-quartz-500 text-sm" role="alert">
        Wallet data is unavailable. Please try again.
      </p>
    )
  }
  if (!data.nameDataReady) {
    return (
      <div
        className="flex items-center justify-center gap-3 py-16 text-ens-quartz-500 text-sm"
        role="status"
      >
        <Loader2 aria-hidden="true" className="size-5 animate-spin" />
        Loading your names…
      </div>
    )
  }
  return (
    <div>
      {action.intent === 'bulk_renew' ? (
        <p className="mb-5 text-ens-quartz-500 text-sm">
          {data.renewableCount} of {data.matches.length} matching names can be
          renewed together.
        </p>
      ) : null}
      <AiNamesResults
        favoriteLabels={data.favoriteLabels}
        filters={action.filters}
        isAuthenticated={data.isAuthenticated}
        migrationEnabled={data.migrationEnabled}
        names={action.names}
        onToggleFavorite={data.onToggleFavorite}
        primaryLabel={data.primaryLabel}
      />
    </div>
  )
}

type NeededDetailControlProps = {
  readonly preparation: Extract<AiHandoffPreparation, { status: 'needs_input' }>
  readonly value: string
  readonly error: string | null
  readonly onChange: (value: string) => void
}

const NeededDetailControl = ({
  preparation,
  value,
  error,
  onChange,
}: NeededDetailControlProps) => {
  const accessibility = {
    'aria-describedby': error ? 'ai-detail-error' : undefined,
    'aria-invalid': !!error,
    id: 'ai-needed-detail',
  }
  if (preparation.options) {
    return (
      <select
        {...accessibility}
        className="h-11 w-full rounded-lg border border-ens-quartz-200 bg-white px-3 outline-none focus-visible:border-ens-lapis-500 focus-visible:outline-2 focus-visible:outline-ens-lapis-500"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option disabled value="">
          Choose an option
        </option>
        {preparation.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  }
  if (preparation.multiline) {
    return (
      <textarea
        {...accessibility}
        className="min-h-24 w-full rounded-lg border border-ens-quartz-200 px-3 py-2 outline-none focus-visible:border-ens-lapis-500 focus-visible:outline-2 focus-visible:outline-ens-lapis-500"
        maxLength={500}
        onChange={(event) => onChange(event.target.value)}
        placeholder={preparation.placeholder}
        value={value}
      />
    )
  }
  const isDuration = preparation.field.startsWith('duration')
  const defaultPlaceholder =
    preparation.field === 'name'
      ? 'name.eth'
      : preparation.field === 'url'
        ? 'https://github.com/you'
        : 'e.g. 2'
  return (
    <input
      {...accessibility}
      className="h-11 w-full rounded-lg border border-ens-quartz-200 px-3 outline-none focus-visible:border-ens-lapis-500 focus-visible:outline-2 focus-visible:outline-ens-lapis-500"
      inputMode={isDuration ? 'numeric' : 'text'}
      min={preparation.minimum ?? 1}
      onChange={(event) => onChange(event.target.value)}
      placeholder={preparation.placeholder ?? defaultPlaceholder}
      type={isDuration ? 'number' : 'text'}
      value={value}
    />
  )
}

const NeededDetailPreview = ({
  preparation,
  value,
  error,
  onChange,
  onSubmit,
}: {
  preparation: Exclude<AiHandoffPreparation, { status: 'ready' }>
  value: string
  error: string | null
  onChange: (value: string) => void
  onSubmit: () => void
}) => {
  if (preparation.status === 'invalid') {
    return (
      <p
        className="rounded-xl bg-ens-garnet-100 p-4 text-ens-garnet-900 text-sm"
        role="alert"
      >
        {preparation.message}
      </p>
    )
  }
  const labels = {
    name: 'ENS name',
    url: 'Link URL',
    durationDays: 'Days',
    durationYears: 'Years',
    profileValue: 'Profile value',
    profileField: 'Profile field',
    durationUnit: 'Duration unit',
    notificationPreference: 'Notification preference',
    notificationEnabled: 'Notification setting',
    profileNetwork: 'Address network',
    profileLinkName: 'Link name',
    profileLinkTarget: 'Existing link title',
    address: 'Wallet address',
    managerValue: 'Value',
  } as const
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <p className="text-ens-quartz-500 text-sm">{preparation.message}</p>
      <label className="block space-y-2 text-sm" htmlFor="ai-needed-detail">
        <span className="font-medium">
          {preparation.label ?? labels[preparation.field]}
        </span>
        <NeededDetailControl
          error={error}
          onChange={onChange}
          preparation={preparation}
          value={value}
        />
      </label>
      {error ? (
        <p
          className="text-ens-garnet-900 text-sm"
          id="ai-detail-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <Button className="w-full" disabled={!value.trim()} type="submit">
        <Trans>Continue</Trans>
        <ArrowRight aria-hidden="true" className="ml-2 size-4" />
      </Button>
    </form>
  )
}

const ActionAccessStatus = ({
  action,
  profileReady,
  canEditProfile,
  migrationEnabled,
}: {
  action: PreparedAiAction
  profileReady: boolean
  canEditProfile: boolean
  migrationEnabled: boolean
}) => {
  if (action.intent === 'edit_profile') {
    return (
      <p className="text-ens-quartz-500 text-sm">
        {profileReady
          ? canEditProfile
            ? 'Ownership and edit access checked.'
            : 'This wallet cannot edit this profile in its current state.'
          : 'Checking ownership and expiry…'}
      </p>
    )
  }
  if (action.intent === 'migrate' && !migrationEnabled) {
    return (
      <p className="text-ens-garnet-900 text-sm">
        Migration is not enabled for this wallet.
      </p>
    )
  }
  return null
}

type ActionPreviewData = {
  matches: readonly NameMatch[]
  renewableCount: number
  nameDataReady: boolean
  filterDataAvailable: boolean
  profileReady: boolean
  canEditProfile: boolean
  migrationEnabled: boolean
  primaryLabel?: string | null
  favoriteLabels: ReadonlySet<string>
  isAuthenticated: boolean
  onToggleFavorite: (label: string) => void
}

const ReadyActionPreview = ({
  action,
  multiAction,
  data,
  issue,
  canContinue,
  isHandoffPending,
  onContinue,
}: {
  action: PreparedAiAction
  multiAction: Extract<AiInterpretResult, { status: 'ok' }>['multiAction']
  data: ActionPreviewData
  issue: string | null
  canContinue: boolean
  isHandoffPending: boolean
  onContinue: () => void
}) => (
  <div className="space-y-5">
    {action.intent !== 'find_names' &&
    action.intent !== 'bulk_renew' &&
    action.intent !== 'edit_profile' ? (
      <p className="text-ens-quartz-500 text-sm leading-relaxed">
        {actionDescription(action)}
      </p>
    ) : null}
    {multiAction ? (
      <p className="rounded-xl border border-ens-quartz-200 bg-ens-quartz-100 p-3 text-ens-quartz-600 text-sm">
        This also asks for {multiAction.nextIntent.replaceAll('_', ' ')}.
        Complete the first action, then ask for the second separately.
      </p>
    ) : null}
    {action.intent === 'find_names' || action.intent === 'bulk_renew' ? (
      <NameMatchesPreview action={action} data={data} />
    ) : null}
    <ActionAccessStatus
      action={action}
      canEditProfile={data.canEditProfile}
      migrationEnabled={data.migrationEnabled}
      profileReady={data.profileReady}
    />
    {issue ? (
      <p
        className="rounded-lg bg-ens-garnet-100 p-3 text-ens-garnet-900 text-sm"
        role="alert"
      >
        {issue}
      </p>
    ) : null}
    {action.intent === 'find_names' ? null : (
      <Button
        className="w-full"
        disabled={!canContinue || isHandoffPending}
        onClick={onContinue}
        size="lg"
        type="button"
      >
        {isHandoffPending ? (
          <Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" />
        ) : (
          <ArrowRight aria-hidden="true" className="mr-2 size-4" />
        )}
        {actionButtonLabel(action)}
      </Button>
    )}
  </div>
)

const ActionPreview = ({
  result,
  preparation,
  action,
  isPending,
  isHandoffPending,
  issue,
  canContinue,
  data,
  detailInput,
  detailError,
  onDetailChange,
  onDetailSubmit,
  onContinue,
  onConfirmInterpretation,
  onEditRequest,
}: {
  result: AiInterpretResult | null
  preparation: AiHandoffPreparation | null
  action: PreparedAiAction | null
  isPending: boolean
  isHandoffPending: boolean
  issue: string | null
  canContinue: boolean
  data: ActionPreviewData
  detailInput: string
  detailError: string | null
  onDetailChange: (value: string) => void
  onDetailSubmit: () => void
  onContinue: () => void
  onConfirmInterpretation: () => void
  onEditRequest: () => void
}) => {
  const errorMessage = resultMessage(result)
  let content: React.ReactNode = null
  if (isPending) {
    content = (
      <div
        className="flex min-h-55 flex-col items-center justify-center gap-3 text-ens-quartz-500"
        role="status"
      >
        <Loader2
          aria-hidden="true"
          className="size-7 animate-spin text-ens-lapis-500"
        />
        <Trans>Understanding your request…</Trans>
      </div>
    )
  } else if (errorMessage) {
    content = (
      <p
        className="rounded-xl bg-ens-garnet-100 p-4 font-sans text-ens-garnet-900 text-sm leading-relaxed"
        role="alert"
      >
        {errorMessage}
      </p>
    )
  } else if (result?.status === 'needs_confirmation') {
    content = (
      <AiConfirmationPreview
        onConfirm={onConfirmInterpretation}
        onEdit={onEditRequest}
        result={result}
      />
    )
  } else if (result?.status === 'ok' && action) {
    content = (
      <ReadyActionPreview
        action={action}
        canContinue={canContinue}
        data={data}
        isHandoffPending={isHandoffPending}
        issue={issue}
        multiAction={result.multiAction}
        onContinue={onContinue}
      />
    )
  } else if (
    result?.status === 'ok' &&
    preparation?.status !== 'ready' &&
    preparation
  ) {
    content = (
      <NeededDetailPreview
        error={detailError}
        onChange={onDetailChange}
        onSubmit={onDetailSubmit}
        preparation={preparation}
        value={detailInput}
      />
    )
  }

  return (
    <div aria-busy={isPending} aria-live="polite">
      {content}
    </div>
  )
}

const useAiNameData = (action: PreparedAiAction | null) => {
  const account = useSmartAccountContext()
  const migrationEnabled =
    useFeatureFlagEnabled(POSTHOG_FEATURE_FLAGS.MIGRATION, false) === true
  const owned = useOwnedDomains()
  const v1 = useDashboardV1Names({ migrationEnabled })
  const favoritesQuery = useQuery(favoritesQueryOptions)
  const favorites = favoritesQuery.data ?? []
  const primaryNameQuery = useQuery({
    ...profileReverseNameStrictQuery(account.ownerAddress ?? undefined),
    enabled: !!account.ownerAddress,
  })
  const primaryName = primaryNameQuery.data
  const favoriteLabels = useMemo(
    () => new Set(favorites.map((entry) => entry.name.toLowerCase())),
    [favorites],
  )
  const requestedFilters =
    action?.intent === 'find_names' || action?.intent === 'bulk_renew'
      ? action.filters
      : null
  const requestedNames =
    action?.intent === 'find_names' || action?.intent === 'bulk_renew'
      ? action.names
      : undefined
  const needsFavorites = requestedFilters?.favorite !== undefined
  const needsPrimary = requestedFilters?.primary !== undefined
  const favoritesReady =
    !needsFavorites ||
    (favoritesQuery.isSuccess &&
      !favoritesQuery.isPlaceholderData &&
      !favoritesQuery.isFetching)
  const primaryReady =
    !needsPrimary ||
    (!!account.ownerAddress &&
      primaryNameQuery.isSuccess &&
      !primaryNameQuery.isFetching)
  const matches = useMemo(
    () =>
      requestedFilters
        ? buildDashboardSearchResults({
            v2Names: owned.v2Names,
            v1Classified: v1.v1Names,
            searchQuery: '',
            sortField: 'name',
            sortDir: 'asc',
            smartFilters: requestedFilters,
            exactNames: requestedNames,
            primaryLabel: primaryName,
            favoriteLabels,
          })
        : [],
    [
      requestedFilters,
      requestedNames,
      owned.v2Names,
      v1.v1Names,
      primaryName,
      favoriteLabels,
    ],
  )
  const renewableNames = useMemo<BulkRenewName[]>(
    () =>
      matches.flatMap((item) => {
        if (item.kind !== 'v2') return []
        const name = toBulkRenewName(toSelectableDomain(item.domain))
        return name ? [name] : []
      }),
    [matches],
  )
  const nameDataReady =
    owned.isAllPagesLoaded &&
    !owned.isError &&
    !v1.isPending &&
    !v1.isError &&
    favoritesReady &&
    primaryReady
  const nameSelectionIssue = getNameSelectionIssue(
    action,
    nameDataReady,
    matches,
    renewableNames,
    [
      ...owned.v2Names.map(resolveDomainLabel),
      ...v1.v1Names.map(({ domain }) => domain.name),
    ],
  )
  const filterDataAvailable =
    !owned.isError &&
    !v1.isError &&
    (!requestedFilters ||
      (isSmartFilterAvailable(requestedFilters, {
        migrationEnabled,
        isAuthenticated: !favoritesQuery.isError,
      }) &&
        (!needsPrimary || !primaryNameQuery.isError)))

  return {
    migrationEnabled,
    favoriteLabels,
    primaryLabel: primaryName,
    matches,
    renewableNames,
    nameDataReady,
    filterDataAvailable,
    nameSelectionIssue,
  }
}

const useAiProfileData = (action: PreparedAiAction | null) => {
  const { address: walletAddress } = useConnection()
  const account = useSmartAccountContext()
  const editName = action?.intent === 'edit_profile' ? action.name : ''
  const profileOwner = useQuery({
    ...profileOwnerQuery(editName),
    enabled: !!editName,
  })
  const profileRecords = useQuery({
    ...profileRecordsQuery(editName),
    enabled: !!editName,
  })
  const profileExpiry = useQuery({
    ...profileExpiryQuery(editName, profileOwner.data?.protocol),
    enabled: !!editName && !!profileOwner.data,
  })
  const canEditProfile =
    !!editName &&
    !!profileOwner.data?.owner &&
    isConnectedProfileOwner({
      owner: profileOwner.data.owner,
      walletAddress,
      accountAddress: account.accountAddress,
      ownerAddress: account.ownerAddress,
    }) &&
    !(
      profileOwner.data.protocol === 'v1' && normalizeEthName(editName) !== null
    ) &&
    !profileOwner.isError &&
    !profileRecords.isError &&
    !profileExpiry.isError &&
    !getProfileExpiryResultStatus(profileExpiry.data).isInGrace
  const profileReady =
    !!editName &&
    !profileOwner.isPending &&
    !profileRecords.isPending &&
    (!profileOwner.data || !profileExpiry.isPending)
  const profileProposalIssue =
    profileReady &&
    profileRecords.data &&
    action?.intent === 'edit_profile' &&
    action.proposal
      ? checkProfileEditProposal(
          transformProfileRecords(profileRecords.data),
          action.proposal,
        )
      : null

  return {
    profileOwner,
    profileRecords,
    canEditProfile,
    profileReady,
    profileProposalIssue,
  }
}

const canContinueAction = (
  action: PreparedAiAction | null,
  nameData: ReturnType<typeof useAiNameData>,
  profileData: ReturnType<typeof useAiProfileData>,
): boolean => {
  if (!action) return false
  if (action.intent === 'bulk_renew') {
    return (
      nameData.nameDataReady &&
      nameData.filterDataAvailable &&
      nameData.renewableNames.length > 0
    )
  }
  if (action.intent === 'find_names') {
    return nameData.nameDataReady && nameData.filterDataAvailable
  }
  if (action.intent === 'edit_profile') {
    return (
      profileData.profileReady &&
      profileData.canEditProfile &&
      !profileData.profileProposalIssue
    )
  }
  if (action.intent === 'migrate') return nameData.migrationEnabled
  return true
}

// A new wallet starts a new draft and selection context. Names selected by one
// account must never become a follow-up action for a different account.
export const AiPage = () => {
  const { address } = useConnection()
  return <AiSessionPage key={address?.toLowerCase() ?? 'disconnected'} />
}

const AiSessionPage = () => {
  const { address } = useConnection()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const authToken = useSelector(
    backendAuthStore,
    (state) => state.context.authKey,
  )
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState<AiInterpretResult | null>(null)
  const [detailInput, setDetailInput] = useState('')
  const [detailError, setDetailError] = useState<string | null>(null)
  const [details, setDetails] = useState<AiHandoffInputs>({})
  const [hasConfirmedDetails, setHasConfirmedDetails] = useState(false)
  const [issue, setIssue] = useState<string | null>(null)
  const [isHandoffPending, setIsHandoffPending] = useState(false)
  const [activeDialog, setActiveDialog] = useState<AiDialog>(null)
  const [managerReview, setManagerReview] =
    useState<PreparedManagerAction | null>(null)
  const lastFilters = useRef<SmartNameFilters | undefined>(undefined)
  const lastNames = useRef<readonly string[] | undefined>(undefined)
  const promptRevision = useRef(0)
  const handoffRevision = useRef(0)
  const confirmationContext = useRef<AiConfirmationContext | null>(null)
  const currentConfirmationContext = useCallback((): AiConfirmationContext => {
    const context = backendAuthStore.get().context
    return {
      revision: promptRevision.current,
      walletAddress: address,
      authAddress: context.address,
      authToken: context.authKey,
      apiBaseUrlOverride: context.apiBaseUrlOverride,
    }
  }, [address])
  useEffect(
    () => () => {
      promptRevision.current += 1
      handoffRevision.current += 1
    },
    [],
  )
  const interpretation = useMutation({
    mutationFn: (data: { query: string; authToken: string }) =>
      interpretAiAction({ data }),
  })
  const addFavorite = useMutation(addFavoriteMutationOptions)
  const removeFavorite = useMutation(removeFavoriteMutationOptions)

  const preparation =
    result?.status === 'ok'
      ? prepareAiHandoff(result.action, {
          ...details,
          lastFilters: lastFilters.current,
          lastNames: lastNames.current,
        })
      : null
  const action = preparation?.status === 'ready' ? preparation.action : null
  const nameData = useAiNameData(action)
  const profileData = useAiProfileData(action)
  const {
    migrationEnabled,
    favoriteLabels,
    matches,
    renewableNames,
    nameDataReady,
    filterDataAvailable,
  } = nameData
  const {
    profileOwner,
    profileRecords,
    canEditProfile,
    profileReady,
    profileProposalIssue,
  } = profileData

  const resetActionPreview = useCallback(() => {
    confirmationContext.current = null
    setManagerReview(null)
    setResult(null)
    setIssue(null)
    setDetailInput('')
    setDetailError(null)
    setDetails({})
    setHasConfirmedDetails(false)
    handoffRevision.current += 1
    setIsHandoffPending(false)
    setActiveDialog(null)
  }, [])

  useEffect(() => {
    let previous = backendAuthStore.get().context
    const subscription = backendAuthStore.subscribe(({ context }) => {
      const changed =
        previous.authKey !== context.authKey ||
        previous.address?.toLowerCase() !== context.address?.toLowerCase() ||
        previous.apiBaseUrlOverride !== context.apiBaseUrlOverride
      previous = context
      if (!changed) return
      promptRevision.current += 1
      lastFilters.current = undefined
      lastNames.current = undefined
      resetActionPreview()
    })
    return () => subscription.unsubscribe()
  }, [resetActionPreview])

  const updatePrompt = (value: string) => {
    promptRevision.current += 1
    setPrompt(value)
    resetActionPreview()
  }

  const rememberNameSelection = (next: AiInterpretResult) => {
    const selection = prepareNameSelection(next, {
      lastFilters: lastFilters.current,
      lastNames: lastNames.current,
    })
    if (!selection) return
    lastFilters.current = selection.filters
    lastNames.current = selection.names
  }

  const submit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    const query = prompt.trim()
    if (!query || interpretation.isPending) return
    resetActionPreview()
    const context = currentConfirmationContext()
    confirmationContext.current = context
    setActiveDialog('auto')
    if (!isAiConfirmationCurrent(context, context)) {
      setResult({ status: 'unauthorized' })
      return
    }
    try {
      const next = await interpretation.mutateAsync({
        query,
        authToken: context.authToken ?? '',
      })
      if (!isAiConfirmationCurrent(context, currentConfirmationContext()))
        return
      if (next.status === 'unauthorized') backendAuthStore.trigger.signOut()
      setResult(next)
      rememberNameSelection(next)
    } catch {
      if (!isAiConfirmationCurrent(context, currentConfirmationContext()))
        return
      setResult({ status: 'unavailable' })
    }
  }

  const confirmInterpretation = () => {
    const next = confirmAiInterpretation(
      result,
      confirmationContext.current,
      currentConfirmationContext(),
    )
    if (!next) return
    confirmationContext.current = null
    setResult(next)
    setActiveDialog('review')
    rememberNameSelection(next)
  }

  const editRequest = () => {
    promptRevision.current += 1
    resetActionPreview()
  }

  const continueAction = async () => {
    if (!action || isHandoffPending) return
    setIssue(null)
    setIsHandoffPending(true)
    const revision = ++handoffRevision.current
    const isCurrent = () => revision === handoffRevision.current
    try {
      const nextIssue = await openAiAction(action, {
        navigate,
        queryClient,
        favoriteLabels,
        isCurrent,
        connectedAddress: address,
        openManagerReview: (proposal) => {
          setActiveDialog(null)
          setManagerReview(proposal)
        },
        addFavorite: addFavorite.mutateAsync,
        openPrimary: () => setActiveDialog('primary'),
        openBulkRenew: () => setActiveDialog('bulk'),
        openProfileEditor: () => setActiveDialog('profile'),
      })
      if (isCurrent()) setIssue(nextIssue)
    } catch {
      if (isCurrent())
        setIssue('Manager could not open that action. Please try again.')
    } finally {
      if (isCurrent()) setIsHandoffPending(false)
    }
  }

  const submitDetail = () => {
    if (result?.status !== 'ok' || preparation?.status !== 'needs_input') return
    const next = prepareAiDetail(
      result.action,
      {
        ...details,
        lastFilters: lastFilters.current,
        lastNames: lastNames.current,
      },
      preparation.field,
      detailInput,
    )
    if (next.status === 'invalid') {
      setDetailError(next.message)
      return
    }
    setDetails(next.inputs)
    setDetailInput('')
    setDetailError(null)
    setHasConfirmedDetails(next.preparation.status === 'ready')
  }

  const canContinue =
    !nameData.nameSelectionIssue &&
    canContinueAction(action, nameData, profileData)

  const originalPreparation =
    result?.status === 'ok'
      ? prepareAiHandoff(result.action, {
          lastFilters: lastFilters.current,
          lastNames: lastNames.current,
        })
      : null
  const visibleDialog = resolveAiDialog({
    requested: activeDialog,
    requiresConfirmation: result?.status === 'needs_confirmation',
    intent: action?.intent,
    isOriginalActionReady:
      originalPreparation?.status === 'ready' || hasConfirmedDetails,
    hasMultipleActions: result?.status === 'ok' && !!result.multiAction,
    canOpenProfile:
      profileReady &&
      canEditProfile &&
      !!profileRecords.data &&
      !profileProposalIssue,
  })
  const isNameResults =
    action?.intent === 'find_names' || action?.intent === 'bulk_renew'
  const dialogTitle = previewDialogTitle(
    interpretation.isPending,
    action,
    result,
  )
  const closeDialog = (open: boolean) => {
    if (!open) {
      if (result?.status === 'needs_confirmation') {
        editRequest()
        return
      }
      setActiveDialog(null)
      handoffRevision.current += 1
      setIsHandoffPending(false)
    }
  }
  const onToggleFavorite = (name: string) => {
    if (favoriteLabels.has(name.toLowerCase())) removeFavorite.mutate({ name })
    else addFavorite.mutate({ name })
  }

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center px-5 py-14 text-ens-lapis-900 sm:px-8 sm:pb-24">
      <GrainOverlay className="opacity-50" tone="lapis" />
      <AiPrompt
        isAuthenticated={!!authToken}
        isPending={interpretation.isPending}
        onChange={updatePrompt}
        onSubmit={(event) => void submit(event)}
        prompt={prompt}
      />
      <Dialog onOpenChange={closeDialog} open={visibleDialog === 'review'}>
        <DialogContent
          className={
            isNameResults
              ? 'max-w-[calc(100%-1rem)] gap-0 overflow-hidden rounded-2xl border-ens-quartz-200 p-0 sm:max-w-4xl'
              : 'max-w-[calc(100%-1rem)] gap-0 overflow-hidden rounded-2xl border-ens-quartz-200 p-0 sm:max-w-lg'
          }
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (activeDialog === null)
              document.getElementById('ai-prompt')?.focus()
          }}
          overlayClassName="bg-[#14233b]/20 backdrop-blur-sm"
        >
          <DialogHeader className="shrink-0 border-ens-quartz-150 border-b px-4 py-5 pr-12 text-left sm:px-7 sm:pr-12">
            <DialogTitle className="font-medium font-sans text-xl tracking-tight">
              {dialogTitle}
            </DialogTitle>
            <DialogDescription className="truncate text-ens-quartz-400 text-sm">
              {prompt}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-6 sm:px-7">
            <ActionPreview
              action={action}
              canContinue={!!canContinue}
              data={{
                matches,
                renewableCount: renewableNames.length,
                nameDataReady,
                filterDataAvailable,
                profileReady,
                canEditProfile,
                migrationEnabled,
                primaryLabel: nameData.primaryLabel,
                favoriteLabels,
                isAuthenticated: !!authToken,
                onToggleFavorite,
              }}
              detailError={detailError}
              detailInput={detailInput}
              isHandoffPending={isHandoffPending}
              isPending={interpretation.isPending}
              issue={
                issue ?? profileProposalIssue ?? nameData.nameSelectionIssue
              }
              onConfirmInterpretation={confirmInterpretation}
              onContinue={() => void continueAction()}
              onDetailChange={(value) => {
                setDetailInput(value)
                setDetailError(null)
              }}
              onDetailSubmit={submitDetail}
              onEditRequest={editRequest}
              preparation={preparation}
              result={result}
            />
          </div>
        </DialogContent>
      </Dialog>
      {managerReview ? (
        <ManagerActionReview
          action={managerReview}
          onClose={() => setManagerReview(null)}
        />
      ) : null}
      {action?.intent === 'set_primary' ? (
        <ChoosePrimaryNameDialog
          initialName={action.name}
          onOpenChange={closeDialog}
          open={visibleDialog === 'primary'}
        />
      ) : null}
      {action?.intent === 'bulk_renew' ? (
        <BulkRenewDialog
          initialDurationDays={action.durationDays}
          initialDurationYears={action.durationYears}
          initialTargetDate={action.targetDate}
          names={renewableNames}
          onOpenChange={closeDialog}
          open={visibleDialog === 'bulk'}
        />
      ) : null}
      {action?.intent === 'edit_profile' &&
      canEditProfile &&
      profileRecords.data ? (
        <EditProfileDialog
          initialLink={action.link}
          initialProposal={action.proposal}
          initialTab={action.section}
          name={action.name}
          onOpenChange={closeDialog}
          onUpdated={async () => {
            await queryClient.invalidateQueries({
              queryKey: profileRecordsQuery(action.name).queryKey,
            })
          }}
          open={visibleDialog === 'profile'}
          owner={profileOwner.data?.owner as Address | undefined}
          records={transformProfileRecords(profileRecords.data)}
        />
      ) : null}
    </div>
  )
}
