import type React from 'react'
import { MSymbol } from '@/components/ui/material-symbol'
import { cn } from '@/lib/utils'
import { fieldShellClassName, getTitle } from './ProfileImageField.helpers'
import type { ProfileImageKind } from './ProfileImageField.types'
import { ErrorMessage } from './ProfileImageFieldPanels'
import { DisplayImage } from './ProfileImagePreview'

interface BackButtonProps {
  readonly disabled?: boolean
  readonly onBack: () => void
}

const BackButton = ({ disabled, onBack }: BackButtonProps) => (
  <button
    aria-label="Back to image options"
    className="absolute top-1.5 left-1.5 flex size-12 items-center justify-center rounded-sm border border-ens-quartz-200 bg-ens-quartz-50 text-ens-quartz-500 transition-colors hover:bg-ens-quartz-100 disabled:pointer-events-none disabled:opacity-50"
    disabled={disabled}
    onClick={onBack}
    type="button"
  >
    <MSymbol aria-hidden="true" style={{ fontSize: 20 }} symbol="arrow_back" />
  </button>
)

interface StepPanelProps {
  readonly backDisabled?: boolean
  readonly children: React.ReactNode
  readonly onBack: () => void
}

const StepPanel = ({ backDisabled, children, onBack }: StepPanelProps) => (
  <div
    className={cn(
      'relative flex min-h-[240px] w-full items-start justify-center p-4',
      fieldShellClassName,
    )}
  >
    <BackButton disabled={backDisabled} onBack={onBack} />
    <div className="flex w-full max-w-[380px] flex-col items-center gap-4 pt-2">
      {children}
    </div>
  </div>
)

const editPreviewClassName = (kind: ProfileImageKind) =>
  cn(
    kind === 'avatar'
      ? 'size-[160px] rounded-[12px]'
      : 'h-[126px] w-full rounded-sm',
    'object-cover',
  )

interface ManualInputStepProps {
  readonly disabled?: boolean
  readonly error: string | null
  readonly manualUrl: string
  readonly onBack: () => void
  readonly onManualUrlChange: (url: string) => void
  readonly onPreviewManualUrl: () => void
}

export const ManualInputStep = ({
  disabled,
  error,
  manualUrl,
  onBack,
  onManualUrlChange,
  onPreviewManualUrl,
}: ManualInputStepProps) => (
  <StepPanel backDisabled={disabled} onBack={onBack}>
    <p className="text-[16px] text-ens-quartz-500 leading-[1.2]">
      Enter manually
    </p>
    <p className="max-w-[290px] text-center text-[12px] text-ens-quartz-400 leading-[1.2]">
      Paste an image URL. Supported formats include JPG, PNG, GIF, and WebP.
    </p>
    <input
      className="h-10 w-full rounded-sm border border-[#d4d4d4] bg-transparent px-3 text-[12px] text-ens-quartz-900 outline-none transition-colors placeholder:text-ens-quartz-350 focus-visible:border-ens-lapis-500"
      disabled={disabled}
      onChange={(event) => onManualUrlChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          onPreviewManualUrl()
        }
      }}
      placeholder="https://example.com/image.jpg"
      value={manualUrl}
    />
    <button
      className="flex h-10 items-center justify-center rounded-sm bg-ens-lapis-100 px-5 font-mono text-[11px] text-ens-lapis-500 uppercase tracking-[1.32px] transition-colors hover:bg-ens-lapis-100/80 disabled:pointer-events-none disabled:opacity-50"
      disabled={disabled || manualUrl.trim() === ''}
      onClick={onPreviewManualUrl}
      type="button"
    >
      Confirm
    </button>
    <ErrorMessage error={error} />
  </StepPanel>
)

interface ManualPreviewStepProps {
  readonly disabled?: boolean
  readonly error: string | null
  readonly kind: ProfileImageKind
  readonly manualUrl: string
  readonly onBack: () => void
  readonly onImageError: () => void
  readonly onUseImage: () => void
}

export const ManualPreviewStep = ({
  disabled,
  error,
  kind,
  manualUrl,
  onBack,
  onImageError,
  onUseImage,
}: ManualPreviewStepProps) => (
  <StepPanel backDisabled={disabled} onBack={onBack}>
    <p className="text-[16px] text-ens-quartz-500 leading-[1.2]">
      Preview image
    </p>
    <img
      alt="Manual URL preview"
      className={editPreviewClassName(kind)}
      onError={onImageError}
      src={manualUrl}
    />
    <button
      className="flex h-10 items-center justify-center rounded-sm bg-ens-lapis-100 px-5 font-mono text-[11px] text-ens-lapis-500 uppercase tracking-[1.32px] transition-colors hover:bg-ens-lapis-100/80 disabled:pointer-events-none disabled:opacity-50"
      disabled={disabled}
      onClick={onUseImage}
      type="button"
    >
      Use image
    </button>
    <ErrorMessage error={error} />
  </StepPanel>
)

interface RemoveConfirmationStepProps {
  readonly disabled?: boolean
  readonly displayImage?: string | null
  readonly kind: ProfileImageKind
  readonly onBack: () => void
  readonly onConfirm: () => void
}

export const RemoveConfirmationStep = ({
  disabled,
  displayImage,
  kind,
  onBack,
  onConfirm,
}: RemoveConfirmationStepProps) => (
  <StepPanel backDisabled={disabled} onBack={onBack}>
    <p className="max-w-[320px] text-center text-[12px] text-ens-quartz-400 leading-[1.2]">
      Remove current {getTitle(kind)} and replace it with your generated profile
      default.
    </p>
    <div className="flex items-center gap-8">
      <DisplayImage
        alt={`Current ${getTitle(kind)}`}
        className={cn(
          kind === 'avatar'
            ? 'size-[100px] rounded-[12px]'
            : 'h-[84px] w-[150px] rounded-sm',
          'object-cover',
        )}
        fallback={
          <div className="flex size-[100px] items-center justify-center rounded-sm bg-ens-quartz-100 text-ens-quartz-400">
            <MSymbol
              aria-hidden="true"
              style={{ fontSize: 28 }}
              symbol={kind === 'avatar' ? 'face' : 'wall_art'}
            />
          </div>
        }
        src={displayImage}
      />
      <MSymbol
        aria-hidden="true"
        className="text-ens-quartz-400"
        style={{ fontSize: 22 }}
        symbol="arrow_forward"
      />
      <div
        className={cn(
          kind === 'avatar'
            ? 'size-[100px] rounded-[12px]'
            : 'h-[84px] w-[150px] rounded-sm',
          'bg-ens-quartz-100',
        )}
      />
    </div>
    <div className="flex items-center gap-3">
      <button
        className="h-10 rounded-sm px-5 font-mono text-[11px] text-ens-quartz-700 uppercase tracking-[1.32px] transition-colors hover:bg-ens-quartz-100 disabled:pointer-events-none disabled:opacity-50"
        disabled={disabled}
        onClick={onBack}
        type="button"
      >
        Cancel
      </button>
      <button
        className="h-10 rounded-sm bg-ens-lapis-100 px-5 font-mono text-[11px] text-ens-lapis-500 uppercase tracking-[1.32px] transition-colors hover:bg-ens-lapis-100/80 disabled:pointer-events-none disabled:opacity-50"
        disabled={disabled}
        onClick={onConfirm}
        type="button"
      >
        Remove
      </button>
    </div>
  </StepPanel>
)
