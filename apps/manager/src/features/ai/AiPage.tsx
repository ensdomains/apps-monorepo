import { Trans, useLingui } from '@lingui/react/macro'
import { useFeatureFlagEnabled } from '@posthog/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useSelector } from '@xstate/store-react'
import {
  ArrowRight,
  CircleHelp,
  Command,
  Loader2,
  Search,
  Sparkles,
} from 'lucide-react'
import { type FormEvent, useMemo, useRef, useState } from 'react'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { Button } from '@/components/ui/button'
import { BulkRenewDialog, type BulkRenewName } from '@/features/bulk-renew'
import {
  toBulkRenewName,
  toSelectableDomain,
} from '@/features/dashboard/bulkRenewSelection'
import { ChoosePrimaryNameDialog } from '@/features/dashboard/components/ChoosePrimaryNameDialog'
import { addFavoriteMutationOptions } from '@/features/dashboard/service/mutations/addFavorite'
import { favoritesQueryOptions } from '@/features/dashboard/service/queries/getFavorites'
import {
  buildDashboardSearchResults,
  isSmartFilterAvailable,
  type SmartNameFilters,
} from '@/features/dashboard/smartNameSearch'
import { useDashboardV1Names } from '@/features/dashboard/useDashboardV1Names'
import { useOwnedDomains } from '@/features/dashboard/useOwnedDomains'
import { EditProfileDialog } from '@/features/profile/components/dialogs/edit-profile/EditProfileDialog'
import { isConnectedProfileOwner } from '@/features/profile/components/view/connectedAccounts.helpers'
import {
  getProfileExpiryResultStatus,
  profileExpiryQuery,
} from '@/features/profile/service/profileExpiry'
import { normalizeEthName } from '@/features/profile/service/profileName'
import { profileOwnerQuery } from '@/features/profile/service/profileOwner'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { profileReverseNameStrictQuery } from '@/features/profile/service/profileReverseName'
import { transformProfileRecords } from '@/features/profile/utils/transformRecords'
import { getRegistrationV2AvailabilityQueryOptions } from '@/features/register-v2/data/queries/availability.query'
import { POSTHOG_FEATURE_FLAGS } from '@/lib/posthog/feature-flags'
import { useSmartAccountContext } from '@/lib/smart-account'
import { backendAuthStore } from '@/utils/backend-client'
import type { AiInterpretResult } from './intent'
import { interpretAiAction } from './interpretAiAction'
import {
  type AiHandoffPreparation,
  type PreparedAiAction,
  prepareAiHandoff,
} from './prepareAiHandoff'

const examples = [
  'Set yoginth.eth as primary name',
  'Register yoginth.eth for 69 days',
  'Renew name.eth for two years',
  'Show my manager names expiring within 45 days',
  'Upgrade eligible V1 names except ones needing manager restoration',
  'Add my GitHub to yoginth.eth',
  'Turn on favourite expiry reminders',
] as const

