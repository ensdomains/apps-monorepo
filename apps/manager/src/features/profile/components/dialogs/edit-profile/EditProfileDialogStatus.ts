interface EditProfileDialogStatusInput {
  readonly errorMessage?: string
}

export interface EditProfileDialogStatus {
  readonly kind: 'error'
  readonly message: string
}

const getDisplayErrorMessage = (message: string) =>
  message
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join('\n')

export const getEditProfileDialogStatus = ({
  errorMessage,
}: EditProfileDialogStatusInput): EditProfileDialogStatus | undefined => {
  if (errorMessage) {
    return {
      kind: 'error',
      message: getDisplayErrorMessage(errorMessage),
    }
  }

  return undefined
}
