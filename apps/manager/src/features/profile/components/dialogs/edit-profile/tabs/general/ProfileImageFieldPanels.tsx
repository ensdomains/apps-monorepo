import type React from 'react'
import { type MaterialSymbol, MSymbol } from '@/components/ui/material-symbol'
import { cn } from '@/lib/utils'
import {
  dropZoneClassName,
  fieldShellClassName,
  getEmptyLabel,
  getRemoveLabel,
  getTitle,
} from './ProfileImageField.helpers'
import type { ProfileImageKind } from './ProfileImageField.types'
import { ProfileImagePreview } from './ProfileImagePreview'

interface ErrorMessageProps {
  readonly error: string | null
}

export const ErrorMessage = ({ error }: ErrorMessageProps) => {
  if (!error) return null

  return (
    <p
      className="text-center text-ens-signal-danger-600 text-xs leading-[1.2]"
      role="alert"
    >
      {error}
    </p>
  )
}

interface ProfileImageActionProps {
  readonly disabled?: boolean
  readonly icon: MaterialSymbol
  readonly label: string
  readonly onClick: () => void
}

const actionTextClassName =
  'font-mono text-[10px] text-ens-lapis-500 uppercase leading-none tracking-[1.2px]'

const ProfileImageAction = ({
  disabled,
  icon,
  label,
  onClick,
}: ProfileImageActionProps) => (
  <button
    className="flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-ens-lapis-100/50 disabled:pointer-events-none disabled:opacity-45"
    disabled={disabled}
    onClick={onClick}
    type="button"
  >
    <MSymbol
      aria-hidden="true"
      className="text-ens-lapis-900"
      style={{ fontSize: 14 }}
      symbol={icon}
    />
    <span className={actionTextClassName}>{label}</span>
  </button>
)

interface ImagePreviewProps {
  readonly displayImage?: string | null
  readonly hasImage: boolean
  readonly kind: ProfileImageKind
  readonly name: string
}

interface DefaultImageFieldProps extends ImagePreviewProps {
  readonly disabled?: boolean
  readonly onActivate: () => void
  readonly onDragOver: (event: React.DragEvent) => void
  readonly onDrop: (event: React.DragEvent) => void
}

export const DefaultImageField = ({
  disabled,
  displayImage,
  hasImage,
  kind,
  name,
  onActivate,
  onDragOver,
  onDrop,
}: DefaultImageFieldProps) => (
  <button
    className={cn(
      'flex h-[168px] w-full items-center justify-center overflow-hidden p-3 transition-colors hover:border-ens-quartz-350 focus-visible:border-ens-lapis-500 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
      dropZoneClassName,
    )}
    disabled={disabled}
    onClick={onActivate}
    onDragOver={onDragOver}
    onDrop={onDrop}
    title={`Edit ${getTitle(kind)}`}
    type="button"
  >
    {kind === 'avatar' ? (
      <div className="flex h-full w-[174px] flex-col items-center justify-center gap-3.5 py-3">
        <ProfileImagePreview
          displayImage={displayImage}
          hasImage={hasImage}
          kind={kind}
          name={name}
        />
        <span className="flex items-center gap-2 text-[14px] text-ens-quartz-400 tracking-[0.14px]">
          {hasImage ? getRemoveLabel(kind) : getEmptyLabel(kind)}
          <MSymbol
            aria-hidden="true"
            className={cn(!hasImage && 'ms-fill')}
            style={{ fontSize: 14 }}
            symbol={hasImage ? 'remove' : 'add'}
          />
        </span>
      </div>
    ) : (
      <ProfileImagePreview
        displayImage={displayImage}
        hasImage={hasImage}
        kind={kind}
        name={name}
      />
    )}
  </button>
)

interface CancelPreviewButtonProps extends ImagePreviewProps {
  readonly disabled?: boolean
  readonly onCancel: () => void
  readonly onDragOver: (event: React.DragEvent) => void
  readonly onDrop: (event: React.DragEvent) => void
}