const actionTitle = (action: PreparedAiAction): string => {
  switch (action.intent) {
    case 'set_primary':
      return `Set ${action.name} as primary`
    case 'register':
      return `Register ${action.name}`
    case 'renew':
      return `Renew ${action.name}`
    case 'find_names':
      return 'Names matching your request'
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

const actionDescription = (action: PreparedAiAction): string => {
  switch (action.intent) {
    case 'set_primary':
      return 'Manager will verify this exact name and ask your wallet to confirm the primary name change.'
    case 'register':
      return `${action.durationDays} days. Manager will check availability, show the price and resulting expiry date, then ask you to confirm.`
    case 'renew':
      return `Add ${action.durationYears ? `${action.durationYears} ${action.durationYears === 1 ? 'year' : 'years'}` : `${action.durationDays} days`}. Manager will check the name, price and checkout conditions.`
    case 'find_names':
      return 'These filters are applied to the names loaded for your connected wallet.'
    case 'bulk_renew':
      return 'Only currently renewable ENSv2 .eth names will enter the existing review and pricing dialog.'
    case 'migrate':
      return action.excludeManagerRestoration
        ? 'Manager will check fresh eligibility and exclude names that need manager restoration.'
        : 'Manager will check fresh eligibility before showing the migration flow.'
    case 'edit_profile':
      return action.link
        ? `Open the ${action.section} editor with ${action.link.url} proposed. You review and save it.`
        : `Open the ${action.section} section of the existing profile editor. You review and save any changes.`
    case 'notification':
      return `Open notification settings with ${action.preference} proposed. Saving still requires a verified contact method.`
    case 'favorite':
      return 'Add this name to your favourites after you confirm here.'
    case 'view_name':
      return 'Open the existing ENS profile page.'
  }
}

const resultMessage = (result: AiInterpretResult | null): string | null => {
  if (!result || result.status === 'ok') return null
  switch (result.status) {
    case 'unsupported':
      return 'I could not safely match every part of that request to a supported Manager action. Try one action at a time.'
    case 'unauthorized':
      return 'Your Manager sign-in expired. Sign in with your wallet again to use AI actions.'
    case 'rate_limited':
      return 'You have reached the AI request limit. Try again in about a minute.'
    case 'unavailable':
      return 'AI interpretation is unavailable right now. Your existing Manager pages still work.'
  }
}

const actionButtonLabel = (action: PreparedAiAction): string => {
  switch (action.intent) {
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

const PromptComposer = ({
  prompt,
  isPending,
  isAuthenticated,
  onChange,
  onSubmit,
}: {
  prompt: string
  isPending: boolean
  isAuthenticated: boolean
  onChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) => {
  const { t } = useLingui()

  return (
    <form
      className="overflow-hidden rounded-2xl border border-ens-quartz-200 bg-white shadow-[0_18px_60px_rgba(7,28,47,0.07)]"
      onSubmit={onSubmit}
    >
      <label
        className="block px-5 pt-5 font-mono text-ens-quartz-400 text-xs uppercase tracking-wide"
        htmlFor="ai-prompt"
      >
        <Trans>Your request</Trans>
      </label>
      <textarea
        aria-describedby="ai-prompt-guidance"
        autoComplete="off"
        className="min-h-35 w-full resize-y border-0 bg-transparent px-5 py-4 font-sans text-lg leading-relaxed outline-none placeholder:text-ens-quartz-300 focus-visible:outline-2 focus-visible:outline-ens-lapis-500"
        id="ai-prompt"
        maxLength={160}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t`e.g. Renew name.eth for two years`}
        value={prompt}
      />
      <div className="flex flex-col gap-3 border-ens-quartz-100 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <span
          className="flex items-start gap-1.5 text-ens-quartz-400 text-xs sm:items-center"
          id="ai-prompt-guidance"
        >
          <CircleHelp aria-hidden="true" className="size-3.5 shrink-0" />
          <Trans>One action per request. You confirm every change.</Trans>
        </span>
        <Button
          className="w-full shrink-0 sm:w-auto"
          disabled={!prompt.trim() || isPending || !isAuthenticated}
          size="lg"
          type="submit"
        >
          {isPending ? (
            <Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" />
          ) : (
            <ArrowRight aria-hidden="true" className="mr-2 size-4" />
          )}
          <Trans>Find action</Trans>
        </Button>
      </div>
    </form>
  )
}

const ExamplePrompts = ({
  onChoose,
}: {
  onChoose: (example: string) => void
}) => (
  <div className="space-y-3">
    <div className="flex items-center gap-2 font-mono text-ens-quartz-400 text-xs uppercase tracking-wide">
      <Command aria-hidden="true" className="size-3.5" />
      <Trans>Try a request</Trans>
    </div>
    <div className="flex flex-wrap gap-2">
      {examples.map((example) => (
        <button
          className="rounded-full border border-ens-quartz-200 bg-white px-3.5 py-2 text-left font-sans text-ens-quartz-600 text-sm transition-colors hover:border-ens-lapis-500 hover:text-ens-lapis-500 focus-visible:outline-2 focus-visible:outline-ens-lapis-500"
          key={example}
          onClick={() => onChoose(example)}
          type="button"
        >
          {example}
        </button>
      ))}
    </div>
  </div>
)

const NameMatchesPreview = ({
  action,
  matches,
  renewableCount,
  nameDataReady,
  filterDataAvailable,
}: {
  action: Extract<PreparedAiAction, { intent: 'find_names' | 'bulk_renew' }>
  matches: readonly NameMatch[]
  renewableCount: number
  nameDataReady: boolean
  filterDataAvailable: boolean
}) => (
  <div className="space-y-3" id="ai-matches">
    {filterDataAvailable ? null : (
      <p className="text-ens-garnet-900 text-sm">
        Wallet data needed for this action is unavailable. Try again later.
      </p>
    )}
    {nameDataReady || !filterDataAvailable ? null : (
      <p className="text-ens-quartz-500 text-sm">
        Loading all wallet names before showing results…
      </p>
    )}
    {nameDataReady && filterDataAvailable ? (
      <>
        <p className="font-medium text-sm">
          {matches.length} matching {matches.length === 1 ? 'name' : 'names'}
          {action.intent === 'bulk_renew'
            ? ` · ${renewableCount} renewable`
            : ''}
        </p>
        <ul className="max-h-52 space-y-1 overflow-y-auto">
          {matches.slice(0, 20).map((item) => (
            <li
              className="flex items-center justify-between gap-2 rounded-lg bg-ens-quartz-100 px-3 py-2 text-sm"
              key={item.key}
            >
              <span className="min-w-0 truncate">{item.sortName}</span>
              <span className="shrink-0 font-mono text-ens-quartz-400 text-xs uppercase">
                {item.kind}
              </span>
            </li>
          ))}
        </ul>
        {matches.length > 20 ? (
          <p className="text-ens-quartz-400 text-xs">
            Showing the first 20 names. All matching renewable names enter the
            review.
          </p>
        ) : null}
      </>
    ) : null}
  </div>
)

const NeededDetailPreview = ({
  preparation,
  nameInput,
  durationInput,
  urlInput,
  onNameChange,
  onDurationChange,
  onUrlChange,
}: {
  preparation: Exclude<AiHandoffPreparation, { status: 'ready' }>
  nameInput: string
  durationInput: string
  urlInput: string
  onNameChange: (value: string) => void
  onDurationChange: (value: string) => void
  onUrlChange: (value: string) => void
}) => {
  if (preparation.status === 'invalid') {
    return (
      <p className="rounded-xl bg-ens-garnet-100 p-4 text-ens-garnet-900 text-sm">
        {preparation.message}
      </p>
    )
  }

  const labels = {
    name: 'ENS name',
    url: 'Link URL',
    durationDays: 'Days',
    durationYears: 'Years',
  } as const
  const isDuration = preparation.field.startsWith('duration')
  const value =
    preparation.field === 'name'
      ? nameInput
      : preparation.field === 'url'
        ? urlInput
        : durationInput
  const onChange =
    preparation.field === 'name'
      ? onNameChange
      : preparation.field === 'url'
        ? onUrlChange
        : onDurationChange

  return (
    <div className="space-y-4">
      <h2 className="font-sans text-xl">
        <Trans>One detail needed</Trans>
      </h2>
      <p className="text-ens-quartz-500 text-sm">{preparation.message}</p>
      <label className="block space-y-2 text-sm">
        <span className="font-medium">{labels[preparation.field]}</span>
        <input
          className="h-11 w-full rounded-lg border border-ens-quartz-200 px-3 outline-none focus-visible:border-ens-lapis-500 focus-visible:outline-2 focus-visible:outline-ens-lapis-500"
          inputMode={isDuration ? 'numeric' : 'text'}
          min={preparation.field === 'durationDays' ? 28 : 1}
          onChange={(event) => onChange(event.target.value)}
          placeholder={
            preparation.field === 'name'
              ? 'name.eth'
              : preparation.field === 'url'
                ? 'https://github.com/you'
                : 'e.g. 2'
          }
          type={isDuration ? 'number' : 'text'}
          value={value}
        />
      </label>
    </div>
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
    <div className="space-y-3">
      <span className="inline-block rounded-full bg-ens-lapis-100 px-2.5 py-1 font-mono text-ens-lapis-500 text-xs uppercase">
        <Trans>Understood</Trans>
      </span>
      <h2 className="font-sans text-2xl leading-tight tracking-tight">
        {actionTitle(action)}
      </h2>
      <p className="text-ens-quartz-500 text-sm leading-relaxed">
        {actionDescription(action)}
      </p>
    </div>
    {multiAction ? (
      <p className="rounded-xl border border-ens-quartz-200 bg-ens-quartz-100 p-3 text-ens-quartz-600 text-sm">
        This also asks for {multiAction.nextIntent.replaceAll('_', ' ')}.
        Complete the first action, then ask for the second separately.
      </p>
    ) : null}
    {action.intent === 'find_names' || action.intent === 'bulk_renew' ? (
      <NameMatchesPreview
        action={action}
        filterDataAvailable={data.filterDataAvailable}
        matches={data.matches}
        nameDataReady={data.nameDataReady}
        renewableCount={data.renewableCount}
      />
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
  nameInput,
  durationInput,
  urlInput,
  onNameChange,
  onDurationChange,
  onUrlChange,
  onContinue,
}: {
  result: AiInterpretResult | null
  preparation: AiHandoffPreparation | null
  action: PreparedAiAction | null
  isPending: boolean
  isHandoffPending: boolean
  issue: string | null
  canContinue: boolean
  data: ActionPreviewData
  nameInput: string
  durationInput: string
  urlInput: string
  onNameChange: (value: string) => void
  onDurationChange: (value: string) => void
  onUrlChange: (value: string) => void
  onContinue: () => void
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
        durationInput={durationInput}
        nameInput={nameInput}
        onDurationChange={onDurationChange}
        onNameChange={onNameChange}
        onUrlChange={onUrlChange}
        preparation={preparation}
        urlInput={urlInput}
      />
    )
  } else {
    content = (
      <div className="flex min-h-55 flex-col justify-center gap-3 text-center">
        <Search
          aria-hidden="true"
          className="mx-auto size-8 text-ens-quartz-300"
        />
        <p className="font-sans text-ens-quartz-500">
          <Trans>Enter a request to see what Manager can do.</Trans>
        </p>
      </div>
    )
  }

  return (
    <aside className="min-w-0 lg:row-span-2 lg:pt-5">
      <div className="rounded-2xl border border-ens-quartz-200 bg-white p-5 shadow-[0_18px_60px_rgba(7,28,47,0.04)] sm:p-6 lg:sticky lg:top-24 lg:min-h-80 lg:p-7">
        <div className="mb-6 flex items-center gap-2 font-mono text-ens-lapis-500 text-xs uppercase tracking-wide">
          <Sparkles aria-hidden="true" className="size-4" />
          <Trans>Action preview</Trans>
        </div>
        <div aria-busy={isPending} aria-live="polite">
          {content}
        </div>
      </div>
    </aside>
  )
}

type AiHandoffContext = {
  navigate: ReturnType<typeof useNavigate>
  queryClient: ReturnType<typeof useQueryClient>
  favoriteLabels: ReadonlySet<string>
  addFavorite: (input: { name: string }) => Promise<unknown>
  openPrimary: () => void
  openBulkRenew: () => void
  openProfileEditor: () => void
}

const openRegistration = async (
  action: Extract<PreparedAiAction, { intent: 'register' }>,
  { queryClient, navigate }: AiHandoffContext,
): Promise<string | null> => {
  const availability = await queryClient.fetchQuery({
    ...getRegistrationV2AvailabilityQueryOptions(action.name),
    staleTime: 0,
  })
  if (!availability?.isAvailable) {
    return `${action.name} is unavailable for registration.`
  }
  await navigate({
    to: '/register/$name',
    params: { name: action.name },
    search: { durationDays: action.durationDays },
  })
  return null
}

const openRenewal = async (
  action: Extract<PreparedAiAction, { intent: 'renew' }>,
  { queryClient, navigate }: AiHandoffContext,
): Promise<string | null> => {
  const owner = await queryClient.fetchQuery({
    ...profileOwnerQuery(action.name),
    staleTime: 0,
  })
  if (!owner?.owner) {
    return 'Manager could not find an active registration for this name.'
  }
  const search =
    action.durationYears === undefined
      ? { durationDays: action.durationDays }
      : { durationYears: action.durationYears }
  if (owner.protocol === 'v1') {
    await navigate({
      to: '/renew-v1/$name',
      params: { name: action.name },
      search,
    })
  } else {
    await navigate({
      to: '/renew/$name',
      params: { name: action.name },
      search,
    })
  }
  return null
}

const openAiAction = async (
  action: PreparedAiAction,
  context: AiHandoffContext,
): Promise<string | null> => {
  switch (action.intent) {
    case 'set_primary':
      context.openPrimary()
      return null
    case 'register':
      return openRegistration(action, context)
    case 'renew':
      return openRenewal(action, context)
    case 'find_names':
      document
        .getElementById('ai-matches')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return null
    case 'bulk_renew':
      context.openBulkRenew()
      return null
    case 'migrate':
      await context.navigate({
        to: '/migration',
        search: action.excludeManagerRestoration
          ? { preset: 'eligible-no-manager-restoration' }
          : {},
      })
      return null
    case 'edit_profile':
      context.openProfileEditor()
      return null
    case 'notification':
      await context.navigate({
        to: '/notifications/settings',
        search: {
          aiPreference: action.preference,
          aiEnabled: action.enabled,
        },
      })
      return null
    case 'favorite':
      if (context.favoriteLabels.has(action.name.toLowerCase())) {
        return `${action.name} is already in your favourites.`
      }
      await context.addFavorite({ name: action.name })
      return null
    case 'view_name':
      await context.navigate({ to: '/$name', params: { name: action.name } })
      return null
  }
}

const prepareCurrentAction = (
  result: AiInterpretResult | null,
  nameInput: string,
  durationInput: string,
  urlInput: string,
  lastFilters: SmartNameFilters | undefined,
): AiHandoffPreparation | null => {
  if (result?.status !== 'ok') return null
  return prepareAiHandoff(result.action, {
    name: nameInput,
    durationDays:
      result.action.intent === 'register' && durationInput
        ? Number(durationInput)
        : undefined,
    durationYears:
      result.action.intent === 'renew' && durationInput
        ? Number(durationInput)
        : undefined,
    url: urlInput,
    lastFilters,
  })
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
            primaryLabel: primaryName,
            favoriteLabels,
          })
        : [],
    [requestedFilters, owned.v2Names, v1.v1Names, primaryName, favoriteLabels],
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
    matches,
    renewableNames,
    nameDataReady,
    filterDataAvailable,
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
    !getProfileExpiryResultStatus(profileExpiry.data).isInGrace
  const profileReady =
    !!editName &&
    !profileOwner.isPending &&
    !profileRecords.isPending &&
    !profileExpiry.isPending

  return { profileOwner, profileRecords, canEditProfile, profileReady }
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
    return profileData.profileReady && profileData.canEditProfile
  }
  if (action.intent === 'migrate') return nameData.migrationEnabled
  return true
}

export const AiPage = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const authToken = useSelector(
    backendAuthStore,
    (state) => state.context.authKey,
  )
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState<AiInterpretResult | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [durationInput, setDurationInput] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [issue, setIssue] = useState<string | null>(null)
  const [isHandoffPending, setIsHandoffPending] = useState(false)
  const [primaryOpen, setPrimaryOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const lastFilters = useRef<SmartNameFilters | undefined>(undefined)
  const interpretation = useMutation({
    mutationFn: (query: string) =>
      interpretAiAction({ data: { query, authToken: authToken ?? '' } }),
  })
  const addFavorite = useMutation(addFavoriteMutationOptions)

  const preparation = prepareCurrentAction(
    result,
    nameInput,
    durationInput,
    urlInput,
    lastFilters.current,
  )
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
  const { profileOwner, profileRecords, canEditProfile, profileReady } =
    profileData

  const submit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    const query = prompt.trim()
    if (!query || interpretation.isPending) return
    setResult(null)
    setIssue(null)
    setNameInput('')
    setDurationInput('')
    setUrlInput('')
    setPrimaryOpen(false)
    setEditOpen(false)
    setBulkOpen(false)
    try {
      const next = await interpretation.mutateAsync(query)
      if (next.status === 'unauthorized') backendAuthStore.trigger.signOut()
      setResult(next)
      if (next.status === 'ok' && next.action.intent === 'find_names') {
        lastFilters.current = next.action.filters
      }
    } catch {
      setResult({ status: 'unavailable' })
    }
  }

  const continueAction = async () => {
    if (!action || isHandoffPending) return
    setIssue(null)
    setIsHandoffPending(true)
    try {
      const nextIssue = await openAiAction(action, {
        navigate,
        queryClient,
        favoriteLabels,
        addFavorite: addFavorite.mutateAsync,
        openPrimary: () => setPrimaryOpen(true),
        openBulkRenew: () => setBulkOpen(true),
        openProfileEditor: () => setEditOpen(true),
      })
      setIssue(nextIssue)
    } catch {
      setIssue('Manager could not open that action. Please try again.')
    } finally {
      setIsHandoffPending(false)
    }
  }

  const canContinue = canContinueAction(action, nameData, profileData)

  return (
    <main className="min-h-screen flex-1 bg-[#faf9f7] px-4 py-8 text-[#222122] md:px-8 md:py-14">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:gap-12">
        <section className="min-w-0 space-y-8">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-ens-lapis-500/20 bg-white px-3 py-1.5 font-mono text-ens-lapis-500 text-xs uppercase tracking-wider">
              <Sparkles aria-hidden="true" className="size-3.5" /> ENS Manager
              AI
            </div>
            <h1 className="max-w-3xl font-sans text-[clamp(2.5rem,5vw,4.5rem)] leading-[0.98] tracking-[-0.055em]">
              <Trans>Tell Manager what you want to do.</Trans>
            </h1>
            <p className="max-w-xl font-sans text-base text-ens-quartz-500 leading-relaxed md:text-lg">
              <Trans>
                Describe one ENS task. Manager checks the details and opens the
                existing flow for you to review.
              </Trans>
            </p>
          </div>

          <PromptComposer
            isAuthenticated={!!authToken}
            isPending={interpretation.isPending}
            onChange={setPrompt}
            onSubmit={(event) => void submit(event)}
            prompt={prompt}
          />
        </section>

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
          }}
          durationInput={durationInput}
          isHandoffPending={isHandoffPending}
          isPending={interpretation.isPending}
          issue={issue}
          nameInput={nameInput}
          onContinue={() => void continueAction()}
          onDurationChange={setDurationInput}
          onNameChange={setNameInput}
          onUrlChange={setUrlInput}
          preparation={preparation}
          result={result}
          urlInput={urlInput}
        />
        <ExamplePrompts
          onChoose={(example) => {
            setPrompt(example)
            setIssue(null)
          }}
        />
      </div>
      {action?.intent === 'set_primary' ? (
        <ChoosePrimaryNameDialog
          initialName={action.name}
          onOpenChange={setPrimaryOpen}
          open={primaryOpen}
        />
      ) : null}
      {action?.intent === 'bulk_renew' ? (
        <BulkRenewDialog
          names={renewableNames}
          onOpenChange={setBulkOpen}
          open={bulkOpen}
        />
      ) : null}
      {action?.intent === 'edit_profile' &&
      canEditProfile &&
      profileRecords.data ? (
        <EditProfileDialog
          initialLink={action.link}
          initialTab={action.section}
          name={action.name}
          onOpenChange={setEditOpen}
          onUpdated={async () => {
            await queryClient.invalidateQueries({
              queryKey: profileRecordsQuery(action.name).queryKey,
            })
          }}
          open={editOpen}
          owner={profileOwner.data?.owner as Address | undefined}
          records={transformProfileRecords(profileRecords.data)}
        />
      ) : null}
    </main>
  )
}
