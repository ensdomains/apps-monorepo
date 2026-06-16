import { UploadCropStep } from './ProfileImageCropper'
import type { ProfileImageFieldProps } from './ProfileImageField.types'
import {
  ActiveImageOptions,
  DefaultImageField,
} from './ProfileImageFieldPanels'
import {
  ManualInputStep,
  ManualPreviewStep,
  RemoveConfirmationStep,
} from './ProfileImageFieldSteps'
import { useProfileImageField } from './useProfileImageField'

export type { ProfileImageKind } from './ProfileImageField.types'

export const ProfileImageField = (props: ProfileImageFieldProps) => {
  const { isActive, disabled, kind, name, onActivate } = props
  const editor = useProfileImageField(props)

  const renderActiveContent = () => {
    if (editor.state.matches('uploadPreview')) {
      return (
        <UploadCropStep
          cropImageSize={editor.cropImageSize}
          cropOffset={editor.cropOffset}
          cropZoom={editor.cropZoom}
          disabled={disabled}
          error={editor.state.context.error}
          isCropping={editor.isCropping}
          isUploading={editor.isUploading}
          kind={kind}
          onBack={() => editor.send({ type: 'BACK' })}
          onConfirm={editor.handleConfirmCrop}
          onCropImageLoad={editor.handleCropImageLoad}
          onCropOffsetChange={editor.handleCropOffsetChange}
          onCropZoomChange={editor.handleCropZoomChange}
          uploadFile={editor.uploadFile}
          uploadPreviewUrl={editor.uploadPreviewUrl}
        />
      )
    }

    if (editor.state.matches({ manualInput: 'entering' })) {
      return (
        <ManualInputStep
          disabled={disabled}
          error={editor.state.context.error}
          manualUrl={editor.state.context.manualUrl}
          onBack={() => editor.send({ type: 'BACK' })}
          onManualUrlChange={(url) =>
            editor.send({ type: 'UPDATE_MANUAL_URL', url })
          }
          onPreviewManualUrl={() => editor.send({ type: 'PREVIEW_MANUAL_URL' })}
        />
      )
    }

    if (editor.state.matches({ manualInput: 'previewing' })) {
      return (
        <ManualPreviewStep
          disabled={disabled}
          error={editor.state.context.error}
          kind={kind}
          manualUrl={editor.state.context.manualUrl}
          onBack={() => editor.send({ type: 'BACK' })}
          onImageError={editor.handleManualPreviewError}
          onUseImage={() => editor.send({ type: 'CONFIRM_MANUAL_URL' })}
        />
      )
    }

    if (editor.state.matches('removeConfirmation')) {
      return (
        <RemoveConfirmationStep
          disabled={disabled}
          displayImage={editor.displayImage}
          kind={kind}
          onBack={() => editor.send({ type: 'BACK' })}
          onConfirm={() => editor.send({ type: 'CONFIRM_REMOVAL' })}
        />
      )
    }

    return (
      <ActiveImageOptions
        disabled={disabled}
        displayImage={editor.displayImage}
        error={editor.state.context.error}
        hasImage={editor.hasImage}
        kind={kind}
        name={name}
        onCancel={editor.handleCancel}
        onDragOver={editor.handleDragOver}
        onDrop={editor.handleDrop}
        onManual={editor.handleManualClick}
        onRemove={editor.handleRemoveClick}
        onUpload={editor.handleUploadClick}
      />
    )
  }

  return (
    <>
      {isActive ? (
        renderActiveContent()
      ) : (
        <DefaultImageField
          disabled={disabled}
          displayImage={editor.displayImage}
          hasImage={editor.hasImage}
          kind={kind}
          name={name}
          onActivate={onActivate}
          onDragOver={editor.handleDragOver}
          onDrop={editor.handleDrop}
        />
      )}
      <input
        accept="image/*"
        className="hidden"
        onChange={editor.handleFileChange}
        ref={editor.fileInputRef}
        type="file"
      />
    </>
  )
}
