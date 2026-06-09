import type { Hex } from 'viem'

interface EditProfileDialogStatusInput {
  readonly errorMessage?: string
  readonly isSuccess: boolean
  readonly txHash?: Hex
}

export type EditProfileDialogStatus =
  | {
      readonly kind: 'error'
      readonly message: string
    }
  | {
      readonly kind: 'success'
      readonly txHash?: Hex
    }

export const getEditProfileDialogStatus = ({
  errorMessage,
  isSuccess,
  txHash,
}: EditProfileDialogStatusInput): EditProfileDialogStatus | undefined => {
  if (errorMessage) {
    return {
      kind: 'error',
      message: errorMessage,
    }
  }

  if (isSuccess) {
    return txHash
      ? {
          kind: 'success',
          txHash,
        }
      : { kind: 'success' }
  }

  return undefined
}
