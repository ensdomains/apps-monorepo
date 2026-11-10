import { isDQAEnabled } from '@ens-apps/dev-dqa-overlay'
import { isMigrationToolEnabled } from '@ens-apps/dev-migration-tool'
import { isTimeTravelEnabled } from '@ens-apps/dev-time-travel'
import { useQueryClient } from '@tanstack/react-query'
import { useMatches, useRouter } from '@tanstack/react-router'
import { ResultAsync } from 'neverthrow'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'
import { match } from 'ts-pattern'
import { useConnection, useDisconnect } from 'wagmi'
import { RpcSettingsDialog } from '@/components/RpcSettingsDialog'
import { getAddressNamesQueryOptions } from '@/features/dashboard/hooks/useAddressNames'
import { useSearchResults } from '@/features/dashboard/hooks/useSearchResults'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import { useConnectModal } from '@/features/wallet/ConnectModalProvider'
import { useDebouncedValue } from '@/hooks/useDebounce'
import { ensChain } from '@/lib/wagmi'
import { PALETTE_COMMANDS } from './catalog'
import {
  type PageCommand,
  PaletteActionsContext,
  type PaletteOpenOptions,
} from './context'
import { resolveCommandTarget } from './core/search'
import type { PaletteState } from './core/state'
import type {
  PaletteCommand,
  PaletteContext,
  PaletteEntity,
} from './core/types'
import { hasBlockingPaletteDialog } from './dialogBoundary'
import {
  describeExecutionError,
  type ExecutionDependencies,
  executePlan,
} from './executePlan'
import {
  createExecutionPlan,
  type ExecutionPlan,
  type PaletteNavigation,
} from './executionPlan'
import { cancelPaletteHandoff, paletteHandoff } from './handoff'
import { navigatePalette } from './navigatePalette'
import { PaletteDeveloperTools } from './PaletteDeveloperTools'
import { PaletteDialog } from './PaletteDialog'
import {
  getEnabledCommands,
  getEntityQueryPolicy,
  getFailedSearchReads,
  getPalettePresentation,
  getPaletteReadError,
  getSearchFeedback,
  visibleSearchResults,
} from './presentation'
import { PALETTE_AVAILABILITY_STALE_TIME_MS } from './queryPolicy'
import { buildPaletteRows, type PaletteRow } from './resultModel'
import { getRouteEntity } from './routeContext'
import { useCachedPaletteTarget } from './useCachedPaletteTarget'
import { usePaletteNavigation } from './usePaletteNavigation'
import { usePaletteRecents } from './usePaletteRecents'
import { usePaletteRelatedEntities } from './usePaletteRelatedEntities'
import { usePaletteRouteLifecycle } from './usePaletteRouteLifecycle'
import { usePaletteSession } from './usePaletteSession'
import { usePaletteShortcut } from './usePaletteShortcut'

type OpenState = Extract<PaletteState, { status: 'open' }>
const EMPTY_FRAME: OpenState['current'] = {
  screen: { type: 'root' },
  query: '',
  selectedId: '',
  scrollTop: 0,
}
const SEARCH_DEBOUNCE_MS = 250
const NO_NAVIGATION = () => {}
const TOOL_CAPABILITIES = {
  timeTravel: isTimeTravelEnabled(),
  migration: isMigrationToolEnabled(),
  designQa: isDQAEnabled(),
}
const ENABLED_COMMANDS = getEnabledCommands(PALETTE_COMMANDS, TOOL_CAPABILITIES)

