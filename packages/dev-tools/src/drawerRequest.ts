export type DevDrawerTool = 'drawer' | 'time-travel' | 'migration' | 'design-qa'

export type DevDrawerTab = 'time-travel' | 'migration' | 'dqa'

export type DevDrawerCapabilities = {
  readonly isTimeTravelEnabled: boolean
  readonly isMigrationEnabled: boolean
  readonly isDesignQaEnabled: boolean
}

export type DevDrawerOpenRequest =
  | { readonly status: 'none' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'open'; readonly tab: DevDrawerTab }

export const getDevDrawerOpenRequest = ({
  tool,
  activeTab,
  capabilities,
}: {
  readonly tool?: DevDrawerTool
  readonly activeTab?: string | null
  readonly capabilities: DevDrawerCapabilities
}): DevDrawerOpenRequest => {
  if (!tool) return { status: 'none' }
  const enabledTabs: readonly DevDrawerTab[] = [
    ...(capabilities.isTimeTravelEnabled ? ['time-travel' as const] : []),
    ...(capabilities.isMigrationEnabled ? ['migration' as const] : []),
    ...(capabilities.isDesignQaEnabled ? ['dqa' as const] : []),
  ]
  const requestedTabs = {
    'time-travel': 'time-travel',
    migration: 'migration',
    'design-qa': 'dqa',
  } as const
  const tab =
    tool === 'drawer'
      ? (enabledTabs.find((candidate) => candidate === activeTab) ??
        enabledTabs[0])
      : enabledTabs.find((candidate) => candidate === requestedTabs[tool])
  return tab ? { status: 'open', tab } : { status: 'unavailable' }
}
