import { MyNamesList } from '@/features/dashboard/components/MyNamesList'
import type { SmartNameFilters } from '@/features/dashboard/smartNameSearch'

interface AiNamesResultsProps {
  readonly filters: SmartNameFilters
  readonly names?: readonly string[]
  readonly migrationEnabled?: boolean
  readonly primaryLabel?: string | null
  readonly favoriteLabels: ReadonlySet<string>
  readonly isAuthenticated: boolean
  readonly onToggleFavorite: (label: string) => void
  readonly selectedLabels?: ReadonlySet<string>
  readonly onToggleSelect?: (label: string) => void
}

export const AiNamesResults = ({
  filters,
  names,
  migrationEnabled,
  primaryLabel,
  favoriteLabels,
  isAuthenticated,
  onToggleFavorite,
  selectedLabels,
  onToggleSelect,
}: AiNamesResultsProps) => (
  <MyNamesList
    exactNames={names}
    favoriteLabels={favoriteLabels}
    isAuthenticated={isAuthenticated}
    migrationEnabled={migrationEnabled}
    onToggleFavorite={onToggleFavorite}
    onToggleSelect={onToggleSelect}
    primaryLabel={primaryLabel}
    selectedLabels={selectedLabels}
    selectionEnabled={!!onToggleSelect}
    smartFilters={filters}
    sort={filters.sort ?? 'name-asc'}
  />
)
