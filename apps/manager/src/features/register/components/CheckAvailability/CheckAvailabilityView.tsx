import type { ChangeEvent } from 'react'
import { SearchField } from '@/components/molecules/SearchField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  RegistrationPanel,
  type RegistrationPanelProps,
} from './components/RegistrationPanel'

export type CheckAvailabilityViewProps = {
  inputValue: string
  onInputChange: (event: ChangeEvent<HTMLInputElement>) => void
  onSearch: (value: string) => void
  isSearching: boolean
  isProcessing: boolean
  errorMessage?: string | null
  successMessage?: string | null
  panelProps?: RegistrationPanelProps | null
}

export const CheckAvailabilityView = ({
  inputValue,
  onInputChange,
  onSearch,
  isSearching,
  isProcessing,
  errorMessage,
  successMessage,
  panelProps,
}: CheckAvailabilityViewProps) => {
  return (
    <div className="relative space-y-1">
      <SearchField
        placeholder="Search for a name"
        value={inputValue}
        onChange={onInputChange}
        onSearch={onSearch}
        disabled={isProcessing || isSearching}
        className="w-full"
      />

      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {panelProps && (
        <RegistrationPanel
          isOpen={panelProps.isOpen}
          result={panelProps.result}
          pricing={panelProps.pricing}
          selectedDuration={panelProps.selectedDuration}
          onSelectDuration={panelProps.onSelectDuration}
          onClose={panelProps.onClose}
          onConfirm={panelProps.onConfirm}
          isProcessing={panelProps.isProcessing}
          error={panelProps.error}
          registrationSuccess={panelProps.registrationSuccess}
        />
      )}

      {successMessage && (
        <Alert className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700">
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