export const CommandPaletteProvider = ({
  children,
}: {
  readonly children: ReactNode
}) => {
  const { state, dispatch, recordScroll, capture } = usePaletteNavigation()
  const [registrations, setRegistrations] = useState<
    Readonly<Record<string, readonly PageCommand[]>>
  >({})
  const [error, setError] = useState<string>()
  const [isRpcOpen, setRpcOpen] = useState(false)
  const [developerTool, setDeveloperTool] =
    useState<Extract<ExecutionPlan, { type: 'developer' }>['tool']>()
  const matches = useMatches()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { address } = useConnection()
  const { disconnectAsync } = useDisconnect()
  const { openConnectModal, cancelConnectContinuation, isConnectFlowActive } =
    useConnectModal()
  const entity = useMemo(
    () => getRouteEntity(matches.map((route) => route.params)),
    [matches],
  )
  const context: PaletteContext = useMemo(
    () => ({
      entity,
      walletAddress: address,
      chainId: ensChain.id,
      developerEnabled: Object.values(TOOL_CAPABILITIES).some(Boolean),
    }),
    [entity, address],
  )
  const latestContext = useRef(context)
  const latestBegin = useRef<
    (command: PaletteCommand, entity?: PaletteEntity) => void
  >(() => {})
  const pendingClose = useRef<(() => void) | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const lastOpen = useRef<OpenState | null>(null)
  const retryCommand = useRef<(() => void) | null>(null)
  const activeSnapshot = useRef<OpenState | null>(null)
  const expectedNavigation = useRef<PaletteNavigation | null>(null)
  const session = usePaletteSession()
  useLayoutEffect(() => {
    latestContext.current = context
    if (state.status === 'open') lastOpen.current = state
  }, [context, state])

  const openPalette = useCallback(
    (options?: PaletteOpenOptions) => {
      if (isConnectFlowActive || hasBlockingPaletteDialog()) return
      session.invalidate()
      activeSnapshot.current = null
      expectedNavigation.current = null
      retryCommand.current = null
      cancelConnectContinuation()
      cancelPaletteHandoff()
      pendingClose.current = null
      returnFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      setError(undefined)
      const inlineQuery =
        document.activeElement instanceof HTMLInputElement &&
        document.activeElement.hasAttribute('data-palette-inline-input')
          ? document.activeElement.value
          : undefined
      dispatch({ type: 'open', query: options?.query ?? inlineQuery })
      if (options?.entity)
        dispatch({
          type: 'push',
          screen: { type: 'entity', entity: options.entity },
        })
    },
    [cancelConnectContinuation, isConnectFlowActive, session, dispatch],
  )
  const closePalette = useCallback(() => {
    session.invalidate()
    pendingClose.current = null
    activeSnapshot.current = null
    retryCommand.current = null
    expectedNavigation.current = null
    cancelConnectContinuation()
    dispatch({ type: 'close' })
  }, [cancelConnectContinuation, session, dispatch])
  usePaletteShortcut({
    isOpen: state.status === 'open',
    isBlocked: isConnectFlowActive,
    open: openPalette,
    close: closePalette,
  })
  const onRouteDeparture = useCallback(() => {
    const destination = expectedNavigation.current
    const isOwnedNavigation =
      destination &&
      router.buildLocation(destination).pathname ===
        router.state.location.pathname
    if (!isOwnedNavigation) {
      session.invalidate()
      activeSnapshot.current = null
      expectedNavigation.current = null
      retryCommand.current = null
      dispatch({ type: 'close' })
    }
    cancelConnectContinuation()
    pendingClose.current = null
  }, [cancelConnectContinuation, router, session, dispatch])
  usePaletteRouteLifecycle(onRouteDeparture)
  const registerPageCommands = useCallback(
    (owner: string, commands: readonly PageCommand[]) => {
      setRegistrations((previous) => ({ ...previous, [owner]: commands }))
      return () =>
        setRegistrations((previous) =>
          Object.fromEntries(
            Object.entries(previous).filter(([key]) => key !== owner),
          ),
        )
    },
    [],
  )
  const actions = useMemo(
    () => ({
      isAvailable: true,
      openPalette,
      closePalette,
      registerPageCommands,
    }),
    [openPalette, closePalette, registerPageCommands],
  )

  const restoreFailure = useCallback(
    (
      message: string,
      snapshot: OpenState | null = activeSnapshot.current,
      generation = session.capture(),
    ) => {
      if (!session.isCurrent(generation)) return
      expectedNavigation.current = null
      if (snapshot) dispatch({ type: 'restore', state: snapshot })
      setError(message)
    },
    [session, dispatch],
  )
  useHandoffFeedback(activeSnapshot, restoreFailure, session)

  const queueAfterClose = (operation: () => void) => {
    if (pendingClose.current) return
    activeSnapshot.current = capture() ?? lastOpen.current
    if (state.status === 'closed') {
      operation()
      return
    }
    pendingClose.current = operation
    setError(undefined)
    dispatch({ type: 'close' })
  }
  const runPlan = async (plan: ExecutionPlan) => {
    const generation = session.capture()
    const snapshot = activeSnapshot.current
    const account = latestContext.current.walletAddress
    const dependencies: ExecutionDependencies = {
      navigate: (navigation) => {
        expectedNavigation.current = navigation
        return navigatePalette(router, navigation)
      },
      chainId: ensChain.id,
      account,
      isAtDestination: (navigation) =>
        router.buildLocation(navigation).href === router.state.location.href,
      writeClipboard: (value) => navigator.clipboard.writeText(value),
      openRpc: () => setRpcOpen(true),
      connect: () => openConnectModal(),
      disconnect: () => disconnectAsync(),
      openDeveloper: (tool) => setDeveloperTool(tool),
    }
    const result = await executePlan(plan, dependencies)
    if (!session.isCurrent(generation)) return
    if (result.isErr()) {
      restoreFailure(describeExecutionError(result.error), snapshot, generation)
      return
    }
    if (plan.type === 'copy') toast.success(`${plan.label} copied`)
    if (!paletteHandoff.getSnapshot().pending) {
      activeSnapshot.current = null
      expectedNavigation.current = null
    }
  }
  const requestConnection = (
    command: PaletteCommand,
    target?: PaletteEntity,
  ) => {
    const location = router.state.location.href
    const generation = session.capture()
    const snapshot = capture() ?? lastOpen.current
    queueAfterClose(() =>
      openConnectModal({
        onResult: (result) => {
          if (
            !session.isCurrent(generation) ||
            router.state.location.href !== location
          )
            return
          if (result === 'connected') latestBegin.current(command, target)
          else if (snapshot) dispatch({ type: 'restore', state: snapshot })
        },
      }),
    )
  }
  const beginCommand = (
    command: PaletteCommand,
    explicitEntity?: PaletteEntity,
  ) => {
    retryCommand.current = () => latestBegin.current(command, explicitEntity)
    const currentContext = latestContext.current
    const resolution = resolveCommandTarget({
      command,
      context: currentContext,
      entity: explicitEntity,
    })
    if (resolution.status === 'needs-target') {
      dispatch({
        type: 'push',
        screen: {
          type: 'target',
          commandId: command.id,
          target: resolution.target,
        },
      })
      return
    }
    if (resolution.status === 'needs-wallet') {
      requestConnection(command, explicitEntity)
      return
    }
    const plan = createExecutionPlan({
      command,
      entity: resolution.entity,
      context: currentContext,
      origin: window.location.origin,
    })
    if (plan.status === 'blocked') {
      setError(plan.reason)
      return
    }
    if (plan.status === 'needs-connection') {
      requestConnection(command, resolution.entity ?? undefined)
      return
    }
    const expectedAccount = currentContext.walletAddress
    queueAfterClose(() => {
      if (latestContext.current.walletAddress !== expectedAccount) {
        restoreFailure('The connected wallet changed. Choose the action again.')
        return
      }
      void runPlan(plan.plan)
    })
  }
  useLayoutEffect(() => {
    latestBegin.current = beginCommand
  })

  const frame =
    state.status === 'open'
      ? (capture()?.current ?? state.current)
      : (lastOpen.current?.current ?? EMPTY_FRAME)
  const policy = getEntityQueryPolicy(frame, context, ENABLED_COMMANDS)
  const debouncedQuery = useDebouncedValue(policy.query, SEARCH_DEBOUNCE_MS)
  const data = useSearchResults({
    searchValue: policy.query,
    enabled:
      state.status === 'open' &&
      policy.isEnabled &&
      policy.query === debouncedQuery,
    fetchOwnedNames: state.status === 'open' && policy.shouldFetchOwnedNames,
    suggestionMode: 'focused',
    verificationLimit: 1,
    verificationMode: 'discovery',
    queryStaleTime: PALETTE_AVAILABILITY_STALE_TIME_MS,
    navigateToName: NO_NAVIGATION,
    navigateToAddress: NO_NAVIGATION,
    navigateToResolver: NO_NAVIGATION,
  })
  const visibleData = visibleSearchResults(
    data,
    policy.query,
    frame.screen.type === 'target',
  )
  const { recentEntities, clearRecents } = usePaletteRecents({
    entity,
    chainId: ensChain.id,
    walletAddress: address,
  })
  const subject =
    frame.screen.type === 'entity' ? frame.screen.entity : context.entity
  const targetMetadata = useCachedPaletteTarget(subject)
  const related = usePaletteRelatedEntities(
    subject,
    state.status === 'open' && frame.screen.type === 'entity',
  )
  const rows = buildPaletteRows({
    frame,
    context,
    data: visibleData,
    recents: recentEntities,
    pageCommands: Object.values(registrations).flat(),
    commands: ENABLED_COMMANDS,
    targetMetadata,
    related: related.entities,
  })
  const presentation = getPalettePresentation(frame, ENABLED_COMMANDS)

  const activate = (row: PaletteRow) => {
    setError(undefined)
    retryCommand.current = null
    match(row.action)
      .with({ type: 'command' }, ({ command, entity: selected }) =>
        beginCommand(command, selected),
      )
      .with({ type: 'view' }, ({ entity: selected, resolver }) => {
        retryCommand.current = () => activate(row)
        if (selected.type === 'name')
          queueAfterClose(() => {
            void runPlan({
              type: 'navigate',
              navigation: { to: '/$name', params: { name: selected.name } },
            })
          })
        else if (resolver)
          queueAfterClose(() => {
            void runPlan({
              type: 'navigate',
              navigation: {
                to: '/resolver/$address',
                params: { address: selected.address },
              },
            })
          })
        else
          queueAfterClose(() => {
            void runPlan({
              type: 'navigate',
              navigation: {
                to: '/addr/$addr',
                params: { addr: selected.address },
              },
            })
          })
      })
      .with({ type: 'actions' }, ({ entity: selected }) =>
        dispatch({
          type: 'push',
          screen: { type: 'entity', entity: selected },
        }),
      )
      .with({ type: 'pick' }, ({ entity: selected }) => {
        const screen = frame.screen
        const command =
          screen.type === 'target'
            ? ENABLED_COMMANDS.find((item) => item.id === screen.commandId)
            : undefined
        if (command) beginCommand(command, selected)
      })
      .with({ type: 'another-target' }, ({ command }) =>
        dispatch({
          type: 'push',
          screen: { type: 'target', commandId: command.id, target: 'name' },
        }),
      )
      .with({ type: 'query' }, ({ query }) =>
        dispatch({ type: 'query', query }),
      )
      .with({ type: 'developer' }, () =>
        dispatch({ type: 'push', screen: { type: 'developer' } }),
      )
      .with({ type: 'page' }, ({ command }) => {
        if (command.disabledReason) {
          setError(command.disabledReason)
          return
        }
        retryCommand.current = () => activate(row)
        const generation = session.capture()
        const snapshot = capture() ?? lastOpen.current
        queueAfterClose(() => {
          void ResultAsync.fromPromise(
            Promise.resolve().then(command.onSelect),
            (cause) => cause,
          ).mapErr(() =>
            restoreFailure(
              'Could not complete this page action. Your selection is unchanged.',
              snapshot,
              generation,
            ),
          )
        })
      })
      .with({ type: 'clear-recents' }, clearRecents)
      .with({ type: 'copy' }, ({ value, label }) => {
        retryCommand.current = () => activate(row)
        queueAfterClose(() => {
          void runPlan({ type: 'copy', value, label })
        })
      })
      .exhaustive()
  }
  const retrySearch = () => {
    if (retryCommand.current) {
      retryCommand.current()
      return
    }
    if (frame.screen.type === 'entity') {
      void related.retry()
      return
    }
    const failedQueries = getFailedSearchReads(visibleData).map(
      ({ name, source }) =>
        match(source)
          .with('owner', () => getEnsOwnerQueryOptions({ name }).queryKey)
          .with(
            'availability',
            () => getNameAvailabilityQueryOptions({ name }).queryKey,
          )
          .with(
            'records',
            () =>
              getProfileQueryOptions({ name, includeLegacyRecords: false })
                .queryKey,
          )
          .exhaustive(),
    )
    void Promise.all([
      ...failedQueries.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
      ...(data.hasOwnedNamesError && address
        ? [
            queryClient.invalidateQueries({
              queryKey: getAddressNamesQueryOptions({ address }).queryKey,
            }),
          ]
        : []),
    ]).catch(() => setError('Could not retry the lookup. Try again.'))
  }

  const { hasReadFailure, isSearching } = getSearchFeedback(
    visibleData,
    policy.isEnabled,
    policy.query !== debouncedQuery,
  )

  return (
    <PaletteActionsContext.Provider value={actions}>
      {children}
      <PaletteDialog
        isOpen={state.status === 'open'}
        frame={frame}
        rows={rows}
        {...presentation}
        canGoBack={state.status === 'open' && state.history.length > 0}
        notice={
          visibleData.searchNotice ??
          (frame.screen.type === 'target' && data.isOwnedNamesLoading
            ? 'Loading names associated with your wallet. You can search any name.'
            : undefined)
        }
        error={
          error ??
          getPaletteReadError({
            hasSearchError: hasReadFailure,
            hasRelationshipError: related.hasError,
            hasPortfolioError:
              frame.screen.type === 'target' && data.hasOwnedNamesError,
          })
        }
        isSearching={isSearching || related.isLoading}
        onClose={closePalette}
        onBack={() => {
          session.invalidate()
          setError(undefined)
          retryCommand.current = null
          activeSnapshot.current = null
          expectedNavigation.current = null
          cancelConnectContinuation()
          cancelPaletteHandoff()
          dispatch({ type: 'back' })
        }}
        onQueryChange={(query) => {
          setError(undefined)
          retryCommand.current = null
          dispatch({ type: 'query', query })
        }}
        onSelectionChange={(selectedId) =>
          dispatch({ type: 'select', selectedId })
        }
        onScroll={recordScroll}
        onActivate={activate}
        onRetry={retrySearch}
        onClearHistory={() => {
          clearRecents()
          toast.success('Search history cleared')
        }}
        onClosed={(event) => {
          const operation = pendingClose.current
          pendingClose.current = null
          if (operation) {
            event.preventDefault()
            operation()
          } else if (
            returnFocus.current?.isConnected &&
            returnFocus.current.getClientRects().length > 0
          ) {
            event.preventDefault()
            returnFocus.current.focus()
          } else {
            const mobileTrigger = document.querySelector<HTMLElement>(
              '[data-palette-mobile-trigger] button',
            )
            if (mobileTrigger?.getClientRects().length) {
              event.preventDefault()
              mobileTrigger.focus()
            }
          }
        }}
      />
      <RpcSettingsDialog isOpen={isRpcOpen} onOpenChange={setRpcOpen} />
      <PaletteDeveloperTools
        tool={developerTool}
        onClose={() => setDeveloperTool(undefined)}
      />
    </PaletteActionsContext.Provider>
  )
}

const useHandoffFeedback = (
  snapshot: { readonly current: OpenState | null },
  restoreFailure: (
    message: string,
    snapshot: OpenState | null,
    generation: number,
  ) => void,
  session: ReturnType<typeof usePaletteSession>,
) => {
  const pendingRequest = useRef<{
    readonly requestId: number
    readonly generation: number
    readonly snapshot: OpenState | null
  } | null>(null)
  useEffect(
    () =>
      paletteHandoff.subscribe(() => {
        const handoff = paletteHandoff.getSnapshot()
        if (handoff.pending) {
          pendingRequest.current = {
            requestId: handoff.pending.requestId,
            generation: session.capture(),
            snapshot: snapshot.current,
          }
          toast.loading('Checking the selected action…', {
            id: 'palette-handoff',
          })
        } else {
          toast.dismiss('palette-handoff')
          const request = pendingRequest.current
          pendingRequest.current = null
          if (
            handoff.outcome?.status === 'blocked' &&
            request?.requestId === handoff.outcome.requestId
          )
            restoreFailure(
              handoff.outcome.reason,
              request.snapshot,
              request.generation,
            )
        }
      }),
    [snapshot, restoreFailure, session],
  )
}
