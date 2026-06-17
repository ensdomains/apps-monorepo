interface EditProfileDialogStatusInput {
  readonly errorMessage?: string
}

export interface EditProfileDialogStatus {
  readonly kind: 'error'
  readonly message: string
}

export const getEditProfileDialogStatus = ({
  errorMessage,
}: EditProfileDialogStatusInput): EditProfileDialogStatus | undefined => {
  if (errorMessage) {
    return {
      kind: 'error',
      message: errorMessage,
    }
  }

  return undefined
}