const CancelPreviewButton = ({
  disabled,
  displayImage,
  hasImage,
  kind,
  name,
  onCancel,
  onDragOver,
  onDrop,
}: CancelPreviewButtonProps) => {
  if (kind === 'avatar') {
    return (
      <button
        className="flex h-[168px] w-[174px] shrink-0 flex-col items-center justify-center gap-3.5 py-3 text-ens-quartz-400 disabled:pointer-events-none disabled:opacity-50"
        disabled={disabled}
        onClick={onCancel}
        type="button"
      >
        <ProfileImagePreview
          displayImage={displayImage}
          hasImage={hasImage}
          kind={kind}
          name={name}
        />
        <span className="flex items-center gap-2 text-[14px] tracking-[0.14px]">
          Cancel
          <MSymbol aria-hidden="true" style={{ fontSize: 14 }} symbol="close" />
        </span>
      </button>
    )
  }

  return (
    <button
      className={cn(
        'flex h-[168px] min-w-0 flex-1 items-center justify-center overflow-hidden p-3 text-ens-quartz-500 disabled:pointer-events-none disabled:opacity-50',
        dropZoneClassName,
      )}
      disabled={disabled}
      onClick={onCancel}
      onDragOver={onDragOver}
      onDrop={onDrop}
      type="button"
    >
      {hasImage ? (
        <ProfileImagePreview
          displayImage={displayImage}
          hasImage={hasImage}
          kind={kind}
          name={name}
        />
      ) : (
        <span className="flex items-center gap-2 text-[14px] tracking-[0.14px]">
          Cancel
          <MSymbol aria-hidden="true" style={{ fontSize: 14 }} symbol="close" />
        </span>
      )}
    </button>
  )
}

interface ImageActionPanelProps {
  readonly disabled?: boolean
  readonly error: string | null
  readonly onManual: () => void
  readonly onRemove: () => void
  readonly onUpload: () => void
}

const ImageActionPanel = ({
  disabled,
  error,
  onManual,
  onRemove,
  onUpload,
}: ImageActionPanelProps) => (
  <div
    className={cn(
      'flex h-[168px] min-w-0 flex-1 items-center justify-center p-4',
      fieldShellClassName,
    )}
  >
    <div className="flex flex-col items-start">
      <ProfileImageAction
        disabled={disabled}
        icon="upload"
        label="Upload image"
        onClick={onUpload}
      />
      <ProfileImageAction
        disabled={disabled}
        icon="text_fields_alt"
        label="Enter manually"
        onClick={onManual}
      />
      <ProfileImageAction
        disabled={disabled}
        icon="remove"
        label="Remove"
        onClick={onRemove}
      />
      <ErrorMessage error={error} />
    </div>
  </div>
)

interface ActiveImageOptionsProps extends ImagePreviewProps {
  readonly disabled?: boolean
  readonly error: string | null
  readonly onCancel: () => void
  readonly onDragOver: (event: React.DragEvent) => void
  readonly onDrop: (event: React.DragEvent) => void
  readonly onManual: () => void
  readonly onRemove: () => void
  readonly onUpload: () => void
}

export const ActiveImageOptions = ({
  disabled,
  displayImage,
  error,
  hasImage,
  kind,
  name,
  onCancel,
  onDragOver,
  onDrop,
  onManual,
  onRemove,
  onUpload,
}: ActiveImageOptionsProps) => (
  <div className="flex w-full gap-3">
    <CancelPreviewButton
      disabled={disabled}
      displayImage={displayImage}
      hasImage={hasImage}
      kind={kind}
      name={name}
      onCancel={onCancel}
      onDragOver={onDragOver}
      onDrop={onDrop}
    />
    <ImageActionPanel
      disabled={disabled}
      error={error}
      onManual={onManual}
      onRemove={onRemove}
      onUpload={onUpload}
    />
  </div>
)
